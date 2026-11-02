import { Observable } from '../changes/observable';
import type { Text } from '../errors/text';
import { message } from '../errors/text';
import { asTransportError } from '../errors/transport-error';
import type { Clock } from '../hosts/cancellation';
import {
  discoveryMessage,
  type PortPreviewFailure,
  type PortsMessage,
  pageFailure,
  portPreviewFailure,
} from './failure';
import type { PortPreviewHost, PortPreviewTunnel } from './host';
import {
  displayName,
  type ForwardTarget,
  forwardTarget,
  isHiddenByDefault,
  type ListeningPort,
  type ListeningPortReport,
} from './types';

/** Background past this long stops the tunnel (spec: 15 s). */
export const PREVIEW_GRACE_MS = 15_000;
/** WebKit can report a reset before the tunnel recorded its cause. */
export const FAILURE_RECHECK_MS = 200;

export type Listing =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly report: ListeningPortReport }
  /** Why the discovery failed, in the user's words. */
  | { readonly kind: 'failed'; readonly message: PortsMessage };

export type PreviewPhase =
  /** Dialling the Host or binding the phone port. */
  | { readonly kind: 'opening' }
  | { readonly kind: 'open'; readonly url: string; readonly localPort: number }
  /** Stopped while the app was in the background. */
  | { readonly kind: 'paused' }
  | { readonly kind: 'failed'; readonly failure: PortPreviewFailure };

/** The preview on screen: the Host's port it shows and where its tunnel stands. */
export interface Preview {
  readonly target: ForwardTarget;
  /** The row's name: a container, a process, or "port N". */
  readonly title: Text;
  readonly phase: PreviewPhase;
  /** Bumped on each (re)open, so the web view loads the URL again even when it did not change. */
  readonly loadId: number;
}

export interface PortsState {
  readonly listing: Listing | null;
  /** A discovery is running; the previous list stays on screen. */
  readonly isRefreshing: boolean;
  /** Why the latest refresh failed while an earlier list stays on screen. */
  readonly refreshFailure: PortsMessage | null;
  /** Shows the rows `isHiddenByDefault` keeps back (system ports, sshd, herdr). */
  readonly showsAll: boolean;
  readonly preview: Preview | null;
}

/** A page load that failed; cancellations (a newer navigation, a policy change) say nothing. */
export interface PageError {
  readonly cancelled: boolean;
  readonly message: string;
}

export interface PortsStoreOptions {
  readonly hostName: string;
  readonly host: PortPreviewHost;
  readonly clock: Clock;
  readonly gracePeriodMs?: number;
}

/**
 * The Ports screens' model: the TCP servers listening on one Host, and at most one preview of one
 * of them through a loopback tunnel on the preview's own SSH connection.
 *
 * - The tunnel listens only while the Preview screen is up: `closePreview` (the screen left) and
 *   `close` (the Ports screens closed) stop it.
 * - Background: past the grace period the tunnel stops and the connection drops (`paused`); the
 *   next foreground return dials again and reloads the page. A return after a longer absence than
 *   the grace period, whose timer the suspended process never ran, restarts the same way.
 */
export class PortsStore extends Observable<PortsState> {
  readonly hostName: string;
  private readonly host: PortPreviewHost;
  private readonly clock: Clock;
  private readonly gracePeriodMs: number;
  private refreshGeneration = 0;
  private refreshTask: Promise<void> | null = null;
  private tunnel: PortPreviewTunnel | null = null;
  private tunnelTask: Promise<void> | null = null;
  /** The latest stop and disconnect; a restart waits for it so the phone port is free again. */
  private teardown: Promise<void> = Promise.resolve();
  /** Bumped by every open, pause, resume and close, so a late answer of an earlier tunnel never lands. */
  private previewGeneration = 0;
  private graceTimer: unknown = null;
  private backgroundedAt: number | null = null;
  private pageChecks: Promise<void>[] = [];
  private closed = false;

