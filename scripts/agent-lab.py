#!/usr/bin/env python3
"""A throwaway Host with real coding agents in it, for proving the app against real programs.

Everything lives under one short root (default /tmp/oap-lab), with a constructed environment
(nothing inherited) and its own HOME, so the programs, herdr and its integrations never read or
write the account's real configuration:

  <root>/home     HOME, XDG_* and CODEX_HOME for every lab process
  <root>/repo     the throwaway git repository the Agents work in
  <root>/ssh      sshd config, host key, a client key and authorized_keys (127.0.0.1 only)
  <root>/captures what `probe` captured (screens, store output, report.json)

  start      herdr server, sshd, herdr's integration for each program (into the lab HOME only),
             and one Agent per program in its own pane, started in the repository
  status     what runs, the Host settings an app needs, each program's login state
  herdr      a herdr command in the lab (`agent-lab.py herdr -- agent read oc`)
  ssh        a command over the lab's sshd, as the app runs it
  authorize  append a public key (the app's Device Key) to the lab's authorized_keys
  probe      run the app's own code against the running Agents (packages/transport/src/lab)
  run        a program's own command in the lab environment (`agent-lab.py run -- codex login status`)
  sim        the app in the iOS simulator against the lab: Maestro flows of e2e/live
  stop       stop everything the lab started and remove the root

`start --plugin` links this repository's herdr plugin (packages/plugin) into the lab's herdr, as
the Setup Guide installs it on a Host; Usage needs it.

Programs (`--programs`, default `opencode`):
  opencode  `opencode --standalone` (a private server, never the account's background service)
            with OpenCode's free models, which need no account. Permissions `ask` for bash, edit
            and webfetch, from the repository's opencode.json.
  codex     `codex` in a read-only sandbox asking before anything else (approval_policy
            "on-request"; 0.167 dropped "untrusted"), so a write waits for approval. It needs a login
            and the lab never copies or links the account's credentials: without one in the lab
            HOME it shows its sign-in screen. See docs/e2e-live-backend.md.
"""

from __future__ import annotations

import argparse
import json
import os
import pwd
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = Path("/tmp/oap-lab")
MARKER = ".oap-agent-lab"
SSH_PORT_RANGE = range(47440, 47460)
SYSTEM_PATH = ("/usr/bin", "/bin", "/usr/sbin", "/sbin")
SFTP_SERVER = "/usr/libexec/sftp-server"
PROGRAMS = {
    # name: (herdr agent name, herdr --kind, extra program arguments)
    "opencode": ("oc", "opencode", ["--standalone"]),
    "codex": ("cx", "codex", ["-c", "check_for_update_on_startup=false"]),
}
OPENCODE_MODEL = "opencode/big-pickle"
PERMISSION_ASK = {"bash": "ask", "edit": "ask", "webfetch": "ask"}


class LabError(Exception):
    """A refusal or failure to print without a traceback."""


def lab_env(root: Path, user: str) -> Dict[str, str]:
    """The complete environment of every lab process: nothing is inherited."""
    home = root / "home"
    return {
        "HOME": str(home), "USER": user, "LOGNAME": user,
        "PATH": ":".join([str(root / "bin"), *SYSTEM_PATH]),
        "SHELL": "/bin/zsh", "TERM": "xterm-256color", "LANG": "en_US.UTF-8",
        "XDG_CONFIG_HOME": str(home / ".config"), "XDG_DATA_HOME": str(home / ".local/share"),
        "XDG_STATE_HOME": str(home / ".local/state"), "XDG_CACHE_HOME": str(home / ".cache"),
        "CODEX_HOME": str(home / ".codex"), "TMPDIR": str(root / "tmp"),
        "OPENCODE_DISABLE_AUTOUPDATE": "1",
    }


def force_command(root: Path) -> str:
    """sshd's ForceCommand: every login gets the lab environment, as the app would find it."""
    env = lab_env(root, "$USER")
    exports = [f"{name}={env[name]}; export {name}" for name in
               ("HOME", "PATH", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
                "XDG_CACHE_HOME", "CODEX_HOME", "TMPDIR")]
    return "\n".join([
        "#!/bin/sh",
        "unset HERDR_SOCKET_PATH HERDR_SESSION HERDR_ENV HERDR_PANE_ID XDG_RUNTIME_DIR",
        *exports,
        'if [ -n "$SSH_ORIGINAL_COMMAND" ]; then exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"; fi',
        "exec /bin/sh", ""])


