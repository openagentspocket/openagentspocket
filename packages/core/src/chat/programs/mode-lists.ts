// Each program's modes as its screen draws them (read 2026-11-08; Claude Code, Codex and OpenCode
// also checked live in tmux). Match the words, never a glyph alone.
//
// Claude Code 2.1.319: footer `<symbol> <indicator> on`, the bundle's permission mode table.
// Codex 0.147.0: codex-rs/tui/src/bottom_pane/footer.rs, CollaborationModeIndicator (Plan only).
// OpenCode 2.1.3: packages/tui/src/component/prompt/metadata.tsx, the agent's title-cased id.
// Hermes: hermes_cli/cli_status_bar_mixin.py, the `⚠ YOLO` badge; nothing else is drawn.
// Pi: packages/coding-agent/src/modes/interactive/components/footer.ts, `<model> • <level>`.
// Oh My Pi: packages/tui/src/status-line/segments.ts and theme/symbols.ts.
// Grok Build: views/prompt_widget/mod.rs mode_flags, app/actions.rs PermissionLabel.

import { message } from '../../errors/text';
import { modeLabel as mode, type ProgramModes } from './modes';

export const CLAUDE_MODES: ProgramModes = {
  labels: [
    mode('manual mode on', 'Manual Mode'),
    mode('accept edits on', 'Accept Edits'),
    mode('plan mode on', 'Plan Mode'),
    mode('auto mode on', 'Auto Mode'),
    mode('bypass permissions on', 'Bypass Permissions'),
    mode("don't ask on", "Don't Ask"),
  ],
  // Versions before 2.1.3xx drew nothing in the default mode.
  otherwise: message('Default Mode'),
};

export const CODEX_MODES: ProgramModes = {
  labels: [mode('Plan mode', 'Plan Mode')],
  otherwise: message('Default Mode'),
  conversationRow: '•',
};

export const OPENCODE_MODES: ProgramModes = {
  labels: [
    mode('Build · ', 'Build'),
    mode('Build auto · ', 'Build, Auto-Accept'),
    mode('Plan · ', 'Plan'),
    mode('Plan auto · ', 'Plan, Auto-Accept'),
  ],
  otherwise: null,
};

export const HERMES_MODES: ProgramModes = {
  labels: [mode('⚠ YOLO', 'YOLO')],
  otherwise: null,
};

export const PI_MODES: ProgramModes = {
  labels: [
    mode('• thinking off', 'Thinking Off'),
    mode('• minimal', 'Thinking Minimal'),
    mode('• low', 'Thinking Low'),
    mode('• medium', 'Thinking Medium'),
    mode('• xhigh', 'Thinking Extra High'),
    mode('• high', 'Thinking High'),
    mode('• max', 'Thinking Max'),
  ],
  otherwise: null,
};

export const OMP_MODES: ProgramModes = {
  labels: [
    mode('Plan (paused)', 'Plan, Paused'),
    mode('🗺 Plan', 'Plan Mode'),
    mode(' off', 'Thinking Off'),
    mode(' min', 'Thinking Minimal'),
    mode(' low', 'Thinking Low'),
    mode(' med', 'Thinking Medium'),
    mode(' xhigh', 'Thinking Extra High'),
    mode(' xhi', 'Thinking Extra High'),
    mode(' high', 'Thinking High'),
    mode(' max', 'Thinking Max'),
  ],
  otherwise: null,
};

export const GROK_MODES: ProgramModes = {
  labels: [
    mode('· plan', 'Plan Mode'),
    mode('· always-approve', 'Always Approve'),
    mode('· auto-review', 'Auto Mode'),
  ],
  otherwise: message('Normal Mode'),
};