  constructor(options: PortsStoreOptions) {
    super({
      listing: null,
      isRefreshing: false,
      refreshFailure: null,
      showsAll: false,
      preview: null,
    });
    this.hostName = options.hostName;
    this.host = options.host;
    this.clock = options.clock;
    this.gracePeriodMs = options.gracePeriodMs ?? PREVIEW_GRACE_MS;
  }

  // MARK: Listing

  /** The rows on screen, in the report's order. */
  get visiblePorts(): readonly ListeningPort[] {
    const { listing, showsAll } = this.getState();
    if (listing?.kind !== 'loaded') return [];
    return showsAll
      ? listing.report.ports
      : listing.report.ports.filter((p) => !isHiddenByDefault(p));
  }

  /** Rows "Show All" would add. */
  get hiddenCount(): number {
    const { listing } = this.getState();
    return listing?.kind === 'loaded' ? listing.report.ports.filter(isHiddenByDefault).length : 0;
  }

  get isTruncated(): boolean {
    const { listing } = this.getState();
    return listing?.kind === 'loaded' && listing.report.isTruncated;
  }

  setShowsAll(showsAll: boolean): void {
    this.set({ showsAll });
  }

  /** The first discovery; a screen shown again keeps its list. */
  start(): void {
    if (this.getState().listing === null) this.refresh();
  }

  /** Discovers the Host's listeners again. A refresh in flight is replaced; the old list stays. */
  refresh(): void {
    if (this.closed) return;
    this.refreshGeneration += 1;
    const generation = this.refreshGeneration;
    if (this.getState().listing?.kind !== 'loaded') this.set({ listing: { kind: 'loading' } });
    this.set({ isRefreshing: true });
    this.refreshTask = (async () => {
      let report: ListeningPortReport | null = null;
      let failure: PortsMessage | null = null;
      try {
        report = await this.host.listListeningPorts();
      } catch (thrown) {
        failure = discoveryMessage(asTransportError(thrown));
      }
      if (generation !== this.refreshGeneration || this.closed) return;
      this.refreshTask = null;
      if (report) {
        this.set({
          isRefreshing: false,
          listing: { kind: 'loaded', report },
          refreshFailure: null,
        });
      } else if (this.getState().listing?.kind === 'loaded') {
        this.set({ isRefreshing: false, refreshFailure: failure });
      } else {
        this.set({ isRefreshing: false, listing: { kind: 'failed', message: failure ?? '' } });
      }
    })();
  }

  // MARK: Preview

  /** Opens a preview of one row, replacing any preview open. */
  open(port: ListeningPort): void {
    const target = forwardTarget(port);
    if (target) this.openPreview(target, displayName(port));
  }

