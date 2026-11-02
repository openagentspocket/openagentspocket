/** What a Changes screen reads: an Agent's directory, or a directory on a Host. */
export type ChangesTarget =
  | { readonly kind: 'agent'; readonly hostId: string; readonly paneId: string }
  | { readonly kind: 'directory'; readonly hostId: string; readonly directory: string };

/** The registry id of a target (the screens pass it around as one string). */
export function changesTargetId(target: ChangesTarget): string {
  return JSON.stringify(
    target.kind === 'agent'
      ? ['agent', target.hostId, target.paneId]
      : ['directory', target.hostId, target.directory],
  );
}

/** Undefined for ids that are not targets (the demo id). */
export function parseChangesTarget(id: string): ChangesTarget | undefined {
  try {
    const parsed: unknown = JSON.parse(id);
    if (!Array.isArray(parsed) || parsed.length !== 3) return undefined;
    const [kind, hostId, value] = parsed;
    if (typeof hostId !== 'string' || typeof value !== 'string') return undefined;
    if (kind === 'agent') return { kind, hostId, paneId: value };
    if (kind === 'directory') return { kind, hostId, directory: value };
    return undefined;
  } catch {
    return undefined;
  }
}
