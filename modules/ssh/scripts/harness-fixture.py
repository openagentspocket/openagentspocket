#!/usr/bin/env python3
"""Local fixture for the SSH module's integration harness (apps/mobile route __ssh).

Runs next to an isolated sshd + herdr backend on this machine and gives the
harness targets the herdr socket cannot:

  HTTP on 127.0.0.1:<port>
    GET  /hello      200 "hello" (direct-tcpip and loopback-forward target)
    POST /authorize  body = the app's public key line; runs --authorize-cmd KEY
    POST /report     body = the harness report; saved as <out>/harness-report.json
    POST /log        body = one line; appended to <out>/harness.log
  Unix socket at --socket (reached over direct-streamlocal), one line per connection:
    "big N"      answers N bytes of "a" and a newline (a large one-shot response)
    "stream N"   sends N bytes of "b", then closes (a large duplex read)
    anything else is echoed back

Prints one JSON line with the HTTP port and the socket path, then serves until
SIGTERM. Nothing here knows a real Host: it is loopback only.

  python3 modules/ssh/scripts/harness-fixture.py --socket /tmp/fx.sock --out ./evidence \\
      --authorize-cmd "python3 ../Agentico/scripts/isolated-herdr-backend.py authorize"
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import shlex
import signal
import socket
import socketserver
import subprocess
import sys
import threading
from pathlib import Path


def make_http_handler(out: Path, authorize_cmd: list[str]):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):  # noqa: A002 - quiet by default
            pass

        def reply(self, status: int, body: bytes) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def body(self) -> bytes:
            return self.rfile.read(int(self.headers.get("Content-Length") or 0))

        def do_GET(self):
            if self.path == "/hello":
                self.reply(200, b"hello")
            else:
                self.reply(404, b"not found")

        def do_POST(self):
            data = self.body()
            if self.path == "/authorize":
                key = data.decode().strip()
                if not key.startswith("ssh-ed25519 ") or not authorize_cmd:
                    self.reply(400, b"bad key")
                    return
                result = subprocess.run(authorize_cmd + [key], capture_output=True, text=True)
                (out / "authorize.log").write_text(result.stdout + result.stderr)
                self.reply(200 if result.returncode == 0 else 500, b"ok")
            elif self.path == "/report":
                (out / "harness-report.json").write_bytes(data)
                self.reply(200, b"saved")
            elif self.path == "/log":
                with (out / "harness.log").open("ab") as log:
                    log.write(data.rstrip(b"\n") + b"\n")
                self.reply(200, b"ok")
            else:
                self.reply(404, b"not found")

    return Handler


class LineHandler(socketserver.StreamRequestHandler):
    def handle(self):
        line = self.rfile.readline(4096).decode(errors="replace").strip()
        verb, _, arg = line.partition(" ")
        if verb in ("big", "stream") and arg.isdigit():
            size = min(int(arg), 64 * 1024 * 1024)
            fill = b"a" if verb == "big" else b"b"
            chunk = fill * 65536
            sent = 0
            while sent < size:
                part = chunk[: min(len(chunk), size - sent)]
                self.wfile.write(part)
                sent += len(part)
            if verb == "big":
                self.wfile.write(b"\n")
        else:
            self.wfile.write(line.encode() + b"\n")


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--http-port", type=int, default=0)
    parser.add_argument("--socket", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--authorize-cmd", default="")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if os.path.exists(args.socket):
        os.unlink(args.socket)

    handler = make_http_handler(out, shlex.split(args.authorize_cmd))
    web = http.server.ThreadingHTTPServer(("127.0.0.1", args.http_port), handler)
    unix = UnixServer(args.socket, LineHandler)
    for server in (web, unix):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print(json.dumps({"http_port": web.server_address[1], "socket": args.socket}), flush=True)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        web.shutdown()
        unix.shutdown()
        if os.path.exists(args.socket):
            os.unlink(args.socket)
    return 0


if __name__ == "__main__":
    sys.exit(main())