def sshd_config(root: Path, port: int, user: str) -> str:
    ssh = root / "ssh"
    return "\n".join([
        f"Port {port}", "ListenAddress 127.0.0.1", f"HostKey {ssh / 'host_ed25519'}",
        f"PidFile {ssh / 'sshd.pid'}", "PasswordAuthentication no",
        "KbdInteractiveAuthentication no", "PubkeyAuthentication yes",
        f"AuthorizedKeysFile {ssh / 'authorized_keys'}", "UsePAM yes", "PermitRootLogin no",
        f"AllowUsers {user}", "StrictModes no", "PerSourcePenalties no", "PrintMotd no",
        "PrintLastLog no", "LogLevel VERBOSE", "AllowStreamLocalForwarding yes",
        f"Subsystem sftp {SFTP_SERVER}", f"SetEnv HOME={root / 'home'}",
        f"ForceCommand exec /bin/sh {root / 'force-command.sh'}", ""])


# ---------------------------------------------------------------------------- plumbing


def state_path(root: Path) -> Path:
    return root / "state.json"


def load_state(root: Path) -> dict:
    try:
        return json.loads(state_path(root).read_text())
    except FileNotFoundError:
        raise LabError(f"No lab at {root}") from None


def save_state(state: dict) -> None:
    path = state_path(Path(state["root"]))
    path.with_suffix(".tmp").write_text(json.dumps(state, indent=2) + "\n")
    path.with_suffix(".tmp").replace(path)


def command_of(pid: int) -> Optional[str]:
    out = subprocess.run(["ps", "-o", "command=", "-p", str(pid)], capture_output=True, text=True)
    return out.stdout.strip() or None


def is_ours(record: Optional[dict]) -> bool:
    if not record:
        return False
    command = command_of(record["pid"])
    return command is not None and record["marker"] in command


def wait_until(predicate, seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.2)
    return predicate()


