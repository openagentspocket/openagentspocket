# 0016. SSH: our own Expo Module with six primitives

Status: accepted (2026-11-01)

## Decision

`modules/ssh` exposes connect/auth with host-key pinning (TOFU), exec, PTY with resize, direct-streamlocal (herdr's socket), SFTP, and direct-tcpip with a local listener. iOS wraps the libssh2 + OpenSSL package from the Swift app; Android uses JSch (mwiede fork) plus BouncyCastle for Ed25519. Keys are generated and kept natively (Keychain / Keystore); JS never sees a private key.

## Why

No existing RN SSH library offers direct-streamlocal, which herdr needs.
