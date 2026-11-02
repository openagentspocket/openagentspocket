#!/usr/bin/env python3
"""Local fixture for the SSH module's authentication harness (apps/mobile route __ssh-auth).

Runs next to the isolated sshd + herdr backend (Agentico repo, scripts/isolated-herdr-backend.py)
and adds what that sshd cannot offer a mobile client:

  * throwaway credentials for the isolated sshd: an RSA key in PKCS#1, PKCS#8 and OpenSSH
    formats (plus an encrypted copy and an unauthorized one) and an Ed25519 Bootstrap Key seed,
    authorized through the backend's `authorize` command;
  * `agentico-enroll`, a stand-in for the Host's Enrollment forced command, placed in the
    backend's PATH: it appends the submitted Device Key line to authorized_keys and answers
    `HERDR-ENROLL:OK:<fingerprint>`;
  * a password-only SSH server (paramiko, loopback, one throwaway user) because an unprivileged
    sshd cannot check system passwords. It answers `exec` with `ok`.
  * HTTP on 127.0.0.1 for the app: GET /cred (all of the above as JSON), POST /log, POST /report.

Nothing here knows a real Host: loopback only, random secrets, written nowhere but --out.

  python3 modules/ssh/scripts/auth-fixture.py --backend-root /tmp/agentico-iso --out ./evidence \\
      --authorize-cmd "python3 <Agentico repo>/scripts/isolated-herdr-backend.py authorize" \\
      [--vendor <dir with paramiko>]
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
import secrets
import shlex
import signal
import socket
import subprocess
import sys
import threading
from pathlib import Path


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def material() -> dict:
    from cryptography.hazmat.primitives import serialization as s
    from cryptography.hazmat.primitives.asymmetric import ed25519, rsa

    def rsa_key():
        return rsa.generate_private_key(public_exponent=65537, key_size=3072)

    def pem(key, fmt, encryption=None):
        return key.private_bytes(s.Encoding.PEM, fmt, encryption or s.NoEncryption()).decode()

    def public_line(key):
        return key.public_key().public_bytes(s.Encoding.OpenSSH, s.PublicFormat.OpenSSH).decode()

    good, unauthorized = rsa_key(), rsa_key()
    seed_key = ed25519.Ed25519PrivateKey.generate()
    seed = seed_key.private_bytes(s.Encoding.Raw, s.PrivateFormat.Raw, s.NoEncryption())
    return {
        "rsa": {
            "pkcs1": pem(good, s.PrivateFormat.TraditionalOpenSSL),
            "pkcs8": pem(good, s.PrivateFormat.PKCS8),
            "openssh": pem(good, s.PrivateFormat.OpenSSH),
            "encrypted": pem(good, s.PrivateFormat.OpenSSH, s.BestAvailableEncryption(b"throwaway")),
            "unauthorized": pem(unauthorized, s.PrivateFormat.TraditionalOpenSSL),
            "publicLine": public_line(good),
        },
        "seed": b64(seed),
        "seedPublicLine": public_line(seed_key),
    }


def install_enroll(backend_root: Path) -> None:
    """The Enrollment forced command stand-in, on the isolated backend's PATH."""
    script = backend_root / "bin" / "agentico-enroll"
    script.write_text(
        "#!/bin/sh\n"
        'IFS= read -r line || exit 1\n'
        f'tmp="{backend_root}/enroll.pub"\n'
        'printf "%s\\n" "$line" > "$tmp"\n'
        'fp=$(ssh-keygen -lf "$tmp" | awk \'{print $2}\') || exit 1\n'
        f'printf "%s\\n" "$line" >> "{backend_root}/ssh/authorized_keys"\n'
        'printf "HERDR-ENROLL:OK:%s\\n" "$fp"\n'
    )
    script.chmod(0o755)


def start_password_server(port: int, user: str, password: str):
    import paramiko

    host_key = paramiko.ECDSAKey.generate(bits=256)
    blob = host_key.asbytes()
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")

    class Server(paramiko.ServerInterface):
        def check_auth_password(self, username, candidate):
            ok = username == user and candidate == password
            return paramiko.AUTH_SUCCESSFUL if ok else paramiko.AUTH_FAILED

        def get_allowed_auths(self, username):
            return "password"

        def check_channel_request(self, kind, chanid):
            return paramiko.OPEN_SUCCEEDED if kind == "session" else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

        def check_channel_exec_request(self, channel, command):
            def answer():
                channel.send(b"ok\n")
                channel.send_exit_status(0)
                channel.close()

            threading.Thread(target=answer, daemon=True).start()
            return True

    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", port))
    listener.listen(8)

    def serve():
        while True:
            try:
                client, _ = listener.accept()
            except OSError:
                return
            transport = paramiko.Transport(client)
            transport.add_server_key(host_key)
            try:
                transport.start_server(server=Server())
            except Exception:
                client.close()

    threading.Thread(target=serve, daemon=True).start()
    return listener, fingerprint


def http_handler(out: Path, credentials: dict):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):  # noqa: A002
            pass

        def reply(self, status, body: bytes, kind="text/plain"):
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/cred":
                self.reply(200, json.dumps(credentials).encode(), "application/json")
            else:
                self.reply(404, b"not found")

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            if self.path == "/log":
                with open(out / "harness.log", "ab") as log:
                    log.write(body + b"\n")
            elif self.path == "/report":
                (out / "harness-report.json").write_bytes(body)
            else:
                return self.reply(404, b"not found")
            self.reply(200, b"ok")

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--backend-root", required=True, help="the isolated backend's --root")
    parser.add_argument("--out", required=True)
    parser.add_argument("--authorize-cmd", required=True)
    parser.add_argument("--http-port", type=int, default=47452)
    parser.add_argument("--password-port", type=int, default=47453)
    parser.add_argument("--user", required=True, help="the isolated sshd's account")
    parser.add_argument("--vendor", help="directory holding paramiko, when it is not installed")
    args = parser.parse_args()
    if args.vendor:
        sys.path.insert(0, args.vendor)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    backend_root = Path(args.backend_root)
    keys = material()
    install_enroll(backend_root)
    for line in (keys["rsa"]["publicLine"], keys["seedPublicLine"]):
        subprocess.run([*shlex.split(args.authorize_cmd), line], check=True, capture_output=True)

    password = secrets.token_urlsafe(12)
    password_user = "pwuser"
    listener, password_pin = start_password_server(args.password_port, password_user, password)
    credentials = {
        "password": {"user": password_user, "password": password, "port": args.password_port, "pin": password_pin},
        "rsa": keys["rsa"],
        "seed": keys["seed"],
        "user": args.user,
    }
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.http_port), http_handler(out, credentials))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(json.dumps({"httpPort": args.http_port, "passwordPort": args.password_port, "passwordPin": password_pin}), flush=True)

    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    stop.wait()
    server.shutdown()
    listener.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