def port_free(port: int) -> bool:
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def port_accepts(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def spawn(arguments: List[str], root: Path, user: str, log: Path, cwd: Path) -> int:
    with open(log, "ab") as output:
        return subprocess.Popen(arguments, env=lab_env(root, user), cwd=cwd,
                                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                                start_new_session=True).pid


def herdr(state: dict, arguments: List[str], timeout: float = 60) -> subprocess.CompletedProcess:
    root = Path(state["root"])
    return subprocess.run([str(root / "bin" / "herdr"), *arguments], env=lab_env(root, state["user"]),
                          cwd=root / "repo", capture_output=True, text=True, timeout=timeout)


def herdr_json(state: dict, arguments: List[str]) -> dict:
    done = herdr(state, arguments)
    if done.returncode:
        raise LabError(f"herdr {' '.join(arguments)} failed: {(done.stderr or done.stdout).strip()}")
    return json.loads(done.stdout)


def lab_program(state: dict, arguments: List[str], timeout: float = 30) -> subprocess.CompletedProcess:
    root = Path(state["root"])
    return subprocess.run(arguments, env=lab_env(root, state["user"]), cwd=root / "repo",
                          capture_output=True, text=True, timeout=timeout)


def resolve(name: str, fallback: Optional[str] = None) -> str:
    found = shutil.which(name) or fallback
    if not found:
        raise LabError(f"{name} not found on PATH")
    return os.path.realpath(found)


class Proc(NamedTuple):
    pid: int
    ppid: int
    pgid: int
    command: str


def root_forms(root: Path) -> List[str]:
    """The root as a command line may spell it: /tmp and /private/tmp are one directory on macOS."""
    forms = {str(root), os.path.realpath(str(root))}
    forms |= {form[len("/private"):] for form in list(forms) if form.startswith("/private/")}
    return sorted(forms)


def select_targets(table: List[Proc], recorded: Set[int], root_paths: List[str],
                   exclude: Set[int]) -> Set[int]:
    """The processes the lab may signal: the ones it recorded, their descendants, members of the
    recorded process groups (each spawn leads its own session, so a child re-parented to launchd
    keeps its group), and anything executing from inside the root with its descendants. Never a
    pid in `exclude`. A process that only names a path in the root (`tail -f <root>/log`) or sits
    in it as its working directory is not selected."""
    children: Dict[int, List[int]] = {}
    for proc in table:
        children.setdefault(proc.ppid, []).append(proc.pid)
    inside = {proc.pid for proc in table
              if any(proc.command.startswith(form + "/") for form in root_paths)}
    targets = {proc.pid for proc in table if proc.pid in recorded} | inside
    pending = list(targets)
    while pending:
        for child in children.get(pending.pop(), []):
            if child not in targets:
                targets.add(child)
                pending.append(child)
    targets |= {proc.pid for proc in table if proc.pgid in recorded}
    return targets - exclude


def process_table() -> List[Proc]:
    listing = subprocess.run(["ps", "-axo", "pid=,ppid=,pgid=,command="], capture_output=True,
                             text=True)
    table = []
    for line in listing.stdout.splitlines():
        parts = line.split(None, 3)
        if len(parts) == 4 and parts[0].isdigit():
            table.append(Proc(int(parts[0]), int(parts[1]), int(parts[2]), parts[3]))
    return table


def own_ancestry(table: List[Proc]) -> Set[int]:
    """This script and the shells that called it, which may sit in the root."""
    parents = {proc.pid: proc.ppid for proc in table}
    found: Set[int] = set()
    pid = os.getpid()
    while pid > 1 and pid not in found:
        found.add(pid)
        pid = parents.get(pid, 1)
    return found


def holders(root: Path) -> Set[int]:
    """Processes with a file or working directory under the root."""
    held = subprocess.run(["lsof", "-t", "+D", str(root)], capture_output=True, text=True)
    return {int(line) for line in held.stdout.split() if line.strip().isdigit()}


# ---------------------------------------------------------------------------- start


def prepare_root(root: Path) -> None:
    if root.exists():
        if not (root / MARKER).exists():
            raise LabError(f"{root} exists and is not a lab root; pick another --root")
        if state_path(root).exists() and any(is_ours(r) for r in load_state(root)["processes"].values()):
            raise LabError(f"A lab is already running at {root}; stop it first")
        shutil.rmtree(root)
    for relative in ("bin", "home/.config/opencode", "home/.codex", "repo", "logs", "ssh",
                     "tmp", "captures"):
        (root / relative).mkdir(parents=True, exist_ok=True)
    (root / MARKER).write_text("Created by scripts/agent-lab.py\n")
    (root / "home" / ".zshrc").write_text("")


def link_tools(root: Path, programs: List[str]) -> None:
    tools = {"herdr": resolve("herdr", str(Path.home() / ".local/bin/herdr")), "node": resolve("node")}
    for program in programs:
        tools[program] = resolve(program)
    for name, target in tools.items():
        os.symlink(target, root / "bin" / name)


def write_repository(root: Path, user: str) -> None:
    repo = root / "repo"
    (repo / "README.md").write_text("scratch\n")
    (repo / "opencode.json").write_text(json.dumps({"permission": PERMISSION_ASK}, indent=2) + "\n")
    env = lab_env(root, user)
    git = ["git", "-c", "user.name=Lab", "-c", "user.email=lab@example.invalid"]
    for arguments in (["init", "-q"], ["add", "."], ["commit", "-q", "-m", "scratch"]):
        subprocess.run(["/usr/bin/git", *git[1:], *arguments], cwd=repo, env=env, check=True)


def write_program_config(root: Path, program: str) -> None:
    home = root / "home"
    if program == "opencode":
        config = {"model": OPENCODE_MODEL, "autoupdate": False, "share": "disabled",
                  "permission": PERMISSION_ASK}
        (home / ".config/opencode/opencode.json").write_text(json.dumps(config, indent=2) + "\n")
    if program == "codex":
        # Written after herdr's integration, which creates config.toml with its hooks table: the
        # top-level keys go before it, the project table after.
        config = home / ".codex/config.toml"
        integration = config.read_text() if config.exists() else ""
        config.write_text('approval_policy = "on-request"\nsandbox_mode = "read-only"\n'
                          "check_for_update_on_startup = false\n\n" + integration +
                          f'\n[projects."{root.resolve() / "repo"}"]\ntrust_level = "trusted"\n')


def start_server(state: dict) -> None:
    root = Path(state["root"])
    log = root / "logs" / "herdr-server.log"
    pid = spawn([str(root / "bin" / "herdr"), "server"], root, state["user"], log, root / "repo")
    state["processes"]["herdr"] = {"pid": pid, "marker": str(root / "bin" / "herdr"), "log": str(log)}
    save_state(state)
    socket_file = root / "home/.config/herdr/herdr.sock"
    if not wait_until(socket_file.exists, 15):
        raise LabError(f"herdr server did not create {socket_file}; see {log}")


def start_sshd(state: dict, port: int, extra_keys: List[str]) -> None:
    root = Path(state["root"])
    ssh = root / "ssh"
    for name in ("host_ed25519", "client_ed25519"):
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", f"oap-lab-{name}",
                        "-f", str(ssh / name)], check=True, capture_output=True)
    client = (ssh / "client_ed25519.pub").read_text().strip()
    (ssh / "authorized_keys").write_text("\n".join([client, *extra_keys]) + "\n")
    host_key = (ssh / "host_ed25519.pub").read_text().strip()
    (ssh / "known_hosts").write_text(f"[127.0.0.1]:{port} {host_key}\n")
    (root / "force-command.sh").write_text(force_command(root))
    config = ssh / "sshd.conf"
    config.write_text(sshd_config(root, port, state["user"]))
    checked = subprocess.run(["/usr/sbin/sshd", "-t", "-f", str(config)], capture_output=True, text=True)
    if checked.returncode:
        raise LabError(f"sshd rejected {config}: {checked.stderr.strip()}")
    log = root / "logs" / "sshd.log"
    pid = spawn(["/usr/sbin/sshd", "-D", "-e", "-f", str(config)], root, state["user"], log, root)
    state["processes"]["sshd"] = {"pid": pid, "marker": str(config), "log": str(log)}
    state["ssh_port"] = port
    save_state(state)
    if not wait_until(lambda: port_accepts(port), 10):
        raise LabError(f"sshd did not listen on {port}; see {log}")


