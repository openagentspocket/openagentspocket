// The approval fields of a Blocked push (spec F5), from the Agent's visible
// screen as `agent read <pane> --source visible --format text` printed it.

import { approvalEpisodeId, approvalScope, extractApprovalPreview } from "./approval-preview.js";

/** The arguments that read the visible screen, on herdr and on the tmux bridge. */
export const visibleScreenArgs = (paneId) => [
  "agent",
  "read",
  paneId,
  "--source",
  "visible",
  "--format",
  "text",
];

/**
 * The CLI answers with the RPC envelope (`{"result":{"read":{"text":...}}}`);
 * plain text is accepted too. A screen without numbered options yields null,
 * and the push goes out without approval fields.
 */
export function approvalFieldsFromRead(stdout, paneId, timestamp) {
  let text = stdout;
  try {
    text = JSON.parse(stdout)?.result?.read?.text;
  } catch {
    // Not JSON: the screen itself.
  }
  const preview = extractApprovalPreview(text);
  if (preview === null) return null;
  const scope = approvalScope(preview);
  return {
    episodeId: approvalEpisodeId(paneId, timestamp),
    approvable: scope !== null,
    denyOnly: scope === "deny",
    prompt: preview.q,
    options: preview.opts,
  };
}
