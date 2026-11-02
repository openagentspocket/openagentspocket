let surfaceCounter = 0;

/**
 * The identity of one terminal pipeline, and so of the view built on it. A counter, never the
 * store object's identity or address: a view keyed by something a replacement can repeat keeps
 * the old surface and the replacement's bytes buffer forever behind a stale screen.
 */
export type TerminalSurfaceId = string;

export const newTerminalSurfaceId = (): TerminalSurfaceId => {
  surfaceCounter += 1;
  return `surface-${surfaceCounter}`;
};

export type RecoveryDecision =
  | { readonly kind: 'pending' }
  | { readonly kind: 'acknowledge'; readonly generation: number }
  | { readonly kind: 'replace'; readonly generation: number }
  | { readonly kind: 'retain'; readonly generation: number };

const PENDING: RecoveryDecision = { kind: 'pending' };

/**
 * Reconciles the two independently scheduled signals that identify a foreground recovery's
 * Transport: readiness is projected before terminal waiters resume, so either may arrive first.
 * A decision is made only once both belong to the same terminal pipeline.
 * (Swift `TerminalRecoveryGenerationLatch`.)
 */
export class TerminalRecoveryGenerationLatch {
  private active = false;
  private pipelineId: TerminalSurfaceId | null = null;
  private acquired: number | null = null;
  private projected: number | null = null;

  get isActive(): boolean {
    return this.active;
  }

  begin(projectedGeneration: number | null): void {
    if (this.active) return;
    this.active = true;
    this.pipelineId = null;
    this.acquired = null;
    this.projected = projectedGeneration;
  }

  bind(pipelineId: TerminalSurfaceId): void {
    if (!this.active) return;
    this.pipelineId = pipelineId;
    this.acquired = null;
  }

  recordProjection(generation: number): RecoveryDecision | null {
    if (!this.active) return null;
    this.projected = Math.max(this.projected ?? generation, generation);
    return this.reconcile();
  }

  recordAcquisition(generation: number, pipelineId: TerminalSurfaceId): RecoveryDecision | null {
    if (!this.active || this.pipelineId !== pipelineId) return null;
    this.acquired = generation;
    return this.reconcile();
  }

  clearBoundTo(pipelineId: TerminalSurfaceId): void {
    if (this.pipelineId === pipelineId) this.clear();
  }

  clear(): void {
    this.active = false;
    this.pipelineId = null;
    this.acquired = null;
    this.projected = null;
  }

  private reconcile(): RecoveryDecision {
    if (this.acquired === null || this.projected === null) return PENDING;
    const { acquired, projected } = this;
    this.clear();
    if (projected === acquired) return { kind: 'acknowledge', generation: acquired };
    if (projected > acquired) return { kind: 'replace', generation: projected };
    return { kind: 'retain', generation: acquired };
  }
}
