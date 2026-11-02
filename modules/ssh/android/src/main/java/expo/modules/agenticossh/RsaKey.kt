package expo.modules.agenticossh

import com.jcraft.jsch.Identity
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.KeyPair

/**
 * An RSA private key handed over for one connection (PEM text from the secure store), read by
 * JSch's own parser: PKCS#1, PKCS#8 and unencrypted OpenSSH keys. It signs RSA-SHA2 (the
 * algorithm JSch negotiated) and is dropped when the authentication ends; nothing is persisted.
 */
internal class RsaKeyIdentity private constructor(private val pair: KeyPair) : Identity {
  override fun setPassphrase(passphrase: ByteArray?) = true

  override fun getPublicKeyBlob(): ByteArray = pair.publicKeyBlob

  override fun getSignature(data: ByteArray): ByteArray = pair.getSignature(data)

  override fun getSignature(data: ByteArray, alg: String?): ByteArray =
    if (alg == null) pair.getSignature(data) else pair.getSignature(data, alg)

  override fun getAlgName() = "ssh-rsa"

  override fun getName() = "agentico-rsa-key"

  override fun isEncrypted() = false

  override fun clear() {
    pair.dispose()
  }

  companion object {
    /** Reads `pem`; `keyEncrypted` for a passphrase-protected key, `keyInvalid` for anything unusable. */
    fun parse(pem: String): RsaKeyIdentity {
      val pair =
        try {
          KeyPair.load(JSch(), pem.toByteArray(Charsets.UTF_8), null)
        } catch (error: JSchException) {
          throw SshFailure("keyInvalid")
        }
      if (pair.isEncrypted) {
        pair.dispose()
        throw SshFailure("keyEncrypted")
      }
      if (pair.keyType != KeyPair.RSA) {
        pair.dispose()
        throw SshFailure("keyInvalid")
      }
      return RsaKeyIdentity(pair)
    }
  }
}
