export type DictationFailure = 'permission' | 'stopped';

interface SpeechEvents {
  /** One finished phrase. */
  onFinal(text: string): void;
  onError(): void;
  onEnd(): void;
}

/** The system's speech recognizer, as dictation uses it. */
export interface SpeechEngine {
  requestPermission(): Promise<boolean>;
  start(events: SpeechEvents): void;
  stop(): void;
}

/** Dictates into the draft: phrases land as they finish, and the Agent gets nothing until Send. */
export class DictationController {
  private active = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly engine: SpeechEngine,
    private readonly insert: (text: string) => void,
    private readonly onFailure: (reason: DictationFailure) => void = () => {},
  ) {}

  get listening(): boolean {
    return this.active;
  }

  readonly getSnapshot = (): boolean => this.active;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async toggle(): Promise<void> {
    if (this.active) {
      this.engine.stop();
      return;
    }
    if (!(await this.engine.requestPermission())) {
      this.onFailure('permission');
      return;
    }
    this.set(true);
    this.engine.start({
      onFinal: (text) => {
        const phrase = text.trim();
        if (phrase !== '') this.insert(`${phrase} `);
      },
      onError: () => {
        if (!this.active) return;
        this.set(false);
        this.onFailure('stopped');
      },
      onEnd: () => this.set(false),
    });
  }

  private set(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    for (const listener of this.listeners) listener();
  }
}
