#!/usr/bin/env python3
"""Unit tests for scripts/agent-lab.py: which processes `stop` may signal, and the approve run's
Host checks.

Run: python3 scripts/test_agent_lab.py
"""

import importlib.util
import tempfile
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


PROOF = f"?? {lab.APPROVE_FILE}"


class ApproveChecks(unittest.TestCase):
    def test_status_with_only_the_proof_file_passes(self):
        self.assertEqual(lab.status_problems(f"{PROOF}\n", [PROOF]), [])

    def test_status_with_another_change_fails(self):
        problems = lab.status_problems(f"{PROOF}\n M README.md\n", [PROOF])
        self.assertEqual(problems, ["unexpected:  M README.md"])

    def test_status_with_an_extra_untracked_file_fails(self):
        problems = lab.status_problems(f"{PROOF}\n?? other.txt\n", [PROOF])
        self.assertEqual(problems, ["unexpected: ?? other.txt"])

    def test_status_without_the_proof_file_fails(self):
        self.assertEqual(lab.status_problems("", [PROOF]), [f"missing: {PROOF}"])

    def test_a_proof_file_under_another_name_or_folder_fails(self):
        problems = lab.status_problems(f"?? sub/{lab.APPROVE_FILE}\n", [PROOF])
        self.assertEqual(len(problems), 2)

    def test_a_clean_repository_before_approving(self):
        self.assertEqual(lab.status_problems("\n", []), [])
        self.assertEqual(lab.status_problems(" D README.md\n", []), ["unexpected:  D README.md"])

    def test_the_repository_must_be_inside_the_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "repo").mkdir()
            self.assertTrue(lab.is_inside(root / "repo", root))
            self.assertFalse(lab.is_inside(root, root))
            self.assertFalse(lab.is_inside(root.parent, root))
            (root / "escape").symlink_to(root.parent)
            self.assertFalse(lab.is_inside(root / "escape", root))

    def test_the_agent_must_work_in_the_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            repo.mkdir()
            self.assertEqual(lab.cwd_problems({"cwd": str(repo), "foreground_cwd": str(repo)},
                                              repo), [])
            self.assertEqual(len(lab.cwd_problems({"cwd": str(repo), "foreground_cwd": directory},
                                                  repo)), 1)
            self.assertEqual(len(lab.cwd_problems({"cwd": None}, repo)), 1)

    def test_the_proof_file_is_one_empty_regular_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / lab.APPROVE_FILE
            self.assertEqual(len(lab.file_problems(path)), 1)
            path.write_text("")
            self.assertEqual(lab.file_problems(path), [])
            path.write_text("x")
            self.assertEqual(len(lab.file_problems(path)), 1)
            path.unlink()
            path.symlink_to(Path(directory))
            self.assertEqual(len(lab.file_problems(path)), 1)


class ApproveFlowSelection(unittest.TestCase):
    NAMES = ["02-add-host.yaml", "04-blocked-reject.yaml", "07-usage.yaml",
             "08-blocked-approve.yaml"]

    def test_ids_resolve_as_sim_verify_picks_them(self):
        self.assertEqual(lab.flow_for(self.NAMES, "08"), "08-blocked-approve.yaml")
        self.assertEqual(lab.flow_for(self.NAMES, "approve"), "08-blocked-approve.yaml")
        self.assertEqual(lab.flow_for(self.NAMES, "04"), "04-blocked-reject.yaml")
        self.assertIsNone(lab.flow_for(self.NAMES, "99"))

    def test_the_default_flows_never_include_the_approve_flow(self):
        approve = lab.flow_for(self.NAMES, lab.APPROVE_FLOW)
        self.assertNotIn(approve, [lab.flow_for(self.NAMES, flow) for flow in lab.SIM_FLOWS])

    def test_only_the_approve_run_is_armed_and_its_command_is_anchored_text(self):
        for program in lab.SIM_PROGRAM:
            self.assertNotIn("APPROVE_ARMED", lab.SIM_PROGRAM[program])
            env = lab.approve_env(program)
            self.assertEqual(env["APPROVE_ARMED"], "1")
            self.assertTrue(env["APPROVE_PROMPT"].endswith(lab.APPROVE_COMMAND))
            self.assertRegex(lab.APPROVE_COMMAND, f"^{env['APPROVE_COMMAND']}$")
            self.assertNotRegex(f"{lab.APPROVE_COMMAND} && rm -rf x",
                                f"^{env['APPROVE_COMMAND']}$")


if __name__ == "__main__":
    unittest.main()
