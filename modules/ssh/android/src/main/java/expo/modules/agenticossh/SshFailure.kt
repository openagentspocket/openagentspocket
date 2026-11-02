package expo.modules.agenticossh

import com.jcraft.jsch.JSchAlgoNegoFailException
import com.jcraft.jsch.JSchException
import expo.modules.kotlin.exception.CodedException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * A failure with a stable code, the `SshErrorCode` union in src/errors.ts (the same codes the iOS
 * bridge reports). Messages never carry paths, keys or host names.
 */
class SshFailure(val code: String, message: String = code) : Exception(message) {
  companion object {
    fun invalidArgument(what: String) = SshFailure("invalidArgument", "invalid $what")

    fun sftpStatus(status: Int) = SshFailure("sftpFailure", "SFTP status $status")

    val closed get() = SshFailure("closed")
    val timedOut get() = SshFailure("timedOut")
    val invalidated get() = SshFailure("connectionInvalidated")
    val channelFailed get() = SshFailure("channelFailed")
  }
}

/** Turns any failure into the coded exception JavaScript receives (`error.code`). */
fun Throwable.toCoded(): CodedException =
  when (this) {
    is CodedException -> this
    is SshFailure -> CodedException(code, message, null)
    is kotlinx.coroutines.CancellationException -> CodedException("cancelled", "cancelled", null)
    else -> CodedException("unknown", javaClass.simpleName, null)
  }

/** Runs one bridged call, turning any failure into a coded exception. */
inline fun <T> bridged(body: () -> T): T =
  try {
    body()
  } catch (error: Throwable) {
    throw error.toCoded()
  }

internal object Failures {
  /** A failure while the TCP connection, the handshake or authentication was underway. */
  fun ofConnect(error: Throwable): SshFailure {
    if (error is SshFailure) return error
    if (error is JSchAlgoNegoFailException) return SshFailure("algorithmNegotiationFailed")
    val causes = generateSequence(error) { it.cause }.toList()
    if (causes.any { it is SocketTimeoutException }) return SshFailure.timedOut
    val message = error.message.orEmpty()
    return when {
      message.startsWith("Auth fail") || message.startsWith("Auth cancel") ->
        SshFailure("authenticationFailed")
      message.startsWith("timeout") -> SshFailure.timedOut
      message.startsWith("Algorithm negotiation fail") ->
        SshFailure("algorithmNegotiationFailed")
      causes.any { it is UnknownHostException || it is ConnectException } ->
        SshFailure("connectionFailed")
      causes.any { it is NoRouteToHostException } -> SshFailure("connectionFailed")
      else -> SshFailure("connectionFailed")
    }
  }

  /**
   * A channel that did not open. JSch leaves the server's SSH_MSG_CHANNEL_OPEN_FAILURE reason
   * code in the exit status (1 prohibited, 2 connect failed); -1 means no answer in time.
   */
  fun ofOpen(error: Throwable, sessionUp: Boolean, reason: Int, refusal: (Int) -> String): SshFailure {
    if (error is SshFailure) return error
    if (!sessionUp) return SshFailure.invalidated
    if (reason > 0) return SshFailure(refusal(reason))
    if (error is JSchException && error.message == "channel is not opened.") return SshFailure.timedOut
    return SshFailure.channelFailed
  }

  /** A refused direct-tcpip channel. */
  fun tcpRefusal(reason: Int): String =
    when (reason) {
      1 -> "forwardingDenied"
      2 -> "targetUnreachable"
      else -> "channelFailed"
    }
}
