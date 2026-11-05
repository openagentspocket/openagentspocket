/** Runs one `tmux` command on the Host and gives back what it printed. */
export interface TmuxRunner {
  run(args: readonly string[]): Promise<string>;
}

/** One line of `list-panes -a` per pane. The title comes last: it is the only free text. */
const FIELDS = [
  'session_id',
  'session_name',
  'window_id',
  'window_index',
  'window_name',
  'pane_id',
  'pane_active',
  'window_active',
  'session_attached',
  'pane_current_command',
  'pane_current_path',
  'pane_title',
] as const;

/** tmux prints control characters as `_`, so a tab or a unit separator cannot split fields. */
const SEPARATOR = '|oap|';

export const PANE_FORMAT = FIELDS.map((field) => `#{${field}}`).join(SEPARATOR);

export interface TmuxPane {
  sessionId: string;
  sessionName: string;
  windowId: string;
  windowIndex: number;
  windowName: string;
  paneId: string;
  /** The window's current pane, attached or not. */
  current: boolean;
  /** The session's current window, attached or not. */
  windowCurrent: boolean;
  /** Where a client is looking right now. */
  active: boolean;
  command: string;
  cwd: string;
  title: string;
}

function parseLine(line: string): TmuxPane | null {
  const parts = line.split(SEPARATOR);
  if (parts.length < FIELDS.length) return null;
  const [
    sessionId,
    sessionName,
    windowId,
    windowIndex,
    windowName,
    paneId,
    pane,
    window,
    attached,
  ] = parts as [string, string, string, string, string, string, string, string, string];
  return {
    sessionId,
    sessionName,
    windowId,
    windowIndex: Number(windowIndex),
    windowName,
    paneId,
    current: pane === '1',
    windowCurrent: window === '1',
    active: pane === '1' && window === '1' && attached !== '0',
    command: parts[9] ?? '',
    cwd: parts[10] ?? '',
    title: parts.slice(11).join(SEPARATOR),
  };
}

export function parsePanes(output: string): TmuxPane[] {
  return output
    .split('\n')
    .map(parseLine)
    .filter((pane) => pane !== null);
}

export async function listPanes(tmux: TmuxRunner): Promise<TmuxPane[]> {
  return parsePanes(await tmux.run(['list-panes', '-a', '-F', PANE_FORMAT]));
}
