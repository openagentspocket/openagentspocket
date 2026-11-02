package expo.modules.agenticossh

import com.jcraft.jsch.ChannelDirectTCPIP
import java.io.FilterOutputStream
import java.io.IOException
import java.io.OutputStream
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket

/**
 * Where a direct-tcpip channel may lead, as seen from the Host: its own loopback, or one of its
 * private or link-local addresses (the iOS package's `SSHTCPTarget`). Only numeric IPv4 and IPv6
 * literals pass, so the server is handed exactly the address that was checked; a hostname or a
 * public address would turn the Host into a relay to anywhere. Scoped (`%iface`) and
 * IPv4-mapped IPv6 forms are refused rather than interpreted.
 */
internal object TcpTarget {
  private val IPV4 = Regex("""^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$""")
  private val IPV6_CHARS = Regex("""^[0-9A-Fa-f:.]+$""")

  /** The canonical numeric address, or null for anything not allowed. */
  fun canonical(address: String, port: Int): String? {
    if (port !in 1..65535 || address.isEmpty() || address.length > 45) return null
    if (IPV4.matches(address)) {
      val bytes = address.split('.').map { it.toInt() }
      return if (allowedV4(bytes)) bytes.joinToString(".") else null
    }
    if (!address.contains(':') || !IPV6_CHARS.matches(address)) return null
    // A literal with ':' is parsed, never resolved.
    val parsed =
      try {
        InetAddress.getByName(address)
      } catch (error: Exception) {
        return null
      }
    if (parsed !is Inet6Address) return null // IPv4-mapped forms come back as IPv4.
    val bytes = parsed.address.map { it.toInt() and 0xff }
    return if (allowedV6(bytes)) parsed.hostAddress else null
  }

  private fun allowedV4(b: List<Int>): Boolean =
    b[0] == 127 || b[0] == 10 || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254) ||
      (b[0] == 172 && (b[1] and 0xF0) == 16)

  private fun allowedV6(b: List<Int>): Boolean =
    (b.subList(0, 15).all { it == 0 } && b[15] == 1) || (b[0] and 0xFE) == 0xFC ||
      (b[0] == 0xFE && (b[1] and 0xC0) == 0x80)
}

/**
 * A listener on 127.0.0.1 whose every accepted connection gets its own direct-tcpip channel to one
 * target on the Host, bytes pumped both ways by JSch (the phone side of a Ports preview).
 *
 * - Loopback only: bound to 127.0.0.1, so Wi-Fi and cellular peers cannot connect.
 * - At most [MAX_LIVE] connections hold a channel at once; any excess is refused (closed).
 * - `stop` closes the listener and every live connection; idempotent.
 */
internal class LoopbackForward private constructor(
  private val server: ServerSocket,
  private val connection: SshConnection,
  private val target: String,
  private val targetPort: Int,
) {
  companion object {
    const val MAX_LIVE = 8
    const val CHANNEL_OPEN_TIMEOUT_MS = 10_000

    fun start(connection: SshConnection, target: String, targetPort: Int): LoopbackForward {
      val server =
        try {
          ServerSocket(0, 16, Inet4Address.getByAddress(byteArrayOf(127, 0, 0, 1)))
        } catch (error: IOException) {
          throw SshFailure("forwardFailed", "local listener failed: bind")
        }
      return LoopbackForward(server, connection, target, targetPort).also { it.acceptInBackground() }
    }
  }

  private class Live(val socket: Socket) {
    @Volatile var channel: ChannelDirectTCPIP? = null
    val ended = java.util.concurrent.atomic.AtomicBoolean(false)
  }

  val port: Int = server.localPort
  private val lock = Object()
  private val live = HashSet<Live>()
  private var stopped = false

  fun stop() {
    val open =
      synchronized(lock) {
        stopped = true
        live.toList().also { live.clear() }
      }
    quietly { server.close() }
    for (entry in open) end(entry)
  }

  private fun acceptInBackground() {
    Thread({
      while (true) {
        val socket =
          try {
            server.accept()
          } catch (error: IOException) {
            break // Closed by stop().
          }
        admit(socket)
      }
    }, "agentico-ssh-forward").apply {
      isDaemon = true
      start()
    }
  }

  private fun admit(socket: Socket) {
    val entry = Live(socket)
    val admitted =
      synchronized(lock) {
        if (stopped || live.size >= MAX_LIVE) false else live.add(entry)
      }
    if (!admitted) {
      quietly { socket.close() }
      return
    }
    try {
      socket.tcpNoDelay = true
      val channel = connection.forwardChannel(target, targetPort)
      entry.channel = channel
      channel.setInputStream(socket.getInputStream())
      channel.setOutputStream(OnClose(socket.getOutputStream()) { finish(entry) })
      // With an input stream set, JSch opens the channel on its own thread and pumps both ways;
      // a refused open or either side's end closes the output, which finishes the entry.
      channel.connect(CHANNEL_OPEN_TIMEOUT_MS)
    } catch (error: Exception) {
      finish(entry)
    }
  }

  private fun finish(entry: Live) {
    synchronized(lock) { live.remove(entry) }
    end(entry)
  }

  private fun end(entry: Live) {
    if (!entry.ended.compareAndSet(false, true)) return
    quietly { entry.channel?.disconnect() }
    quietly { entry.socket.close() }
  }

  private class OnClose(out: OutputStream, private val onClose: () -> Unit) : FilterOutputStream(out) {
    override fun write(b: ByteArray, off: Int, len: Int) = out.write(b, off, len)

    override fun close() {
      try {
        super.close()
      } finally {
        onClose()
      }
    }
  }

  private inline fun quietly(block: () -> Unit) {
    try {
      block()
    } catch (error: Exception) {
      // Already closed.
    }
  }
}
