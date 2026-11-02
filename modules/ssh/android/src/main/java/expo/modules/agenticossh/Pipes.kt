package expo.modules.agenticossh

import java.io.ByteArrayOutputStream
import java.io.OutputStream

/**
 * Where JSch delivers one channel's incoming bytes. JSch writes from its session thread and
 * adjusts the window as soon as a write returns, so this pipe never makes that thread wait
 * except past `highWater` unread bytes (then the server is held back, as an unread libssh2
 * channel holds it back on iOS). JSch closes the pipe at the remote EOF, at the channel close
 * and when the session ends.
 */
internal class StreamPipe(private val highWater: Int = 4 * 1024 * 1024) : OutputStream() {
  sealed interface Take {
    class Data(val bytes: ByteArray) : Take

    /** The writer closed and every byte was taken. */
    object End : Take

    /** Nothing arrived in time; the pipe is still open. */
    object Idle : Take

    /** `abort` was called: whoever aborted owns the rest. */
    object Aborted : Take
  }

  private val lock = Object()
  private val chunks = ArrayDeque<ByteArray>()
  private var pending = 0
  private var ended = false
  private var aborted = false

  override fun write(b: Int) = write(byteArrayOf(b.toByte()), 0, 1)

  override fun write(b: ByteArray, off: Int, len: Int) {
    if (len <= 0) return
    synchronized(lock) {
      while (pending >= highWater && !aborted) lock.wait(250)
      if (aborted || ended) return
      chunks.addLast(b.copyOfRange(off, off + len))
      pending += len
      lock.notifyAll()
    }
  }

  override fun flush() {}

  override fun close() {
    synchronized(lock) {
      ended = true
      lock.notifyAll()
    }
  }

  fun abort() {
    synchronized(lock) {
      aborted = true
      chunks.clear()
      pending = 0
      lock.notifyAll()
    }
  }

  /** The next bytes, coalesced up to `maxBytes`; waits at most `waitMs` for any. */
  fun take(maxBytes: Int, waitMs: Long): Take {
    synchronized(lock) {
      val until = System.nanoTime() + waitMs * 1_000_000L
      while (chunks.isEmpty() && !ended && !aborted) {
        val left = (until - System.nanoTime()) / 1_000_000L
        if (left <= 0) return Take.Idle
        lock.wait(left)
      }
      if (aborted) return Take.Aborted
      if (chunks.isEmpty()) return Take.End
      val out = ByteArrayOutputStream(minOf(maxBytes, pending))
      while (chunks.isNotEmpty()) {
        val head = chunks.first()
        val room = maxBytes - out.size()
        if (room <= 0) break
        if (head.size <= room) {
          out.write(head)
          chunks.removeFirst()
        } else {
          out.write(head, 0, room)
          chunks[0] = head.copyOfRange(room, head.size)
        }
      }
      pending -= out.size()
      lock.notifyAll()
      return Take.Data(out.toByteArray())
    }
  }
}

/** Reads exact byte counts from a pipe (SFTP packets), each read bounded by a deadline. */
internal class PipeReader(private val pipe: StreamPipe) {
  private var current = ByteArray(0)
  private var offset = 0

  fun readFully(count: Int, deadline: Deadline): ByteArray {
    val out = ByteArray(count)
    var filled = 0
    while (filled < count) {
      if (offset == current.size) {
        when (val taken = pipe.take(256 * 1024, deadline.remainingMs())) {
          is StreamPipe.Take.Data -> {
            current = taken.bytes
            offset = 0
          }
          StreamPipe.Take.Idle -> throw SshFailure.timedOut
          StreamPipe.Take.End, StreamPipe.Take.Aborted -> throw SshFailure("unexpectedEOF")
        }
        continue
      }
      val n = minOf(count - filled, current.size - offset)
      System.arraycopy(current, offset, out, filled, n)
      offset += n
      filled += n
    }
    return out
  }
}

/**
 * Collects a one-shot response: the first newline-terminated line, bounded by `maxBytes`
 * (newline included), as the iOS package's exchangeStreamLocal answers.
 */
internal class LineCollector(private val maxBytes: Int) : OutputStream() {
  private val lock = Object()
  private val buffer = ByteArrayOutputStream()
  private var line: ByteArray? = null
  private var failure: SshFailure? = null
  private var ended = false

  override fun write(b: Int) = write(byteArrayOf(b.toByte()), 0, 1)

  override fun write(b: ByteArray, off: Int, len: Int) {
    synchronized(lock) {
      if (line != null || failure != null) return
      var newline = -1
      for (index in off until off + len) {
        if (b[index] == NEWLINE) {
          newline = index
          break
        }
      }
      val taking = if (newline >= 0) newline - off + 1 else len
      if (buffer.size() + taking > maxBytes) {
        failure = SshFailure("responseTooLarge", "response over $maxBytes bytes")
      } else {
        buffer.write(b, off, taking)
        if (newline >= 0) line = buffer.toByteArray()
      }
      lock.notifyAll()
    }
  }

  override fun close() {
    synchronized(lock) {
      ended = true
      lock.notifyAll()
    }
  }

  fun await(deadline: Deadline): ByteArray {
    synchronized(lock) {
      while (true) {
        line?.let { return it }
        failure?.let { throw it }
        if (ended) throw SshFailure("unexpectedEOF")
        val wait = deadline.remainingMs()
        if (wait <= 0) throw SshFailure.timedOut
        lock.wait(wait)
      }
    }
  }

  private companion object {
    const val NEWLINE = '\n'.code.toByte()
  }
}
