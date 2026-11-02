import type { Translate } from '../errors/text';
import type { HostReading } from './scope';
import {
  buildWidgetSnapshot,
  encodeWidgetSnapshot,
  WIDGET_KINDS,
  type WidgetSnapshot,
} from './widget-snapshot';

/**
 * Where the widgets' snapshot goes: the App Group container the extension reads. The real
 * implementation is the `agentico-app-group` Expo module; core only knows this port.
 */
export interface WidgetSnapshotPort {
  /** Writes the snapshot file; false when the container is unavailable (Android, no entitlement). */
  writeSnapshot(json: string): Promise<boolean>;
  /** Asks WidgetKit to redraw the widgets of these kinds. */
  reloadWidgets(kinds: readonly string[]): Promise<void>;
}

/** Keeps the widgets' snapshot in step with the app's readings; writes only when it changes. */
export class WidgetPublisher {
  private lastJson: string | null = null;
  private snapshot: WidgetSnapshot | null = null;

  constructor(
    private readonly port: WidgetSnapshotPort,
    private readonly translate?: Translate,
  ) {}

  /** The snapshot the widgets read now. */
  get current(): WidgetSnapshot | null {
    return this.snapshot;
  }

  async publish(readings: readonly HostReading[], now: Date = new Date()): Promise<boolean> {
    const next = buildWidgetSnapshot(readings, {
      previous: this.snapshot,
      now,
      translate: this.translate,
    });
    const json = encodeWidgetSnapshot(next);
    const comparable = encodeWidgetSnapshot({
      ...next,
      hosts: next.hosts.map((host) => ({ ...host, readAt: null })),
    });
    if (comparable === this.lastJson) return false;
    if (!(await this.port.writeSnapshot(json))) return false;
    this.lastJson = comparable;
    this.snapshot = next;
    await this.port.reloadWidgets(WIDGET_KINDS);
    return true;
  }
}

/** A port that remembers writes; for tests and for platforms without widgets. */
export class MemoryWidgetPort implements WidgetSnapshotPort {
  written: string[] = [];
  reloads: (readonly string[])[] = [];

  constructor(private readonly available = true) {}

  async writeSnapshot(json: string): Promise<boolean> {
    if (!this.available) return false;
    this.written.push(json);
    return true;
  }

  async reloadWidgets(kinds: readonly string[]): Promise<void> {
    this.reloads.push(kinds);
  }
}
