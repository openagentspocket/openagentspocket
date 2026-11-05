/**
 * The executables that name an Agent in a pane. A copy of core's `PROGRAM_KINDS`, because the bridge
 * runs on the Host without core; a test keeps the two equal. Agents that run under `node` show as
 * `node` here: their hooks have to say what they are.
 */
const AGENT_EXECUTABLES: Readonly<Record<string, string>> = {
  'cursor-agent': 'cursor',
  'kiro-cli': 'kiro',
  ...Object.fromEntries(
    [
      'pi',
      'claude',
      'codex',
      'gemini',
      'devin',
      'agy',
      'cline',
      'omp',
      'mastracode',
      'opencode',
      'copilot',
      'kimi',
      'droid',
      'amp',
      'grok',
      'hermes',
      'kilo',
      'qodercli',
      'maki',
      'muse',
      'qwen',
      'letta',
    ].map((kind) => [kind, kind]),
  ),
};

export const agentExecutables = (): readonly string[] => Object.keys(AGENT_EXECUTABLES);

/** What to run for an Agent kind; undefined for an unknown one. */
export function agentExecutableOf(kind: string): string | undefined {
  return Object.keys(AGENT_EXECUTABLES).find(
    (executable) => AGENT_EXECUTABLES[executable] === kind,
  );
}

export function agentKindOf(command: string): string | undefined {
  return Object.hasOwn(AGENT_EXECUTABLES, command) ? AGENT_EXECUTABLES[command] : undefined;
}
