package expo.modules.agenticossh

import com.jcraft.jsch.HostKey
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.Identity
import com.jcraft.jsch.IdentityRepository
import com.jcraft.jsch.UserInfo
import java.util.Vector
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/**
 * Splits JSch's one-call connect into the bridge's two steps. JSch asks this repository about the
 * Host Key right after the key exchange (the server has proven it holds the key) and before any
 * authentication. The gate hands the key to `connect`, then holds the handshake thread until
 * JavaScript decides: `authenticate` accepts, `disconnect` (or no answer) rejects, so no
 * authentication ever starts for a key that was not accepted.
 */
internal class HostKeyGate : HostKeyRepository {
  /** Completes with the presented key blob, or with the failure that ended the handshake first. */
  val presented = CompletableFuture<ByteArray>()
  private val decision = CompletableFuture<Boolean>()

  private companion object {
    /** How long a presented key may wait for an answer (a person may be reading it). */
    const val DECISION_LIMIT_MINUTES = 10L
  }

  /** True when this call made the decision; false when it was already made. */
  fun accept(): Boolean = decision.complete(true)

  fun reject(): Boolean = decision.complete(false)

  override fun check(host: String?, key: ByteArray): Int {
    presented.complete(key.copyOf())
    val accepted =
      try {
        decision.get(DECISION_LIMIT_MINUTES, TimeUnit.MINUTES)
      } catch (error: Exception) {
        false
      }
    return if (accepted) HostKeyRepository.OK else HostKeyRepository.NOT_INCLUDED
  }

  override fun add(hostkey: HostKey?, ui: UserInfo?) {}

  override fun remove(host: String?, type: String?) {}

  override fun remove(host: String?, type: String?, key: ByteArray?) {}

  override fun getKnownHostsRepositoryID() = "agentico"

  override fun getHostKey(): Array<HostKey> = emptyArray()

  override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
}

/** The identities one session may authenticate with: the device key, once `authenticate` names it. */
internal class DeviceIdentities : IdentityRepository {
  @Volatile var identity: Identity? = null

  override fun getName() = "agentico-device-keys"

  override fun getStatus() = IdentityRepository.RUNNING

  override fun getIdentities(): Vector<Identity> = Vector<Identity>().apply { identity?.let { add(it) } }

  override fun add(identity: ByteArray?) = false

  override fun remove(blob: ByteArray?) = false

  override fun removeAll() {
    identity = null
  }
}

/** A point in time an operation must finish by. */
internal class Deadline(timeoutMs: Long) {
  private val end = System.nanoTime() + maxOf(1L, timeoutMs) * 1_000_000L

  val expired get() = System.nanoTime() >= end

  fun remainingMs(): Long = maxOf(0L, (end - System.nanoTime()) / 1_000_000L)

  /** The remainder as JSch's int timeouts take it; at least 1 ms (0 would mean "forever"). */
  fun remainingIntMs(): Int = remainingMs().coerceIn(1L, Int.MAX_VALUE.toLong()).toInt()
}