def start_agents(state: dict) -> None:
    root = Path(state["root"])
    created = herdr_json(state, ["workspace", "create", "--cwd", str(root / "repo")])
    pane = created["result"]["root_pane"]["pane_id"]
    for index, program in enumerate(state["programs"]):
        if index:
            split = herdr_json(state, ["pane", "split", pane, "--direction", "right",
                                       "--cwd", str(root / "repo"), "--no-focus"])
            pane = split["result"]["pane"]["pane_id"]
        name, kind, arguments = PROGRAMS[program]
        started = herdr(state, ["agent", "start", name, "--kind", kind, "--pane", pane,
                                "--timeout", "60000", "--", *arguments], timeout=90)
        state["agents"][program] = {"name": name, "pane": pane,
                                    "start": (started.stdout or started.stderr).strip()[-400:]}
        save_state(state)


def command_start(args: argparse.Namespace) -> int:
    root = Path(os.path.abspath(args.root))
    programs = [name.strip() for name in args.programs.split(",") if name.strip()]
    unknown = [name for name in programs if name not in PROGRAMS]
    if unknown or not programs:
        raise LabError(f"Unknown program(s) {unknown}; choose from {', '.join(PROGRAMS)}")
    port = args.port or next((p for p in SSH_PORT_RANGE if port_free(p)), None)
    if port is None or not port_free(port):
        raise LabError("No free SSH port; pass --port")
    extra_keys = [line.strip() for value in args.authorized_key for line in
                  (Path(value).read_text() if Path(value).is_file() else value).splitlines() if line.strip()]
    prepare_root(root)
    user = pwd.getpwuid(os.getuid()).pw_name
    state = {"root": str(root), "user": user, "programs": programs, "processes": {},
             "agents": {}, "ssh_port": None, "started_at": time.time()}
    save_state(state)
    try:
        link_tools(root, programs)
        write_repository(root, user)
        for program in programs:
            installed = herdr(state, ["integration", "install", program])
            if installed.returncode:
                raise LabError(f"herdr integration install {program}: {installed.stderr.strip()}")
            write_program_config(root, program)
        if args.plugin:
            # Before the server starts, so the plugin's startup hook records its runtime (Usage).
            linked = herdr(state, ["plugin", "link", str(REPO_ROOT / "packages/plugin")])
            if linked.returncode:
                raise LabError(f"herdr plugin link: {(linked.stderr or linked.stdout).strip()}")
            state["plugin"] = True
        start_server(state)
        start_sshd(state, port, extra_keys)
        start_agents(state)
    except BaseException:
        print(f"start failed; stopping what was started (logs in {root}/logs)", file=sys.stderr)
        stop_everything(state)
        raise
    print_status(state)
    return 0


