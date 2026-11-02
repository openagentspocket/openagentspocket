import { presentation, userFacingDescription } from '../errors/presentation';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { CancelledError } from '../hosts/cancellation';
import { foldedContains } from '../snippets/snippet';
import { type AgentSkill, skillCommand } from './agent-skill';

export type SkillsPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded' }
  | { readonly kind: 'failed'; readonly message: Text };

export interface SkillsPaneOptions {
  /** The invocation prefixes this Agent's sources use, known before anything is fetched. */
  commandPrefixes?: readonly string[];
  /** Which fetched skills this surface lists (Chat keeps out what its sends would not accept). */
  include?: (skill: AgentSkill) => boolean;
  fetch: (forceRefresh: boolean) => Promise<readonly AgentSkill[]>;
}

/** The Text a failed load shows. */
export function skillsFailureMessage(thrown: unknown): Text {
  const error = thrown instanceof TransportFailure ? thrown.error : undefined;
  if (error?.kind === 'hostFeatureUnavailable') {
    const shown = presentation(error);
    return {
      join: shown.detail === undefined ? [shown.summary] : [shown.summary, shown.detail],
      separator: ': ',
    };
  }
  if (error?.kind === 'sshUnreachable') return message('The Host is not connected.');
  if (error?.kind === 'timedOut') return message('The Host did not answer in time.');
  return message('Loading skills failed: %@', userFacingDescription(thrown));
}

/**
 * The Skills pane's load state. Fetching is lazy (first selection, not attach) and a manual
 * refresh keeps the previous list on screen. Off the SSH types: one injected `fetch`.
 */
export class SkillsPaneStore {
  private currentPhase: SkillsPhase = { kind: 'idle' };
  private items: readonly AgentSkill[] = [];
  private fetching = false;
  private readonly listeners = new Set<() => void>();
  private readonly commandPrefixes: readonly string[];
  private readonly include: (skill: AgentSkill) => boolean;
  private readonly fetchSkills: SkillsPaneOptions['fetch'];

  constructor(options: SkillsPaneOptions) {
    this.commandPrefixes = options.commandPrefixes ?? ['/'];
    this.include = options.include ?? (() => true);
    this.fetchSkills = options.fetch;
  }

  get phase(): SkillsPhase {
    return this.currentPhase;
  }

  get skills(): readonly AgentSkill[] {
    return this.items;
  }

  get projectSkills(): readonly AgentSkill[] {
    return this.items.filter((skill) => skill.scope === 'project');
  }

  get globalSkills(): readonly AgentSkill[] {
    return this.items.filter((skill) => skill.scope === 'global');
  }

  /** The catalog's prefixes plus any a loaded skill carries, longest first. */
  get triggerPrefixes(): readonly string[] {
    const prefixes = new Set(this.commandPrefixes);
    for (const skill of this.items) prefixes.add(skill.commandPrefix);
    return [...prefixes].sort((a, b) =>
      a.length !== b.length ? b.length - a.length : a < b ? -1 : a > b ? 1 : 0,
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Case- and diacritic-insensitive match over the command and the description. */
  matching(query: string): readonly AgentSkill[] {
    const trimmed = query.trim();
    if (trimmed === '') return this.items;
    return this.items.filter(
      (skill) =>
        foldedContains(skillCommand(skill), trimmed) ||
        (skill.description !== undefined && foldedContains(skill.description, trimmed)),
    );
  }

  /** The pane's appearance hook: loads once, then reuses what is loaded. */
  async loadIfNeeded(): Promise<void> {
    if (this.currentPhase.kind !== 'idle') return;
    await this.load(false);
  }

  async refresh(): Promise<void> {
    await this.load(true);
  }

  private setPhase(phase: SkillsPhase): void {
    this.currentPhase = phase;
    for (const listener of this.listeners) listener();
  }

  private async load(forceRefresh: boolean): Promise<void> {
    if (this.fetching) return;
    // Flipped before the first await so a re-selected pane racing a refresh cannot probe twice.
    this.fetching = true;
    this.setPhase({ kind: 'loading' });
    try {
      this.items = (await this.fetchSkills(forceRefresh)).filter(this.include);
      this.setPhase({ kind: 'loaded' });
    } catch (thrown) {
      // The pane went away mid-load; the next appearance starts fresh.
      if (thrown instanceof CancelledError) this.setPhase({ kind: 'idle' });
      else this.setPhase({ kind: 'failed', message: skillsFailureMessage(thrown) });
    } finally {
      this.fetching = false;
    }
  }
}
