package expo.modules.agenticossh

import com.jcraft.jsch.AgenticoSessionAccess
import com.jcraft.jsch.Channel
import com.jcraft.jsch.ChannelDirectStreamLocal
import com.jcraft.jsch.ChannelDirectTCPIP
import com.jcraft.jsch.ChannelExec
import com.jcraft.jsch.ChannelSubsystem
import com.jcraft.jsch.Identity
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.Session
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/** What the server presented during the handshake. */
internal class Hello(val hostKey: ByteArray, val serverIdentification: String?)

internal class ExecOutput(val exitStatus: Int, val stdout: ByteArray, val stderr: ByteArray)

/**
 * One SSH connection (a JSch session): handshake with the Host Key held at the gate, public-key
 * authentication with the device key, then channels. Safe to use from any thread; JSch
 * multiplexes channels over the session's own reader thread.
 */
internal class SshConnection private constructor(
  private val session: Session,
  private val gate: HostKeyGate,
  private val identities: DeviceIdentities,
  private val handshake: CompletableFuture<Unit>,
) {
  @Volatile private var authenticated = false
  private var authStarted = false

  val isConnected: Boolean get() = authenticated && session.isConnected

  companion object {
    private const val PLACEHOLDER_USER = "agentico"

    /** Plain host keys only: the app pins a key's fingerprint, never a certificate authority. */
    private val CONFIG =
      mapOf(
        "StrictHostKeyChecking" to "yes",
        "HashKnownHosts" to "no",
        "PreferredAuthentications" to "publickey",
        "enable_auth_none" to "no",
        "server_host_key" to
          "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,rsa-sha2-512,rsa-sha2-256",
      )

    /** Opens the TCP connection and runs the key exchange; returns once the Host Key is presented. */
    fun connect(host: String, port: Int, timeoutMs: Long): Pair<SshConnection, Hello> {
      if (host.isEmpty() || host.contains('\u0000') || port !in 1..65535) {
        throw SshFailure("invalidEndpoint")
      }
      val session =
        try {
          JSch().getSession(PLACEHOLDER_USER, host, port)
        } catch (error: JSchException) {
          throw SshFailure("invalidEndpoint")
        }
      val gate = HostKeyGate()
      val identities = DeviceIdentities()
      CONFIG.forEach { (key, value) -> session.setConfig(key, value) }
      session.setHostKeyRepository(gate)
      session.setIdentityRepository(identities)
      session.setDaemonThread(true)

      val handshake = CompletableFuture<Unit>()
      handshake.whenComplete { _, error -> if (error != null) gate.presented.completeExceptionally(error) }
      val connectTimeout = timeoutMs.coerceIn(1L, Int.MAX_VALUE.toLong()).toInt()
      Thread({
        try {
          session.connect(connectTimeout)
          handshake.complete(Unit)
        } catch (error: Throwable) {
          handshake.completeExceptionally(error)
        }
      }, "agentico-ssh-connect").apply {
        isDaemon = true
        start()
      }

      val connection = SshConnection(session, gate, identities, handshake)
      val key =
        try {
          gate.presented.get(maxOf(1L, timeoutMs), TimeUnit.MILLISECONDS)
        } catch (error: TimeoutException) {
          connection.close()
          throw SshFailure.timedOut
        } catch (error: ExecutionException) {
          connection.close()
          throw Failures.ofConnect(error.cause ?: error)
        }
      return connection to Hello(key, session.serverVersion)
    }
  }

  /**
   * Accepts the presented Host Key and authenticates `username` with a key (`identity`, which
   * signs inside this process; JSch only receives signatures) or, with `password`, by password
   * (also answered to a keyboard-interactive prompt).
   */
  fun authenticate(username: String, identity: Identity?, password: String?, timeoutMs: Long) {
    if (username.isEmpty() || username.contains('\u0000')) throw SshFailure.invalidArgument("username")
    synchronized(this) {
      if (!authStarted) {
        authStarted = true
        AgenticoSessionAccess.setUserName(session, username)
        if (password != null) {
          session.setPassword(password.toByteArray(Charsets.UTF_8))
          session.setConfig("PreferredAuthentications", "password,keyboard-interactive")
        }
        identities.identity = identity
        if (!gate.accept()) throw SshFailure.invalidated
      }
    }
    try {
      handshake.get(maxOf(1L, timeoutMs), TimeUnit.MILLISECONDS)
    } catch (error: TimeoutException) {
      close()
      throw SshFailure.timedOut
    } catch (error: ExecutionException) {
      close()
      throw Failures.ofConnect(error.cause ?: error)
    }
    authenticated = true
  }

  /** Ends the session and every channel on it. Idempotent. */
  fun close() {
    gate.reject()
    identities.removeAll()
    try {
      session.disconnect()
    } catch (error: Exception) {
      // Already down.
    }
  }

  // MARK: Channels

  @Suppress("UNCHECKED_CAST")
  fun <T : Channel> channel(type: String): T {
    if (!isConnected) throw SshFailure.invalidated
    val channel =
      try {
        session.openChannel(type)
      } catch (error: JSchException) {
        null
      }
    return (channel ?: throw SshFailure.invalidated) as T
  }

  /** Opens `channel` within the deadline; a refusal maps through `refusal` (the reason code). */
  fun open(channel: Channel, deadline: Deadline, refusal: (Int) -> String) {
    try {
      channel.connect(deadline.remainingIntMs())
    } catch (error: Exception) {
      val reason = channel.exitStatus
      channel.disconnect()
      throw Failures.ofOpen(error, session.isConnected, reason, refusal)
    }
  }

  /** A channel failure after it opened: the session's loss reads as `connectionInvalidated`. */
  fun failureAfterOpen(): SshFailure = if (session.isConnected) SshFailure.channelFailed else SshFailure.invalidated

  /** Waits for the server to close `channel` (exit status and EOF have arrived by then). */
  fun awaitClosed(channel: Channel, deadline: Deadline) {
    while (!channel.isClosed) {
      if (deadline.expired) throw SshFailure.timedOut
      Thread.sleep(5)
    }
  }

  fun openPty(command: String, term: String, cols: Int, rows: Int, timeoutMs: Long, pipe: StreamPipe): ChannelExec {
    val channel = channel<ChannelExec>("exec")
    channel.setCommand(command.toByteArray(Charsets.UTF_8))
    channel.setPty(true)
    channel.setPtyType(term, cols, rows, 0, 0)
    channel.setOutputStream(pipe)
    channel.setExtOutputStream(pipe, true)
    open(channel, Deadline(timeoutMs)) { SshFailure.channelFailed.code }
    return channel
  }

  fun openStreamLocal(socketPath: String, timeoutMs: Long, output: java.io.OutputStream): ChannelDirectStreamLocal {
    if (!socketPath.startsWith("/") || socketPath.contains('\u0000')) throw SshFailure.channelFailed
    val channel = channel<ChannelDirectStreamLocal>("direct-streamlocal@openssh.com")
    channel.socketPath = socketPath
    channel.setOutputStream(output)
    open(channel, Deadline(timeoutMs)) { "streamLocalOpenFailed" }
    return channel
  }

  fun openTcp(target: String, port: Int, timeoutMs: Long, pipe: StreamPipe): ChannelDirectTCPIP {
    val channel = channel<ChannelDirectTCPIP>("direct-tcpip")
    channel.setHost(target)
    channel.setPort(port)
    channel.setOutputStream(pipe)
    open(channel, Deadline(timeoutMs), Failures::tcpRefusal)
    return channel
  }

  fun openSftpSubsystem(timeoutMs: Long, pipe: StreamPipe): ChannelSubsystem {
    val channel = channel<ChannelSubsystem>("subsystem")
    channel.setSubsystem("sftp")
    channel.setOutputStream(pipe)
    try {
      open(channel, Deadline(timeoutMs)) { "sftpUnavailable" }
    } catch (error: SshFailure) {
      throw if (error.code == "channelFailed") SshFailure("sftpUnavailable") else error
    }
    return channel
  }

  /** A loopback-forward channel: JSch pumps the local socket's streams itself. */
  fun forwardChannel(target: String, port: Int): ChannelDirectTCPIP {
    val channel = channel<ChannelDirectTCPIP>("direct-tcpip")
    channel.setHost(target)
    channel.setPort(port)
    return channel
  }

  // MARK: One-shot requests

  fun exec(command: String, input: ByteArray, timeoutMs: Long): ExecOutput {
    val deadline = Deadline(timeoutMs)
    val channel = channel<ChannelExec>("exec")
    val stdout = ByteArrayOutputStream()
    val stderr = ByteArrayOutputStream()
    channel.setCommand(command.toByteArray(Charsets.UTF_8))
    // The input, then EOF: a command that reads stdin never waits for more.
    channel.setInputStream(ByteArrayInputStream(input))
    channel.setOutputStream(stdout)
    channel.setErrStream(stderr)
    open(channel, deadline) { SshFailure.channelFailed.code }
    try {
      awaitClosed(channel, deadline)
      if (channel.exitStatus < 0 && !session.isConnected) throw SshFailure.invalidated
      return ExecOutput(channel.exitStatus, stdout.toByteArray(), stderr.toByteArray())
    } finally {
      channel.disconnect()
    }
  }

  /**
   * One request on a fresh direct-streamlocal channel (herdr's API socket); the response is the
   * first newline-terminated line, at most `maxBytes`. The channel is closed either way, so a
   * refused or oversized answer leaves the connection usable.
   */
  fun exchangeStreamLocal(socketPath: String, request: ByteArray, maxBytes: Int, timeoutMs: Long): ByteArray {
    if (request.isEmpty() || request.last() != '\n'.code.toByte() || maxBytes <= 0) throw SshFailure.channelFailed
    val deadline = Deadline(timeoutMs)
    val collector = LineCollector(maxBytes)
    val channel = openStreamLocal(socketPath, deadline.remainingMs(), collector)
    try {
      channel.outputStream.apply {
        write(request)
        flush()
      }
      return collector.await(deadline)
    } catch (error: IOException) {
      throw failureAfterOpen()
    } catch (error: SshFailure) {
      throw if (error.code == "unexpectedEOF" && !session.isConnected) SshFailure.invalidated else error
    } finally {
      channel.disconnect()
    }
  }
}
