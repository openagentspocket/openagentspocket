#!/usr/bin/env python3
"""Unit tests for scripts/agent-lab.py: which processes `stop` may signal.

Run: python3 scripts/test_agent_lab.py
"""

import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("agent_lab", Path(__file__).with_name("agent-lab.py"))
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)
Proc = lab.Proc

ROOT = ["/private/tmp/oap-lab", "/tmp/oap-lab"]

TABLE = [
    Proc(100, 1, 100, "/tmp/oap-lab/bin/herdr server"),          # recorded, session leader
    Proc(101, 100, 101, "/bin/zsh"),                             # pane shell, own session
    Proc(102, 101, 102, "opencode --standalone"),                # the Agent
    Proc(103, 102, 102, "/opt/homebrew/bin/opencode serve --stdio"),
    Proc(200, 1, 200, "/usr/sbin/sshd -D -f /tmp/oap-lab/ssh/sshd.conf"),  # recorded
    Proc(300, 1, 100, "node src/notify-hook.js"),                # re-parented, keeps herdr's group
    Proc(400, 1, 400, "/private/tmp/oap-lab/bin/node x.js"),     # runs from inside the root
    Proc(500, 1, 500, "-zsh"),                                   # someone's shell cd'd into the root
    Proc(501, 500, 500, "tail -f /tmp/oap-lab/logs/sshd.log"),   # names a lab path, not ours
    Proc(600, 1, 600, "vim /tmp/oap-lab/repo/README.md"),
]


class SelectTargets(unittest.TestCase):
    def test_recorded_descendants_groups_and_root_executables(self):
        targets = lab.select_targets(TABLE, {100, 200}, ROOT, set())
        self.assertEqual(targets, {100, 101, 102, 103, 200, 300, 400})

    def test_never_a_shell_tail_or_editor_the_lab_did_not_start(self):
        targets = lab.select_targets(TABLE, {100, 200}, ROOT, set())
        self.assertFalse(targets & {500, 501, 600})

    def test_excluded_pids_are_never_selected(self):
        targets = lab.select_targets(TABLE, {100, 200}, ROOT, {102})
        self.assertNotIn(102, targets)

    def test_without_records_only_what_runs_from_the_root_and_its_children(self):
        self.assertEqual(lab.select_targets(TABLE, {999}, ROOT, set()), {100, 101, 102, 103, 400})

    def test_both_spellings_of_the_root(self):
        forms = lab.root_forms(Path("/tmp/oap-lab"))
        self.assertIn("/tmp/oap-lab", forms)


if __name__ == "__main__":
    unittest.main()
