package expo.modules.agenticossh

import android.util.Base64
import com.jcraft.jsch.Channel
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import java.io.File

/**
 * The operations behind the module's functions, the Android twin of ios/Module/SSHBridge.swift.
 * Bytes cross to JavaScript as base64; ids name every native object. Host Key policy (pinning,
 * TOFU) runs in JavaScript between `connect` and `authenticate`, so authentication never begins
 * before the key was accepted. Every call blocks its (IO) thread; the module never calls these
 * on the JavaScript or main thread.
 */
internal class SshBridge(keyDirectory: File, private val events: BridgeEvents) {
  private val registry = BridgeRegistry()
  private val keys = DeviceKeyStore(keyDirectory)

  private companion object {
    const val CHUNK = 32 * 1024

    /** Sustained ceiling for one stream's events (see `pump`). */
    const val MAX_BYTES_PER_SECOND = 3_000_000L

    /** One wait for bytes lasts this long, then waits again; not an idle limit. */
    const val READ_POLL_MS = 30_000L
    const val EXIT_STATUS_WAIT_MS = 2_000L
  }

  // MARK: Device keys

  fun generateKey(alias: String): String = keys.loadOrCreate(checkAlias(alias)).openSSHLine

  fun publicKey(alias: String): String? = keys.load(checkAlias(alias))?.openSSHLine

  fun deleteKey(alias: String) = keys.delete(checkAlias(alias))

  private fun checkAlias(alias: String): String {
    if (alias.isEmpty() || alias.length > 256) throw SshFailure.invalidArgument("key alias")
    return alias
  }

  // MARK: Connections

  /** Handshake only: the caller verifies the returned Host Key, then `authenticate`s or `disconnect`s. */
  fun connect(host: String, port: Int, timeoutMs: Long): Map<String, Any?> {
    val (connection, hello) = SshConnection.connect(host, port, timeoutMs)
    val sessionId = registry.add(connection)
    return mapOf(
      "sessionId" to sessionId,
      "hostKeyAlgorithm" to SshWire.algorithm(hello.hostKey),
      "hostKeyFingerprint" to SshWire.fingerprint(hello.hostKey),
      "hostKey" to encode(hello.hostKey),
      "serverIdentification" to hello.serverIdentification,
    )
  }

  fun authenticate(sessionId: String, username: String, keyAlias: String, timeoutMs: Long) {
    val connection = registry.connection(sessionId)
    val key = keys.load(checkAlias(keyAlias)) ?: throw SshFailure("keyNotFound")
    connection.authenticate(username, DeviceKeyIdentity(key), null, timeoutMs)
  }

  /**
   * Authentication with a credential that is not a stored key: a password, a Bootstrap Key seed
   * (base64 of the raw Ed25519 seed) or an RSA private key in PEM text. The secret lives only
   * for this call.
   */
  fun authenticateWith(sessionId: String, username: String, kind: String, secret: String, timeoutMs: Long) {
    val connection = registry.connection(sessionId)
    when (kind) {
      "password" -> connection.authenticate(username, null, secret, timeoutMs)
      "seed" -> {
        val seed =
          try {
            Base64.decode(secret, Base64.DEFAULT)
          } catch (error: IllegalArgumentException) {
            null
          }
        if (seed == null || seed.size != 32) throw SshFailure.invalidArgument("seed")
        val key = DeviceKey(Ed25519PrivateKeyParameters(seed, 0))
        seed.fill(0)
        connection.authenticate(username, DeviceKeyIdentity(key), null, timeoutMs)
      }
      "privateKey" -> connection.authenticate(username, RsaKeyIdentity.parse(secret), null, timeoutMs)
      else -> throw SshFailure.invalidArgument("credential kind")
    }
  }

  /** Closes the connection and everything opened on it. Idempotent. */
  fun disconnect(sessionId: String) {
    val (connection, children) = registry.removeConnection(sessionId) ?: return
    children.forwards.forEach { it.stop() }
    for (stream in children.streams) {
      stream.shutdown()
      events.closed(stream.id, "disconnected", null)
    }
    children.sftpClients.forEach { it.close() }
    connection.close()
  }

  fun disconnectAll() = registry.allConnectionIds().forEach { disconnect(it) }

  fun isConnected(sessionId: String): Boolean = registry.connectionOrNull(sessionId)?.isConnected == true

  // MARK: One-shot requests

  fun exec(sessionId: String, command: String, input: String?, timeoutMs: Long): Map<String, Any?> {
    val connection = registry.connection(sessionId)
    val result = connection.exec(command, decode(input ?: ""), timeoutMs)
    return mapOf(
      "exitCode" to result.exitStatus,
      "stdout" to String(result.stdout, Charsets.UTF_8),
      "stderr" to String(result.stderr, Charsets.UTF_8),
    )
  }

  fun exchangeStreamLocal(sessionId: String, socketPath: String, request: String, maxBytes: Int, timeoutMs: Long): String {
    val connection = registry.connection(sessionId)
    val response = connection.exchangeStreamLocal(socketPath, decode(request), maxOf(1, maxBytes), timeoutMs)
    return encode(response)
  }

  // MARK: Streams

  fun openStreamLocal(sessionId: String, socketPath: String, timeoutMs: Long): String {
    val pipe = StreamPipe()
    val channel = registry.connection(sessionId).openStreamLocal(socketPath, timeoutMs, pipe)
    return register(sessionId, channel, pipe)
  }