  /** "Open Port…": the Host's loopback on a typed port, nothing else (no hostnames can be typed). */
  openPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    this.openPreview({ kind: 'loopbackV4', port }, message('Port %@', String(port)));
  }

  /** The Preview screen left: the tunnel stops at once. */
  closePreview(): void {
    this.clearGrace();
    this.backgroundedAt = null;
    this.previewGeneration += 1;
    const tunnel = this.tunnel;
    this.tunnel = null;
    this.set({ preview: null });
    if (tunnel) this.queueTeardown(tunnel, false);
  }

  /** Tries the preview again: starts the tunnel if it stopped, then reloads. */
  retry(): void {
    const { preview } = this.getState();
    if (preview && this.tunnel) this.startTunnel();
  }

  /**
   * The web view could not load the page. The tunnel's own record says why when a channel failed
   * (nothing answered, forwarding refused); otherwise the web view's error stands.
   */
  pageDidFail(error: PageError): void {
    const preview = this.getState().preview;
    const tunnel = this.tunnel;
    if (error.cancelled || !preview || preview.phase.kind !== 'open' || !tunnel) return;
    const generation = this.previewGeneration;
    const check = (async () => {
      let failure = await tunnel.lastFailure();
      if (failure === null) {
        await new Promise<void>((resolve) => this.clock.setTimeout(resolve, FAILURE_RECHECK_MS));
        failure = await tunnel.lastFailure();
      }
      const current = this.getState().preview;
      if (generation !== this.previewGeneration || !current || current.phase.kind !== 'open')
        return;
      const next = failure
        ? portPreviewFailure(failure, current.target.port)
        : pageFailure(error.message);
      this.set({ preview: { ...current, phase: { kind: 'failed', failure: next } } });
    })();
    this.pageChecks.push(check);
  }

  // MARK: App activity

  sceneDidEnterBackground(): void {
    if (!this.getState().preview || this.graceTimer !== null || this.backgroundedAt !== null)
      return;
    this.backgroundedAt = this.clock.monotonicMs();
    this.graceTimer = this.clock.setTimeout(() => this.pause(), this.gracePeriodMs);
  }

  sceneDidBecomeActive(): void {
    this.clearGrace();
    const absence =
      this.backgroundedAt === null ? null : this.clock.monotonicMs() - this.backgroundedAt;
    this.backgroundedAt = null;
    const { preview } = this.getState();
    if (!preview) return;
    if (preview.phase.kind === 'paused') {
      this.startTunnel();
    } else if (absence !== null && absence >= this.gracePeriodMs) {
      // Suspended before the grace timer ran: the sockets may be dead without anything saying so.
      this.pause();
      this.startTunnel();
    }
  }

  // MARK: Closing

  /** The screens closed: stops the tunnel and ends the connection. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.refreshGeneration += 1;
    this.refreshTask = null;
    this.set({ isRefreshing: false });
    this.closePreview();
    this.teardown = this.teardown.then(() => this.host.close()).catch(() => undefined);
  }

  /** Waits for the latest stop, disconnect, start or page check to finish (tests). */
  async settle(): Promise<void> {
    await this.refreshTask;
    await this.teardown;
    await this.tunnelTask;
    await Promise.all(this.pageChecks);
    this.pageChecks = [];
  }

  // MARK: Tunnel

  private openPreview(target: ForwardTarget, title: Text): void {
    if (this.closed) return;
    this.closePreview();
    this.tunnel = this.host.makeTunnel(target);
    this.set({ preview: { target, title, phase: { kind: 'opening' }, loadId: 0 } });
    this.startTunnel();
  }

  /** Stops `tunnel` once any start in flight finished, optionally dropping the connection after. */
  private queueTeardown(tunnel: PortPreviewTunnel, disconnect: boolean): void {
    const starting = this.tunnelTask;
    this.tunnelTask = null;
    const previous = this.teardown;
    this.teardown = (async () => {
      await previous;
      await starting?.catch(() => undefined);
      await tunnel.stop().catch(() => undefined);
      if (disconnect) await this.host.disconnect().catch(() => undefined);
    })();
  }

  /** Starts (or restarts) the current tunnel once any teardown finished, then publishes its URL. */
  private startTunnel(): void {
    const tunnel = this.tunnel;
    const preview = this.getState().preview;
    if (!tunnel || !preview) return;
    this.previewGeneration += 1;
    const generation = this.previewGeneration;
    this.set({ preview: { ...preview, phase: { kind: 'opening' } } });
    const previous = this.teardown;
    this.tunnelTask = (async () => {
      await previous;
      let phase: PreviewPhase;
      try {
        const endpoint = await tunnel.start();
        phase = { kind: 'open', url: endpoint.url, localPort: endpoint.localPort };
      } catch (thrown) {
        phase = {
          kind: 'failed',
          failure: portPreviewFailure(asTransportError(thrown), preview.target.port),
        };
      }
      const current = this.getState().preview;
      if (generation !== this.previewGeneration || !current) return;
      const loadId = phase.kind === 'open' ? current.loadId + 1 : current.loadId;
      this.set({ preview: { ...current, phase, loadId } });
    })();
  }

  private pause(): void {
    this.graceTimer = null;
    const { preview } = this.getState();
    const tunnel = this.tunnel;
    if (!preview || !tunnel || preview.phase.kind === 'paused') return;
    this.previewGeneration += 1;
    this.set({ preview: { ...preview, phase: { kind: 'paused' } } });
    this.queueTeardown(tunnel, true);
  }

  private clearGrace(): void {
    if (this.graceTimer !== null) this.clock.clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }
}
