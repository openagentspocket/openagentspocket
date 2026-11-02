package expo.modules.agenticossh

import com.jcraft.jsch.Channel
import com.jcraft.jsch.ChannelExec
import java.io.IOException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/** What the bridge tells JavaScript about streams, as module events. */
internal interface BridgeEvents {
  fun data(streamId: String, bytes: ByteArray)

  fun closed(streamId: String, reason: String?, exitStatus: Int?)
}

/**
 * One long-lived duplex channel JavaScript holds as a stream (PTY, streamlocal, TCP). Incoming
 * bytes wait in [pipe] until `startStream` installs the pump; writes go through one writer
 * thread, in order, each bounded by its own timeout.
 */
internal class BridgeStream(
  val id: String,
  val sessionId: String,
  val channel: Channel,
  val pipe: StreamPipe,
) {
  val isPty: Boolean get() = channel is ChannelExec
  private val writer = channel.outputStream
  private val writes =
    Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "agentico-ssh-write").apply { isDaemon = true }
    }

  /**
   * Hands `data` to the channel. A timeout leaves the write queued (the server's window is
   * shut), as a timed-out write leaves the channel on iOS.
   */
  fun write(data: ByteArray, timeoutMs: Long, failure: () -> SshFailure) {
    val pending =
      try {
        writes.submit {
          writer.write(data)
          writer.flush()
        }
      } catch (error: java.util.concurrent.RejectedExecutionException) {
        throw SshFailure.closed
      }
    try {
      pending.get(maxOf(1L, timeoutMs), TimeUnit.MILLISECONDS)
    } catch (error: TimeoutException) {
      throw SshFailure.timedOut
    } catch (error: ExecutionException) {
      throw if (error.cause is IOException) failure() else SshFailure.channelFailed
    }
  }

  /** Stops reading and writing and closes the channel. */
  fun shutdown() {
    pipe.abort()
    writes.shutdownNow()
    channel.disconnect()
  }
}

/**
 * Every native object JavaScript holds by id: connections, streams, SFTP clients and loopback
 * forwards. Only bookkeeping happens under the lock; SSH work runs outside it, so one slow call
 * never queues the others. Removing a connection hands back its children for the caller to close.
 */
internal class BridgeRegistry {
  class Children(
    val streams: List<BridgeStream>,
    val sftpClients: List<SftpClient>,
    val forwards: List<LoopbackForward>,
  )

  private var counter = 0L
  private val connections = HashMap<String, SshConnection>()
  private val streams = HashMap<String, BridgeStream>()
  private val pumps = HashSet<String>()
  private val sftpClients = HashMap<String, Pair<String, SftpClient>>()
  private val forwards = HashMap<String, Pair<String, LoopbackForward>>()

  private fun nextId(prefix: String): String = "$prefix-${++counter}"

  @Synchronized
  fun add(connection: SshConnection): String = nextId("ssh").also { connections[it] = connection }

  @Synchronized
  fun connection(id: String): SshConnection = connections[id] ?: throw SshFailure.closed

  @Synchronized
  fun connectionOrNull(id: String): SshConnection? = connections[id]

  @Synchronized
  fun allConnectionIds(): List<String> = connections.keys.toList()

  @Synchronized
  fun removeConnection(id: String): Pair<SshConnection, Children>? {
    val connection = connections.remove(id) ?: return null
    val ownStreams = streams.values.filter { it.sessionId == id }
    ownStreams.forEach {
      streams.remove(it.id)
      pumps.remove(it.id)
    }
    val ownSftp = sftpClients.filterValues { it.first == id }
    ownSftp.keys.forEach { sftpClients.remove(it) }
    val ownForwards = forwards.filterValues { it.first == id }
    ownForwards.keys.forEach { forwards.remove(it) }
    return connection to Children(ownStreams, ownSftp.values.map { it.second }, ownForwards.values.map { it.second })
  }

  /** Registers a stream; false (and nothing registered) when its connection is gone. */
  @Synchronized
  fun addStream(sessionId: String, channel: Channel, pipe: StreamPipe): BridgeStream? {
    if (sessionId !in connections) return null
    return BridgeStream(nextId("stream"), sessionId, channel, pipe).also { streams[it.id] = it }
  }

  @Synchronized
  fun stream(id: String): BridgeStream = streams[id] ?: throw SshFailure.closed

  /** Marks the stream's pump as installed; false when one already runs. */
  @Synchronized
  fun claimPump(id: String): Boolean {
    if (id !in streams) throw SshFailure.closed
    return pumps.add(id)
  }

  /** Whoever removes a stream first closes its channel and reports it. */
  @Synchronized
  fun removeStream(id: String): BridgeStream? = streams.remove(id)?.also { pumps.remove(id) }

  @Synchronized
  fun addSftp(sessionId: String, client: SftpClient): String? {
    if (sessionId !in connections) return null
    return nextId("sftp").also { sftpClients[it] = sessionId to client }
  }

  @Synchronized
  fun sftp(id: String): SftpClient = sftpClients[id]?.second ?: throw SshFailure.closed

  @Synchronized
  fun removeSftp(id: String): SftpClient? = sftpClients.remove(id)?.second

  @Synchronized
  fun addForward(sessionId: String, forward: LoopbackForward): String? {
    if (sessionId !in connections) return null
    return nextId("forward").also { forwards[it] = sessionId to forward }
  }

  @Synchronized
  fun removeForward(id: String): LoopbackForward? = forwards.remove(id)?.second
}
