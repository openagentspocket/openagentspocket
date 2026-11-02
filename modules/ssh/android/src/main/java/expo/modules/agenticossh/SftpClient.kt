package expo.modules.agenticossh

import com.jcraft.jsch.ChannelSubsystem
import java.io.ByteArrayOutputStream
import java.io.IOException

/**
 * A small SFTP v3 client over one subsystem channel. JSch's own ChannelSftp globs paths, renames
 * with overwrite and cannot create exclusively; this one does what the iOS package does: missing
 * paths answer null (stat, list, read), writes create with O_EXCL and the given mode, `rename`
 * either overwrites atomically (posix-rename@openssh.com) or never (plain SSH_FXP_RENAME), and
 * every other status is `sftpFailure`. One operation at a time; reads and writes are pipelined.
 * A timeout or a malformed reply leaves the stream out of step, so the client stops (later calls
 * answer `sftpUnavailable`).
 */
internal class SftpClient private constructor(
  private val connection: SshConnection,
  private val channel: ChannelSubsystem,
  pipe: StreamPipe,
) {
  private val reader = PipeReader(pipe)
  private val output = channel.outputStream
  private var nextId = 1
  private var broken = false

  companion object {
    private const val READ_CHUNK = 64 * 1024
    private const val WRITE_CHUNK = 32 * 1024
    private const val PIPELINE = 16

    fun open(connection: SshConnection, timeoutMs: Long): SftpClient {
      val deadline = Deadline(timeoutMs)
      val pipe = StreamPipe()
      val channel = connection.openSftpSubsystem(deadline.remainingMs(), pipe)
      val client = SftpClient(connection, channel, pipe)
      try {
        client.send(SftpRequest(Sftp.INIT, null).int(3))
        if (client.receive(deadline).type != Sftp.VERSION) throw SftpProtocolError()
      } catch (error: Exception) {
        client.close()
        throw if (error is SshFailure && error.code == "timedOut") error else SshFailure("sftpUnavailable")
      }
      return client
    }

    private fun checkPath(path: String) {
      if (path.isEmpty() || path.contains('\u0000')) throw SshFailure.channelFailed
    }

    private fun checkMode(mode: Int) {
      if (mode and 0b111_111_111.inv() != 0) throw SshFailure.channelFailed
    }
  }

  fun close() {
    channel.disconnect()
  }

  fun stat(path: String, followSymlinks: Boolean, timeoutMs: Long): SftpAttrs? {
    checkPath(path)
    return operation(timeoutMs) { deadline -> statLocked(path, followSymlinks, deadline) }
  }

  fun list(path: String, query: SftpQuery, timeoutMs: Long): Triple<List<SftpEntry>, Boolean, Boolean>? {
    checkPath(path)
    return operation(timeoutMs) { deadline ->
      openHandle(SftpRequest(Sftp.OPENDIR, nextId()).string(path), deadline)?.let { handle ->
        withHandle(handle, deadline) {
          val matches = ArrayList<SftpEntry>()
          var scanned = 0
          var complete = false
          while (scanned < query.maxScanned) {
            val reply = call(SftpRequest(Sftp.READDIR, nextId()).string(handle), deadline)
            if (reply.type == Sftp.STATUS) {
              val status = reply.int()
              if (status != Sftp.FX_EOF) throw SshFailure.sftpStatus(status)
              complete = true
              break
            }
            if (reply.type != Sftp.NAME) throw SftpProtocolError()
            repeat(reply.int()) {
              val name = String(reply.string(), Charsets.UTF_8)
              reply.string() // longname
              val entry = SftpEntry(name, reply.attrs())
              if (scanned < query.maxScanned) {
                scanned++
                if (query.matches(entry)) matches.add(entry)
              }
            }
          }
          val sorted = matches.sortedBy { it.name }
          Triple(sorted.take(query.maxEntries), sorted.size > query.maxEntries, !complete)
        }
      }
    }
  }

  fun read(path: String, timeoutMs: Long): ByteArray? {
    checkPath(path)
    return operation(timeoutMs) { deadline ->
      openHandle(openRequest(path, Sftp.FXF_READ), deadline)?.let { handle ->
        withHandle(handle, deadline) { readHandle(handle, 0, Long.MAX_VALUE, deadline) }
      }
    }
  }

  /** At most `maxBytes` from `offset`, and the file's size; `length` is null when it is gone. */
  fun readRange(path: String, offset: Long, maxBytes: Int, timeoutMs: Long): Pair<ByteArray, Long?> {
    checkPath(path)
    return operation(timeoutMs) { deadline ->
      val attrs = statLocked(path, true, deadline) ?: return@operation ByteArray(0) to null
      val handle = openHandle(openRequest(path, Sftp.FXF_READ), deadline) ?: return@operation ByteArray(0) to null
      val data = withHandle(handle, deadline) { readHandle(handle, offset, maxBytes.toLong(), deadline) }
      data to (attrs.size ?: (offset + data.size))
    }
  }

  /** Creates `path` (it must not exist) with `mode`, then writes `data`. */
  fun write(path: String, data: ByteArray, mode: Int, timeoutMs: Long) {
    checkPath(path)
    checkMode(mode)
    operation(timeoutMs) { deadline ->
      val flags = Sftp.FXF_WRITE or Sftp.FXF_CREAT or Sftp.FXF_EXCL
      val handle = openHandle(openRequest(path, flags).permissions(mode), deadline, missingIsNull = false)!!
      withHandle(handle, deadline) { writeHandle(handle, data, deadline) }
    }
  }

  fun rename(from: String, to: String, overwrite: Boolean, timeoutMs: Long) {
    checkPath(from)
    checkPath(to)
    simple(timeoutMs) {
      if (overwrite) {
        SftpRequest(Sftp.EXTENDED, nextId()).string("posix-rename@openssh.com").string(from).string(to)
      } else {
        SftpRequest(Sftp.RENAME, nextId()).string(from).string(to)
      }
    }
  }

  fun unlink(path: String, timeoutMs: Long) {
    checkPath(path)
    simple(timeoutMs) { SftpRequest(Sftp.REMOVE, nextId()).string(path) }
  }

  fun mkdir(path: String, mode: Int, timeoutMs: Long) {
    checkPath(path)
    checkMode(mode)
    simple(timeoutMs) { SftpRequest(Sftp.MKDIR, nextId()).string(path).permissions(mode) }
  }

  fun rmdir(path: String, timeoutMs: Long) {
    checkPath(path)
    simple(timeoutMs) { SftpRequest(Sftp.RMDIR, nextId()).string(path) }
  }

  fun chmod(path: String, mode: Int, timeoutMs: Long) {
    checkPath(path)
    checkMode(mode)
    simple(timeoutMs) { SftpRequest(Sftp.SETSTAT, nextId()).string(path).permissions(mode) }
  }

  // MARK: Plumbing (callers hold the lock through `operation`)

  @Synchronized
  private fun <T> operation(timeoutMs: Long, body: (Deadline) -> T): T {
    if (broken) throw SshFailure("sftpUnavailable")
    try {
      return body(Deadline(timeoutMs))
    } catch (error: SftpProtocolError) {
      broken = true
      throw SshFailure.channelFailed
    } catch (error: IOException) {
      broken = true
      throw connection.failureAfterOpen()
    } catch (error: SshFailure) {
      if (error.code == "timedOut" || error.code == "unexpectedEOF") {
        broken = true
        if (error.code == "unexpectedEOF") throw connection.failureAfterOpen()
      }
      throw error
    }
  }

  private fun nextId(): Int = nextId++

  /** One request (built under the lock) whose answer is a plain status. */
  private fun simple(timeoutMs: Long, request: () -> SftpRequest) =
    operation(timeoutMs) { deadline -> checkOk(call(request(), deadline)) }

  private fun openRequest(path: String, flags: Int) = SftpRequest(Sftp.OPEN, nextId()).string(path).int(flags).also {
    if (flags and Sftp.FXF_CREAT == 0) it.int(0) // no attributes
  }

  private fun statLocked(path: String, follow: Boolean, deadline: Deadline): SftpAttrs? {
    val reply = call(SftpRequest(if (follow) Sftp.STAT else Sftp.LSTAT, nextId()).string(path), deadline)
    return when (reply.type) {
      Sftp.ATTRS -> reply.attrs()
      Sftp.STATUS -> missingOrThrow(reply.int())
      else -> throw SftpProtocolError()
    }
  }

  private fun openHandle(request: SftpRequest, deadline: Deadline, missingIsNull: Boolean = true): ByteArray? {
    val reply = call(request, deadline)
    return when (reply.type) {
      Sftp.HANDLE -> reply.string()
      Sftp.STATUS -> {
        val status = reply.int()
        if (missingIsNull) missingOrThrow(status) else throw SshFailure.sftpStatus(status)
      }
      else -> throw SftpProtocolError()
    }
  }

  private fun <T> missingOrThrow(status: Int): T? =
    if (status == Sftp.FX_NO_SUCH_FILE) null else throw SshFailure.sftpStatus(status)

  /** Runs `body`, then closes the handle; a failed body still closes it, best effort. */
  private fun <T> withHandle(handle: ByteArray, deadline: Deadline, body: () -> T): T {
    val result =
      try {
        body()
      } catch (error: Exception) {
        if (error !is SftpProtocolError && !(error is SshFailure && error.code == "timedOut")) {
          runCatching { checkOk(call(SftpRequest(Sftp.CLOSE, nextId()).string(handle), Deadline(2_000))) }
        }
        throw error
      }
    checkOk(call(SftpRequest(Sftp.CLOSE, nextId()).string(handle), deadline))
    return result
  }

  private fun checkOk(reply: SftpReply) {
    if (reply.type != Sftp.STATUS) throw SftpProtocolError()
    val status = reply.int()
    if (status != Sftp.FX_OK) throw SshFailure.sftpStatus(status)
  }

  /** Reads from `start` until EOF or `limit` bytes, keeping up to [PIPELINE] reads in flight. */
  private fun readHandle(handle: ByteArray, start: Long, limit: Long, deadline: Deadline): ByteArray {
    val out = ByteArrayOutputStream()
    val end = if (limit == Long.MAX_VALUE) Long.MAX_VALUE else start + limit
    var expected = start // the offset of the next byte the result needs
    var requested = start
    val inFlight = ArrayDeque<Triple<Int, Long, Int>>() // id, offset, length
    while (expected < end) {
      while (inFlight.size < PIPELINE && requested < end) {
        val length = minOf(READ_CHUNK.toLong(), end - requested).toInt()
        val request = SftpRequest(Sftp.READ, nextId()).string(handle).long(requested).int(length)
        send(request)
        inFlight.addLast(Triple(request.id!!, requested, length))
        requested += length
      }
      val (id, offset, length) = inFlight.removeFirst()
      val reply = receive(deadline)
      if (reply.id != id || offset != expected) throw SftpProtocolError()
      if (reply.type == Sftp.STATUS) {
        val status = reply.int()
        drain(inFlight, deadline)
        if (status != Sftp.FX_EOF) throw SshFailure.sftpStatus(status)
        break
      }
      if (reply.type != Sftp.DATA) throw SftpProtocolError()
      val data = reply.string()
      if (data.size > length) throw SftpProtocolError()
      if (data.isEmpty()) {
        drain(inFlight, deadline)
        break
      }
      out.write(data)
      expected += data.size
      if (data.size < length) {
        // A short read leaves a gap before what is in flight: drop those answers and ask again.
        drain(inFlight, deadline)
        requested = expected
      }
    }
    drain(inFlight, deadline)
    return out.toByteArray()
  }

  private fun drain(inFlight: ArrayDeque<Triple<Int, Long, Int>>, deadline: Deadline) {
    while (inFlight.isNotEmpty()) {
      val (id) = inFlight.removeFirst()
      if (receive(deadline).id != id) throw SftpProtocolError()
    }
  }

  /** Writes `data` from offset 0, keeping up to [PIPELINE] writes in flight. */
  private fun writeHandle(handle: ByteArray, data: ByteArray, deadline: Deadline) {
    val inFlight = ArrayDeque<Int>()
    var offset = 0
    var failure: SshFailure? = null
    while (offset < data.size || inFlight.isNotEmpty()) {
      while (failure == null && offset < data.size && inFlight.size < PIPELINE) {
        val length = minOf(WRITE_CHUNK, data.size - offset)
        val chunk = data.copyOfRange(offset, offset + length)
        val request = SftpRequest(Sftp.WRITE, nextId()).string(handle).long(offset.toLong()).string(chunk)
        send(request)
        inFlight.addLast(request.id!!)
        offset += length
      }
      if (inFlight.isEmpty()) break
      val reply = receive(deadline)
      if (reply.id != inFlight.removeFirst() || reply.type != Sftp.STATUS) throw SftpProtocolError()
      val status = reply.int()
      if (status != Sftp.FX_OK && failure == null) failure = SshFailure.sftpStatus(status)
    }
    failure?.let { throw it }
  }

  private fun call(request: SftpRequest, deadline: Deadline): SftpReply {
    send(request)
    val reply = receive(deadline)
    if (reply.id != request.id) throw SftpProtocolError()
    return reply
  }

  private fun send(request: SftpRequest) {
    output.write(request.bytes())
    output.flush()
  }

  private fun receive(deadline: Deadline): SftpReply {
    val header = reader.readFully(4, deadline)
    val length =
      ((header[0].toInt() and 0xff) shl 24) or ((header[1].toInt() and 0xff) shl 16) or
        ((header[2].toInt() and 0xff) shl 8) or (header[3].toInt() and 0xff)
    if (length <= 0 || length > Sftp.MAX_PACKET) throw SftpProtocolError()
    return SftpReply(reader.readFully(length, deadline))
  }
}