# ---------------------------------------------------------------------------- status and helpers


def login_state(state: dict, program: str) -> str:
    if program == "codex":
        done = lab_program(state, ["codex", "-c", "check_for_update_on_startup=false", "login", "status"])
        return (done.stdout or done.stderr).strip().splitlines()[-1] if (done.stdout or done.stderr) else "?"
    return f"no account needed ({OPENCODE_MODEL})"


def ssh_base(state: dict) -> List[str]:
    root = Path(state["root"])
    return ["ssh", "-F", "/dev/null", "-i", str(root / "ssh/client_ed25519"), "-p", str(state["ssh_port"]),
            "-o", f"UserKnownHostsFile={root / 'ssh/known_hosts'}", "-o", "IdentitiesOnly=yes",
            "-o", "BatchMode=yes", f"{state['user']}@127.0.0.1"]


def print_status(state: dict, as_json: bool = False) -> bool:
    processes = {name: {"pid": record["pid"], "alive": is_ours(record)}
                 for name, record in state["processes"].items()}
    listing = herdr(state, ["agent", "list"]) if processes.get("herdr", {}).get("alive") else None
    report = {"root": state["root"], "ssh_port": state["ssh_port"], "user": state["user"],
              "processes": processes, "agents": state["agents"],
              "logins": {program: login_state(state, program) for program in state["programs"]},
              "client_key": f"{state['root']}/ssh/client_ed25519",
              "herdr_agents": json.loads(listing.stdout) if listing and listing.returncode == 0 else None}
    healthy = all(entry["alive"] for entry in processes.values())
    if as_json:
        print(json.dumps(report, indent=2))
        return healthy
    print(f"root: {state['root']}")
    for name, entry in processes.items():
        print(f"{name}: pid {entry['pid']} {'running' if entry['alive'] else 'NOT RUNNING'}")
    for program, agent in state["agents"].items():
        print(f"{program}: Agent {agent['name']} in pane {agent['pane']}; login: {report['logins'][program]}")
    print(f"App Host: address 127.0.0.1, port {state['ssh_port']}, username {state['user']}, Device Key")
    print(f"Test login: {' '.join(ssh_base(state))} 'herdr agent list'")
    return healthy


def command_status(args: argparse.Namespace) -> int:
    return 0 if print_status(load_state(Path(os.path.abspath(args.root))), args.json) else 1


def rest(arguments: List[str]) -> List[str]:
    arguments = list(arguments)
    if arguments and arguments[0] == "--":
        arguments = arguments[1:]
    if not arguments:
        raise LabError("Nothing to run; pass arguments after --")
    return arguments


def command_herdr(args: argparse.Namespace) -> int:
    state = load_state(Path(os.path.abspath(args.root)))
    root = Path(state["root"])
    return subprocess.run([str(root / "bin" / "herdr"), *rest(args.arguments)],
                          env=lab_env(root, state["user"]), cwd=root / "repo").returncode


def command_ssh(args: argparse.Namespace) -> int:
    state = load_state(Path(os.path.abspath(args.root)))
    return subprocess.run([*ssh_base(state), " ".join(rest(args.arguments))]).returncode


def command_authorize(args: argparse.Namespace) -> int:
    root = Path(os.path.abspath(args.root))
    load_state(root)
    with open(root / "ssh/authorized_keys", "a") as output:
        for key in args.keys:
            output.write(key.strip() + "\n")
    print(f"Authorized {len(args.keys)} key(s) in {root / 'ssh/authorized_keys'}")
    return 0


