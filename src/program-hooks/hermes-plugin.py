"""Installed by OpenAgentsPocket: forwards Hermes' asks and ends of turn to its notify hook."""
import json
import os
import subprocess


def _forward(event, **fields):
    payload = {
        "event": event,
        "cwd": os.getcwd(),
        "session_id": fields.get("session_id"),
        "command": fields.get("command"),
        "description": fields.get("description"),
    }
    try:
        child = subprocess.Popen(
            ["__NODE__", "__HOOK__", "hermes"],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        child.stdin.write(json.dumps(payload).encode())
        child.stdin.close()
    except OSError:
        pass


def _turn_ended(**fields):
    _forward("post_llm_call", **fields)


def _approval_asked(**fields):
    _forward("pre_approval_request", **fields)


def register(ctx):
    ctx.register_hook("post_llm_call", _turn_ended)
    ctx.register_hook("pre_approval_request", _approval_asked)
