import { type BlockedScreenIO, decodeAnsiScreen } from '@openagentspocket/core';

/** The slice of `HerdrApi` a Blocked card reads and answers with. */
export interface BlockedPaneApi {
  readAgent(params: {
    target: string;
    source: 'visible';
    format: 'ansi';
    strip_ansi: false;
  }): Promise<{ text: string }>;
  sendAgentKeys(params: { target: string; keys: string[] }): Promise<void>;
  sendPaneInput(params: { pane_id: string; text: string }): Promise<void>;
}

/**
 * The Agent's pane as a Blocked card uses it: the visible screen with its colors through
 * `agent.read`, keys through `agent.send_keys`, typed text through `pane.send_input`. Never the
 * Attach PTY. Each call resolves the live transport again, so a reconnect needs no new IO.
 */
export function herdrScreenIO(
  paneId: string,
  withApi: <V>(operation: (api: BlockedPaneApi) => Promise<V>) => Promise<V>,
): BlockedScreenIO {
  return {
    readScreen: async () => {
      const read = await withApi((api) =>
        api.readAgent({ target: paneId, source: 'visible', format: 'ansi', strip_ansi: false }),
      );
      return decodeAnsiScreen(read.text);
    },
    sendKeys: (keys) => withApi((api) => api.sendAgentKeys({ target: paneId, keys: [...keys] })),
    paste: (text) => withApi((api) => api.sendPaneInput({ pane_id: paneId, text })),
  };
}

/** Whether a transport can read and answer panes (the live one can; the demo cannot). */
export function isBlockedPaneApi(transport: unknown): transport is BlockedPaneApi {
  if (typeof transport !== 'object' || transport === null) return false;
  const candidate = transport as Record<string, unknown>;
  return (
    typeof candidate.readAgent === 'function' &&
    typeof candidate.sendAgentKeys === 'function' &&
    typeof candidate.sendPaneInput === 'function'
  );
}