def command_probe(args: argparse.Namespace) -> int:
    root = Path(os.path.abspath(args.root))
    load_state(root)
    env = dict(os.environ, OAP_LAB_ROOT=str(root), OAP_LAB_STEP=args.step)
    for name, value in (("OAP_LAB_PROGRAM", args.program), ("OAP_LAB_SEND", args.send),
                        ("OAP_LAB_KEYS", args.keys), ("OAP_LAB_ANSWER", args.answer),
                        ("OAP_LAB_STOP", "1" if args.stop else None),
                        ("OAP_LAB_USAGE", "1" if args.usage else None)):
        if value is not None:
            env[name] = value
    return subprocess.run(["pnpm", "-F", "@openagentspocket/transport", "exec", "vitest", "run",
                           "src/lab/live-lab.test.ts"], cwd=REPO_ROOT, env=env).returncode


def command_run(args: argparse.Namespace) -> int:
    """A program's own command in the lab environment, attached to this terminal (for example a
    login the account owner types). Its output goes to whoever runs it, never to a file."""
    state = load_state(Path(os.path.abspath(args.root)))
    root = Path(state["root"])
    return subprocess.run(rest(args.arguments), env=lab_env(root, state["user"]),
                          cwd=root / "repo").returncode


SIM_UDID = "2798C301-E0BB-41EF-A61F-4999184DFD05"
SIM_FLOWS = ["02", "03", "04", "05", "06", "07"]


def command_sim(args: argparse.Namespace) -> int:
    """The app in the simulator against the lab: e2e/live through scripts/sim-verify.mjs --live."""
    state = load_state(Path(os.path.abspath(args.root)))
    root = Path(state["root"])
    env_file = root / "sim-env.json"
    listed = subprocess.run(["ssh-keygen", "-lf", str(root / "ssh/host_ed25519.pub")],
                            capture_output=True, text=True, check=True).stdout.split()
    # Maestro reads assertVisible as a regular expression; a fingerprint holds `+` and `/`.
    env_file.write_text(json.dumps({"HOST": "127.0.0.1", "PORT": state["ssh_port"],
                                    "USER": state["user"],
                                    "FINGERPRINT": re.escape(listed[1])}) + "\n")
    base = ["node", "scripts/sim-verify.mjs", "--live", "--flows", "e2e/live", "--env-file",
            str(env_file), "--port", str(args.port), "--udid", args.udid]
    flows = args.flows.split(",") if args.flows else SIM_FLOWS
    if not args.flows or flows[0] == "01":
        flows = [flow for flow in flows if flow != "01"]
        # A fresh app: its Device Key goes into the lab's own authorized_keys, nowhere else.
        if subprocess.run([*base, "--keep", "01"], cwd=REPO_ROOT).returncode:
            return 1
        pasted = subprocess.run(["xcrun", "simctl", "pbpaste", args.udid], capture_output=True,
                                text=True).stdout.strip()
        if not pasted.startswith("ssh-ed25519 ") or "\n" in pasted:
            raise LabError("The simulator's pasteboard holds no Device Key line")
        with open(root / "ssh/authorized_keys", "a") as output:
            output.write(pasted + "\n")
        print("Authorized the app's Device Key in the lab's authorized_keys")
        agent = state["agents"].get("opencode")
        if agent and not herdr_json(state, ["agent", "get", agent["name"]])["result"]["agent"].get(
                "agent_session"):
            # OpenCode's home screen takes no message from Chat: the first one goes in the terminal.
            herdr(state, ["agent", "prompt", agent["name"], "Reply with the single word pong.",
                          "--wait", "--timeout", "120000"], timeout=150)
    keep = ["--keep"] if args.keep else []
    return subprocess.run([*base, *keep, *flows], cwd=REPO_ROOT).returncode


# ---------------------------------------------------------------------------- stop


