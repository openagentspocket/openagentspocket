package com.jcraft.jsch

/**
 * JSch takes the user name when a session is created, but Agentico learns it only after the
 * Host Key was accepted (the bridge's `connect` is the handshake, `authenticate` names the
 * account). `Session.setUserName` is package-private, so this one call lives in JSch's package.
 */
object AgenticoSessionAccess {
  fun setUserName(session: Session, username: String) {
    session.setUserName(username)
  }
}