  /** A PTY running `command` directly (no login shell is implied). */
  fun openPty(sessionId: String, command: String, term: String, cols: Int, rows: Int, timeoutMs: Long): String {
    if (cols <= 0 || rows <= 0) throw SshFailure.invalidArgument("PTY size")
    val pipe = StreamPipe()
    val channel = registry.connection(sessionId).openPty(command, term, cols, rows, timeoutMs, pipe)
    return register(sessionId, channel, pipe)
  }

  /** A direct-tcpip channel to a loopback, private or link-local address on the Host. */
  fun openTcp(sessionId: String, host: String, port: Int, timeoutMs: Long): String {
    val target = TcpTarget.canonical(host, port) ?: throw SshFailure.invalidArgument("TCP target")
    val pipe = StreamPipe()
    val channel = registry.connection(sessionId).openTcp(target, port, timeoutMs, pipe)
    return register(sessionId, channel, pipe)
  }

  fun startStream(streamId: String) {
    if (!registry.claimPump(streamId)) return
    val stream = registry.stream(streamId)
    Thread({ pump(stream) }, "agentico-ssh-pump").apply {
      isDaemon = true
      start()
    }
  }

  fun writeStream(streamId: String, data: String, timeoutMs: Long) {
    val bytes = decode(data)
    val stream = registry.stream(streamId)
    stream.write(bytes, timeoutMs) {
      registry.connectionOrNull(stream.sessionId)?.failureAfterOpen() ?: SshFailure.closed
    }
  }

  fun resizePty(streamId: String, cols: Int, rows: Int) {
    if (cols <= 0 || rows <= 0) throw SshFailure.invalidArgument("PTY size")
    val stream = registry.stream(streamId)
    val channel = stream.channel as? com.jcraft.jsch.ChannelExec ?: throw SshFailure.invalidArgument("stream kind")
    if (!channel.isConnected) throw SshFailure.channelFailed
    channel.setPtySize(cols, rows, 0, 0)
  }

  /** Closes one stream. Idempotent: an unknown id is already closed. */
  fun closeStream(streamId: String) {
    val stream = registry.removeStream(streamId) ?: return
    stream.shutdown()
    events.closed(streamId, null, null)
  }

  private fun register(sessionId: String, channel: Channel, pipe: StreamPipe): String {
    val stream = registry.addStream(sessionId, channel, pipe)
    if (stream == null) {
      channel.disconnect()
      throw SshFailure.closed
    }
    return stream.id
  }

  /**
   * Emits the stream's bytes as they arrive, then its close, exactly once: at the remote end, or
   * at the session's loss. `closeStream` and `disconnect` abort the pipe and report themselves.
   */
  private fun pump(stream: BridgeStream) {
    while (true) {
      when (val taken = stream.pipe.take(CHUNK, READ_POLL_MS)) {
        is StreamPipe.Take.Data -> {
          val started = System.nanoTime()
          events.data(stream.id, taken.bytes)
          // JavaScript cannot say "slow down": a flood would queue events (and OOM) faster than
          // it runs them. Holding the pump back fills the pipe, which holds the remote back.
          val budgetNs = taken.bytes.size * 1_000_000_000L / MAX_BYTES_PER_SECOND
          val spentNs = System.nanoTime() - started
          if (budgetNs > spentNs) Thread.sleep((budgetNs - spentNs) / 1_000_000L, ((budgetNs - spentNs) % 1_000_000L).toInt())
        }
        StreamPipe.Take.Idle -> continue
        StreamPipe.Take.Aborted -> return
        StreamPipe.Take.End -> break
      }
    }
    val connection = registry.connectionOrNull(stream.sessionId)
    val reason = if (connection?.isConnected == true) null else "connectionInvalidated"
    var exitStatus: Int? = null
    if (reason == null && stream.isPty) {
      val deadline = Deadline(EXIT_STATUS_WAIT_MS)
      while (!stream.channel.isClosed && !deadline.expired) Thread.sleep(5)
      exitStatus = stream.channel.exitStatus.takeIf { it >= 0 }
    }
    if (registry.removeStream(stream.id) == null) return
    stream.shutdown()
    events.closed(stream.id, reason, exitStatus)
  }

  // MARK: Loopback forwards

  fun startForward(sessionId: String, host: String, port: Int): Map<String, Any?> {
    val connection = registry.connection(sessionId)
    if (!connection.isConnected) throw SshFailure.invalidated
    val target = TcpTarget.canonical(host, port) ?: throw SshFailure.invalidArgument("forward target")
    val forward = LoopbackForward.start(connection, target, port)
    val forwardId = registry.addForward(sessionId, forward)
    if (forwardId == null) {
      forward.stop()
      throw SshFailure.closed
    }
    return mapOf("forwardId" to forwardId, "localPort" to forward.port)
  }

  fun stopForward(forwardId: String) {
    registry.removeForward(forwardId)?.stop()
  }

  // MARK: SFTP

  fun sftpOpen(sessionId: String, timeoutMs: Long): String {
    val client = SftpClient.open(registry.connection(sessionId), timeoutMs)
    return registry.addSftp(sessionId, client) ?: run {
      client.close()
      throw SshFailure.closed
    }
  }

  fun sftpClose(sftpId: String) {
    registry.removeSftp(sftpId)?.close()
  }

  fun sftp(sftpId: String): SftpClient = registry.sftp(sftpId)

  // MARK: Bytes

  fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

  fun decode(base64: String): ByteArray =
    try {
      Base64.decode(base64, Base64.NO_WRAP)
    } catch (error: IllegalArgumentException) {
      throw SshFailure.invalidArgument("base64")
    }
}
