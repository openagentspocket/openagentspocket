package expo.modules.agenticossh

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.jcraft.jsch.Identity
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The device's Ed25519 SSH keys, one per alias. The 32-byte seed is stored only wrapped by an
 * AES-256-GCM key that lives in the Android Keystore (never exportable), in the app's no-backup
 * directory, so neither a backup nor another device can use it. The seed exists in memory only
 * while a key signs; JavaScript only ever sees the OpenSSH public key line.
 */
internal class DeviceKeyStore(private val directory: File) {
  private companion object {
    const val KEYSTORE = "AndroidKeyStore"
    const val WRAPPING_ALIAS = "agentico.ssh.device-keys.wrap"
    const val FORMAT_VERSION: Byte = 1
    const val SEED_BYTES = 32
    const val TAG_BITS = 128
  }

  /** The key under `alias`, generated and stored on first use. */
  @Synchronized
  fun loadOrCreate(alias: String): DeviceKey {
    load(alias)?.let { return it }
    val seed = ByteArray(SEED_BYTES).also { SecureRandom().nextBytes(it) }
    try {
      write(alias, seal(alias, seed))
      return DeviceKey(Ed25519PrivateKeyParameters(seed, 0))
    } finally {
      seed.fill(0)
    }
  }

  /** The key under `alias`, or null when none was generated. */
  @Synchronized
  fun load(alias: String): DeviceKey? {
    val file = fileFor(alias)
    if (!file.exists()) return null
    val sealed =
      try {
        file.readBytes()
      } catch (error: java.io.IOException) {
        throw SshFailure("keychainFailed", "key file unreadable")
      }
    val seed = open(alias, sealed)
    try {
      return DeviceKey(Ed25519PrivateKeyParameters(seed, 0))
    } finally {
      seed.fill(0)
    }
  }

  /** Deletes the key under `alias`; deleting a missing key succeeds. */
  @Synchronized
  fun delete(alias: String) {
    val file = fileFor(alias)
    if (file.exists() && !file.delete()) throw SshFailure("keychainFailed", "key file not deleted")
  }

  private fun fileFor(alias: String): File {
    val digest = MessageDigest.getInstance("SHA-256").digest(alias.toByteArray(Charsets.UTF_8))
    return File(directory, digest.joinToString("") { "%02x".format(it) } + ".key")
  }

  private fun write(alias: String, bytes: ByteArray) {
    if (!directory.isDirectory && !directory.mkdirs()) {
      throw SshFailure("keychainFailed", "key directory unavailable")
    }
    val target = fileFor(alias)
    val staged = File(directory, target.name + ".tmp")
    try {
      staged.writeBytes(bytes)
      if (!staged.renameTo(target)) throw java.io.IOException("rename")
    } catch (error: java.io.IOException) {
      staged.delete()
      throw SshFailure("keychainFailed", "key file not written")
    }
  }

  /** version(1) | iv length(1) | iv | AES-GCM(seed), the alias bound as associated data. */
  private fun seal(alias: String, seed: ByteArray): ByteArray =
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, wrappingKey(create = true))
      cipher.updateAAD(alias.toByteArray(Charsets.UTF_8))
      val sealed = cipher.doFinal(seed)
      val iv = cipher.iv
      ByteArrayOutputStream().apply {
        write(FORMAT_VERSION.toInt())
        write(iv.size)
        write(iv)
        write(sealed)
      }.toByteArray()
    } catch (error: GeneralSecurityException) {
      throw SshFailure("keychainFailed", "Keystore ${error.javaClass.simpleName}")
    }

  /**
   * Unwraps a stored seed. Bytes that no longer open are surfaced as `keyCorrupt`, never silently
   * replaced: a new key would lock the user out of every Host that trusts the old one.
   */
  private fun open(alias: String, sealed: ByteArray): ByteArray {
    if (sealed.size < 3 || sealed[0] != FORMAT_VERSION) throw SshFailure("keyCorrupt")
    val ivLength = sealed[1].toInt() and 0xff
    if (ivLength == 0 || sealed.size <= 2 + ivLength) throw SshFailure("keyCorrupt")
    val key = wrappingKey(create = false) ?: throw SshFailure("keyCorrupt")
    val seed =
      try {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 2, ivLength))
        cipher.updateAAD(alias.toByteArray(Charsets.UTF_8))
        cipher.doFinal(sealed, 2 + ivLength, sealed.size - 2 - ivLength)
      } catch (error: AEADBadTagException) {
        throw SshFailure("keyCorrupt")
      } catch (error: GeneralSecurityException) {
        throw SshFailure("keychainFailed", "Keystore ${error.javaClass.simpleName}")
      }
    if (seed.size != SEED_BYTES) {
      seed.fill(0)
      throw SshFailure("keyCorrupt")
    }
    return seed
  }

  private fun wrappingKey(create: Boolean): SecretKey? =
    try {
      val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
      (keyStore.getKey(WRAPPING_ALIAS, null) as SecretKey?)
        ?: if (create) generateWrappingKey() else null
    } catch (error: GeneralSecurityException) {
      throw SshFailure("keychainFailed", "Keystore ${error.javaClass.simpleName}")
    } catch (error: java.io.IOException) {
      throw SshFailure("keychainFailed", "Keystore unavailable")
    }

  private fun generateWrappingKey(): SecretKey {
    val spec =
      KeyGenParameterSpec.Builder(
        WRAPPING_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
      .apply { init(spec) }
      .generateKey()
  }
}

