package expo.modules.agenticossh

import android.util.Base64
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * The Expo bridge over JSch: device keys, connect + authenticate, exec, direct-streamlocal
 * (one-shot and duplex), PTY, SFTP and direct-tcpip (duplex and loopback forward). The same
 * surface as ios/Module/AgenticoSSHModule.swift (src/bridge.ts is the contract): JavaScript holds
 * string ids; bytes cross as base64; stream bytes arrive as `onStreamData` events. Every failure
 * rejects with a stable `code` (src/errors.ts). Each call runs on an IO thread.
 */
class AgenticoSSHModule : Module() {
  private var bridge: SshBridge? = null

  private val events =
    object : BridgeEvents {
      override fun data(streamId: String, bytes: ByteArray) =
        emit("onStreamData", mapOf("streamId" to streamId, "data" to Base64.encodeToString(bytes, Base64.NO_WRAP)))

      override fun closed(streamId: String, reason: String?, exitStatus: Int?) =
        emit("onStreamClose", mapOf("streamId" to streamId, "reason" to reason, "exitStatus" to exitStatus))
    }

  private fun emit(name: String, body: Map<String, Any?>) {
    try {
      sendEvent(name, body)
    } catch (error: Exception) {
      // JavaScript is gone (reload, teardown): nobody listens.
    }
  }

  /** The bridge, made on first use (the React context is certain to exist by then). */
  @Synchronized
  private fun ready(): SshBridge {
    bridge?.let { return it }
    val context = appContext.reactContext?.applicationContext ?: throw SshFailure("unknown", "module not ready")
    return SshBridge(File(context.noBackupFilesDir, "agentico-ssh-keys"), events).also { bridge = it }
  }

  /** Runs one bridged call on an IO thread, failures as coded exceptions. */
  private suspend fun <T> io(body: SshBridge.() -> T): T = withContext(Dispatchers.IO) { bridged { ready().body() } }

