// Where Grok Build files a session: `<group>/<id>/updates.jsonl` under `~/.grok/sessions`.

/** `<root>/<group>` for a transcript at `<root>/<group>/<id>/updates.jsonl`. */
export function groupDirectoryOfTranscript(path: string): string {
  return path.split('/').slice(0, -2).join('/');
}
