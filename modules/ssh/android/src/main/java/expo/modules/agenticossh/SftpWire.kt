package expo.modules.agenticossh

import java.io.ByteArrayOutputStream

/** SFTP version 3 (draft-ietf-secsh-filexfer-02) as OpenSSH's sftp-server speaks it. */
internal object Sftp {
  const val INIT = 1
  const val VERSION = 2
  const val OPEN = 3
  const val CLOSE = 4
  const val READ = 5
  const val WRITE = 6
  const val LSTAT = 7
  const val SETSTAT = 9
  const val OPENDIR = 11
  const val READDIR = 12
  const val REMOVE = 13
  const val MKDIR = 14
  const val RMDIR = 15
  const val STAT = 17
  const val RENAME = 18
  const val EXTENDED = 200
  const val STATUS = 101
  const val HANDLE = 102
  const val DATA = 103
  const val NAME = 104
  const val ATTRS = 105

  const val FX_OK = 0
  const val FX_EOF = 1
  const val FX_NO_SUCH_FILE = 2

  const val FXF_READ = 0x01
  const val FXF_WRITE = 0x02
  const val FXF_CREAT = 0x08
  const val FXF_EXCL = 0x20

  const val ATTR_SIZE = 0x01
  const val ATTR_UIDGID = 0x02
  const val ATTR_PERMISSIONS = 0x04
  const val ATTR_ACMODTIME = 0x08
  const val ATTR_EXTENDED = Int.MIN_VALUE // 0x80000000

  /** The largest reply this client accepts (sftp-server caps messages at 256 KiB). */
  const val MAX_PACKET = 256 * 1024 + 1024
}

/** A reply the server should never send (wrong type, wrong id, truncated): the channel is unusable. */
internal class SftpProtocolError : Exception("SFTP protocol error")

/** What SFTP v3 reports for one path; each field may be omitted by the server. */
internal class SftpAttrs(val kind: String?, val size: Long?, val modifiedAt: Long?) {
  fun describe(): Map<String, Any?> =
    mapOf("kind" to kind, "size" to size?.toDouble(), "modifiedAt" to modifiedAt?.toDouble())
}

internal class SftpEntry(val name: String, val attrs: SftpAttrs)

/** One request packet: uint32 length | byte type | uint32 id | fields. */
internal class SftpRequest(type: Int, val id: Int?) {
  private val body = ByteArrayOutputStream()

  init {
    body.write(type)
    if (id != null) int(id)
  }

  fun int(value: Int) = apply { body.write(SshWire.uint32(value)) }

  fun long(value: Long) = apply {
    int((value ushr 32).toInt())
    int(value.toInt())
  }

  fun string(bytes: ByteArray) = apply {
    int(bytes.size)
    body.write(bytes)
  }

  fun string(text: String) = string(text.toByteArray(Charsets.UTF_8))

  /** Attributes carrying only permission bits (mkdir, open-for-create, setstat). */
  fun permissions(mode: Int) = apply {
    int(Sftp.ATTR_PERMISSIONS)
    int(mode)
  }

  fun bytes(): ByteArray = SshWire.uint32(body.size()) + body.toByteArray()
}

/** One reply's payload (after the length), read front to back. */
internal class SftpReply(private val data: ByteArray) {
  private var position = 0
  val type: Int = byte()
  val id: Int = if (type == Sftp.VERSION) 0 else int()

  fun byte(): Int {
    if (position + 1 > data.size) throw SftpProtocolError()
    return data[position++].toInt() and 0xff
  }

  fun int(): Int {
    if (position + 4 > data.size) throw SftpProtocolError()
    var value = 0
    repeat(4) { value = (value shl 8) or (data[position++].toInt() and 0xff) }
    return value
  }

  fun long(): Long = (int().toLong() shl 32) or (int().toLong() and 0xffffffffL)

  fun string(): ByteArray {
    val length = int()
    if (length < 0 || position + length > data.size) throw SftpProtocolError()
    return data.copyOfRange(position, position + length).also { position += length }
  }

  fun attrs(): SftpAttrs {
    val flags = int()
    val size = if (flags and Sftp.ATTR_SIZE != 0) long() else null
    if (flags and Sftp.ATTR_UIDGID != 0) {
      int()
      int()
    }
    val permissions = if (flags and Sftp.ATTR_PERMISSIONS != 0) int() else null
    var modifiedAt: Long? = null
    if (flags and Sftp.ATTR_ACMODTIME != 0) {
      int()
      modifiedAt = int().toLong() and 0xffffffffL
    }
    if (flags and Sftp.ATTR_EXTENDED != 0) {
      repeat(int()) {
        string()
        string()
      }
    }
    val kind =
      permissions?.let {
        when (it and 0xF000) {
          0x8000 -> "file"
          0x4000 -> "directory"
          0xA000 -> "symlink"
          else -> "other"
        }
      }
    return SftpAttrs(kind, size, modifiedAt)
  }
}

/** Which entries a listing keeps (the iOS package's `SSHSFTPEntryQuery`). */
internal class SftpQuery(
  private val kinds: Set<String>,
  private val namePrefix: String?,
  private val nameSuffixes: List<String>,
  private val nameContains: String?,
  val maxEntries: Int,
  val maxScanned: Int,
) {
  companion object {
    fun from(query: Map<String, Any?>): SftpQuery {
      fun strings(key: String) = (query[key] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
      fun count(key: String, default: Int, limit: Int) =
        ((query[key] as? Number)?.toInt() ?: default).coerceIn(1, limit)
      return SftpQuery(
        kinds = strings("kinds").filter { it in setOf("file", "directory", "symlink", "other") }.toSet(),
        namePrefix = query["namePrefix"] as? String,
        nameSuffixes = strings("nameSuffixes"),
        nameContains = query["nameContains"] as? String,
        maxEntries = count("maxEntries", 500, 1_000),
        maxScanned = count("maxScanned", 5_000, 20_000),
      )
    }
  }

  /** `.` and `..` never match; an entry whose kind is unknown matches only an empty kind set. */
  fun matches(entry: SftpEntry): Boolean {
    val name = entry.name
    if (name == "." || name == "..") return false
    val kind = entry.attrs.kind
    if (kinds.isNotEmpty() && (kind == null || kind !in kinds)) return false
    if (namePrefix != null && !name.startsWith(namePrefix)) return false
    if (nameSuffixes.isNotEmpty() && nameSuffixes.none { name.endsWith(it) }) return false
    if (nameContains != null && !name.contains(nameContains)) return false
    return true
  }
}