def terminate(pids: List[int]) -> None:
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    wait_until(lambda: all(command_of(pid) is None for pid in pids), 5)
    for pid in pids:
        if command_of(pid) is not None:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def stop_everything(state: dict) -> Tuple[List[str], List[str]]:
    """Signals only the lab's own processes. Returns (survivors, foreign holders) as `pid command`
    lines; a process the lab did not start that holds a file under the root is never signalled."""
    root = Path(state["root"])
    forms = root_forms(root)
    recorded = {r["pid"] for r in state["processes"].values() if is_ours(r)}
    table = process_table()
    exclude = own_ancestry(table)
    # Walked before anything stops, while every child still has its parent.
    known = select_targets(table, recorded, forms, exclude)
    herdr_record = state["processes"].get("herdr")
    if is_ours(herdr_record):
        try:
            herdr(state, ["server", "stop"], timeout=20)
        except subprocess.TimeoutExpired:
            pass
        wait_until(lambda: not is_ours(herdr_record), 10)
    known |= select_targets(process_table(), recorded | known, forms, exclude)
    terminate(sorted(known))
    commands = {proc.pid: proc.command for proc in process_table()}
    survivors = [f"{pid} {commands[pid]}" for pid in sorted(known) if pid in commands]
    foreign = [f"{pid} {commands.get(pid, '?')}" for pid in sorted(holders(root) - known - exclude)]
    return survivors, foreign


def command_stop(args: argparse.Namespace) -> int:
    root = Path(os.path.abspath(args.root))
    if not (root / MARKER).exists():
        raise LabError(f"{root} is not a lab root (no {MARKER})")
    state = load_state(root) if state_path(root).exists() else {"root": str(root), "processes": {}}
    survivors, foreign = stop_everything(state)
    if survivors or foreign:
        for line in survivors:
            print(f"still running (started by the lab): {line}", file=sys.stderr)
        for line in foreign:
            print(f"not started by the lab, holds a file under the root, not signalled: {line}",
                  file=sys.stderr)
        print(f"Root kept for inspection: {root}", file=sys.stderr)
        return 1
    if args.keep:
        print(f"Stopped; kept {root}")
    else:
        shutil.rmtree(root)
        print(f"Stopped; removed {root}")
    return 0


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    top.add_argument("--root", default=str(DEFAULT_ROOT))
    commands = top.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start")
    start.add_argument("--programs", default="opencode")
    start.add_argument("--port", type=int)
    start.add_argument("--plugin", action="store_true",
                       help="link this repository's herdr plugin into the lab (Usage, notifications)")
    start.add_argument("--authorized-key", action="append", default=[], metavar="KEY_OR_FILE")
    start.set_defaults(handler=command_start)
    status = commands.add_parser("status")
    status.add_argument("--json", action="store_true")
    status.set_defaults(handler=command_status)
    for name, handler in (("herdr", command_herdr), ("ssh", command_ssh)):
        sub = commands.add_parser(name)
        sub.add_argument("arguments", nargs=argparse.REMAINDER)
        sub.set_defaults(handler=handler)
    authorize = commands.add_parser("authorize")
    authorize.add_argument("keys", nargs="+")
    authorize.set_defaults(handler=command_authorize)
    probe = commands.add_parser("probe")
    probe.add_argument("--step", default="snapshot", help="name of the capture directory")
    probe.add_argument("--program", help="probe only this program's Agent")
    probe.add_argument("--send", help="then send this as a Chat message, as the Composer does")
    probe.add_argument("--keys", help="then press these herdr keys (comma separated)")
    probe.add_argument("--answer", help="then tap this Blocked card option (1-based); only Deny, "
                       "Reject, Cancel or a question answer is ever tapped")
    probe.add_argument("--stop", action="store_true", help="then press Chat's Stop for the program")
    probe.add_argument("--usage", action="store_true",
                       help="also read Usage through the plugin (start with --plugin)")
    probe.set_defaults(handler=command_probe)
    run = commands.add_parser("run", help="a program's own command in the lab environment")
    run.add_argument("arguments", nargs=argparse.REMAINDER)
    run.set_defaults(handler=command_run)
    sim = commands.add_parser("sim", help="the app in the simulator against the lab (e2e/live)")
    sim.add_argument("--udid", default=SIM_UDID)
    sim.add_argument("--port", type=int, default=8088, help="Metro port")
    sim.add_argument("--flows", help="comma-separated flows; starting with 01 sets the app up "
                     "again (Device Key), otherwise they run on an app already set up")
    sim.add_argument("--keep", action="store_true", help="leave the simulator booted")
    sim.set_defaults(handler=command_sim)
    stop = commands.add_parser("stop")
    stop.add_argument("--keep", action="store_true")
    stop.set_defaults(handler=command_stop)
    return top


def main(argv: Optional[List[str]] = None) -> int:
    args = parser().parse_args(argv)
    try:
        return args.handler(args)
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