/** One device key while it is in memory: the public material and an Ed25519 signer. */
internal class DeviceKey(private val privateKey: Ed25519PrivateKeyParameters) {
  /** SSH wire-format public key blob (RFC 4253 6.6): string "ssh-ed25519" + string <32 bytes>. */
  val publicKeyBlob: ByteArray = SshWire.strings("ssh-ed25519".toByteArray(), privateKey.generatePublicKey().encoded)

  /** The public key in OpenSSH one-line format, without a comment. */
  val openSSHLine: String get() = "ssh-ed25519 " + Base64.encodeToString(publicKeyBlob, Base64.NO_WRAP)

  /** An SSH signature blob (RFC 8709): string "ssh-ed25519" + string <64-byte signature>. */
  fun sign(data: ByteArray): ByteArray {
    val signer = Ed25519Signer()
    signer.init(true, privateKey)
    signer.update(data, 0, data.size)
    return SshWire.strings("ssh-ed25519".toByteArray(), signer.generateSignature())
  }
}

/** The device key as JSch's public-key authentication sees it: it signs, it never exports. */
internal class DeviceKeyIdentity(private val key: DeviceKey) : Identity {
  override fun setPassphrase(passphrase: ByteArray?) = true

  override fun getPublicKeyBlob(): ByteArray = key.publicKeyBlob

  override fun getSignature(data: ByteArray): ByteArray = key.sign(data)

  override fun getSignature(data: ByteArray, alg: String?): ByteArray = key.sign(data)

  override fun getAlgName() = "ssh-ed25519"

  override fun getName() = "agentico-device-key"

  override fun isEncrypted() = false

  override fun clear() {}
}

/** SSH wire encodings shared by keys, host keys and SFTP. */
internal object SshWire {
  /** Each value as an SSH string: uint32 length + bytes. */
  fun strings(vararg values: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    for (value in values) {
      out.write(uint32(value.size))
      out.write(value)
    }
    return out.toByteArray()
  }

  fun uint32(value: Int) =
    byteArrayOf((value ushr 24).toByte(), (value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte())

  /** `SHA256:<base64 without padding>`, as `ssh-keygen -l` prints it. */
  fun fingerprint(blob: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(blob)
    return "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP).trimEnd('=')
  }

  /** The algorithm named by a key blob's first string, or `*` when unreadable. */
  fun algorithm(blob: ByteArray): String {
    if (blob.size < 4) return "*"
    val length =
      ((blob[0].toInt() and 0xff) shl 24) or ((blob[1].toInt() and 0xff) shl 16) or
        ((blob[2].toInt() and 0xff) shl 8) or (blob[3].toInt() and 0xff)
    if (length <= 0 || length > 256 || blob.size < 4 + length) return "*"
    val bytes = blob.copyOfRange(4, 4 + length)
    if (!bytes.all { it in 0x21..0x7e }) return "*"
    return String(bytes, Charsets.US_ASCII)
  }
}
