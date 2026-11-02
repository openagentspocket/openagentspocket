# Windows Hosts

OpenAgentsPocket reaches a native Windows machine over SSH. Windows Hosts are added by hand: in
Hosts, tap Add Host and enter the address and login. Pairing by QR code and the Agentico plugin
are not available on native Windows.

## Requirements

- herdr 0.9.3 or newer, installed on Windows (see the herdr install guide, https://herdr.dev/docs/install/).
- OpenSSH Server, running and reachable from your phone.

## Steps

1. Install herdr on the Windows machine and start it.
2. Turn on OpenSSH Server: Settings, System, Optional features, add OpenSSH Server, then start
   the `sshd` service and set it to start automatically.
3. Allow inbound TCP port 22 (or your chosen port) in Windows Firewall.
4. In the app, open Hosts, tap Add Host, and enter the machine's address, port and Windows account.
5. Authenticate with a password, or add the Device Key line shown in the form to
   `%ProgramData%\ssh\administrators_authorized_keys` (administrator accounts) or
   `%USERPROFILE%\.ssh\authorized_keys`.