  override fun definition() =
    ModuleDefinition {
      Name("AgenticoSSH")
      Events("onStreamData", "onStreamClose")

      OnDestroy {
        val closing = bridge ?: return@OnDestroy
        Thread({ closing.disconnectAll() }, "agentico-ssh-teardown").start()
      }

      AsyncFunction("generateKey") Coroutine { alias: String -> io { generateKey(alias) } }
      AsyncFunction("publicKey") Coroutine { alias: String -> io { publicKey(alias) } }
      AsyncFunction("deleteKey") Coroutine { alias: String -> io { deleteKey(alias) } }

      AsyncFunction("connect") Coroutine { host: String, port: Int, timeoutMs: Int ->
        io { connect(host, port, timeoutMs.toLong()) }
      }
      AsyncFunction("authenticate") Coroutine { sessionId: String, username: String, keyAlias: String, timeoutMs: Int ->
        io { authenticate(sessionId, username, keyAlias, timeoutMs.toLong()) }
      }
      AsyncFunction("authenticateWith") Coroutine { sessionId: String, username: String, kind: String, secret: String, timeoutMs: Int ->
        io { authenticateWith(sessionId, username, kind, secret, timeoutMs.toLong()) }
      }
      AsyncFunction("disconnect") Coroutine { sessionId: String -> io { disconnect(sessionId) } }
      AsyncFunction("isConnected") Coroutine { sessionId: String -> io { isConnected(sessionId) } }
      AsyncFunction("exec") Coroutine { sessionId: String, command: String, input: String?, timeoutMs: Int ->
        io { exec(sessionId, command, input, timeoutMs.toLong()) }
      }
      AsyncFunction("exchangeStreamLocal") Coroutine {
          sessionId: String, socketPath: String, request: String, maxBytes: Int, timeoutMs: Int ->
        io { exchangeStreamLocal(sessionId, socketPath, request, maxBytes, timeoutMs.toLong()) }
      }

      AsyncFunction("openStreamLocal") Coroutine { sessionId: String, socketPath: String, timeoutMs: Int ->
        io { openStreamLocal(sessionId, socketPath, timeoutMs.toLong()) }
      }
      AsyncFunction("openPty") Coroutine {
          sessionId: String, command: String, term: String, cols: Int, rows: Int, timeoutMs: Int ->
        io { openPty(sessionId, command, term, cols, rows, timeoutMs.toLong()) }
      }
      AsyncFunction("openTcp") Coroutine { sessionId: String, host: String, port: Int, timeoutMs: Int ->
        io { openTcp(sessionId, host, port, timeoutMs.toLong()) }
      }
      AsyncFunction("startStream") Coroutine { streamId: String -> io { startStream(streamId) } }
      AsyncFunction("writeStream") Coroutine { streamId: String, data: String, timeoutMs: Int ->
        io { writeStream(streamId, data, timeoutMs.toLong()) }
      }
      AsyncFunction("resizePty") Coroutine { streamId: String, cols: Int, rows: Int, _: Int ->
        io { resizePty(streamId, cols, rows) }
      }
      AsyncFunction("closeStream") Coroutine { streamId: String -> io { closeStream(streamId) } }

      AsyncFunction("startForward") Coroutine { sessionId: String, host: String, port: Int ->
        io { startForward(sessionId, host, port) }
      }
      AsyncFunction("stopForward") Coroutine { forwardId: String -> io { stopForward(forwardId) } }

      AsyncFunction("sftpOpen") Coroutine { sessionId: String, timeoutMs: Int ->
        io { sftpOpen(sessionId, timeoutMs.toLong()) }
      }
      AsyncFunction("sftpClose") Coroutine { sftpId: String -> io { sftpClose(sftpId) } }
      AsyncFunction("sftpStat") Coroutine { sftpId: String, path: String, followSymlinks: Boolean, timeoutMs: Int ->
        io { sftp(sftpId).stat(path, followSymlinks, timeoutMs.toLong())?.describe() }
      }
      AsyncFunction("sftpList") Coroutine { sftpId: String, path: String, query: Map<String, Any?>, timeoutMs: Int ->
        io {
          sftp(sftpId).list(path, SftpQuery.from(query), timeoutMs.toLong())?.let { (entries, truncated, incomplete) ->
            mapOf(
              "entries" to entries.map { it.attrs.describe() + ("name" to it.name) },
              "truncated" to truncated,
              "scanIncomplete" to incomplete,
            )
          }
        }
      }
      AsyncFunction("sftpRead") Coroutine { sftpId: String, path: String, timeoutMs: Int ->
        io { sftp(sftpId).read(path, timeoutMs.toLong())?.let { encode(it) } }
      }
      AsyncFunction("sftpReadRange") Coroutine { sftpId: String, path: String, offset: Double, maxBytes: Int, timeoutMs: Int ->
        io {
          if (offset < 0 || offset >= 9.007e15 || maxBytes <= 0) throw SshFailure.invalidArgument("range")
          val (data, length) = sftp(sftpId).readRange(path, offset.toLong(), maxBytes, timeoutMs.toLong())
          mapOf("data" to encode(data), "length" to length?.toDouble())
        }
      }
      AsyncFunction("sftpWrite") Coroutine { sftpId: String, path: String, data: String, permissions: Int, timeoutMs: Int ->
        io { sftp(sftpId).write(path, decode(data), mode(permissions), timeoutMs.toLong()) }
      }
      AsyncFunction("sftpRename") Coroutine { sftpId: String, from: String, to: String, overwrite: Boolean, timeoutMs: Int ->
        io { sftp(sftpId).rename(from, to, overwrite, timeoutMs.toLong()) }
      }
      AsyncFunction("sftpUnlink") Coroutine { sftpId: String, path: String, timeoutMs: Int ->
        io { sftp(sftpId).unlink(path, timeoutMs.toLong()) }
      }
      AsyncFunction("sftpMkdir") Coroutine { sftpId: String, path: String, permissions: Int, timeoutMs: Int ->
        io { sftp(sftpId).mkdir(path, mode(permissions), timeoutMs.toLong()) }
      }
      AsyncFunction("sftpRmdir") Coroutine { sftpId: String, path: String, timeoutMs: Int ->
        io { sftp(sftpId).rmdir(path, timeoutMs.toLong()) }
      }
      AsyncFunction("sftpChmod") Coroutine { sftpId: String, path: String, permissions: Int, timeoutMs: Int ->
        io { sftp(sftpId).chmod(path, mode(permissions), timeoutMs.toLong()) }
      }
    }

  private fun mode(permissions: Int): Int {
    if (permissions !in 0..0b111_111_111_111) throw SshFailure.invalidArgument("permissions")
    return permissions
  }
}
