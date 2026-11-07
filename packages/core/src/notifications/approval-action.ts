import { gcm } from '@noble/ciphers/aes.js';
import type { KeyValueStorage } from '../hosts/known-hosts';
import { decodeBase64Url, encodeBase64Url, utf8Decode, utf8Encode } from '../pairing/bytes';
import { type KeyMirrorSink, MirrorFile } from './key-mirror';
import { NOTIFICATION_KEY_BYTES, type NotificationKeyRecord, notificationKeyId } from './key-store';

const AAD = utf8Encode('HERDR-NOTIFY:1');
/** How long after the transition a notification still answers (spec F5, decision 4). */
export const APPROVAL_TTL_SECONDS = 30 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;
/** What the Lock Screen shows of a prompt: longer, and Approve goes with it. */
const BODY_LIMIT = 120;
export const EPISODE_ID = /^[A-Za-z0-9_-]{11}$/u;
const LEDGER_RETENTION_SECONDS = 24 * 60 * 60;
const YES_LABEL = /^yes(?:$|[, ])/iu;
const NO_LABEL = /^no(?:$|[, ])/iu;
const LASTING_YES =
  /switch to auto mode|switch to accept edits|use auto mode|auto-accept edits|bypass|don't ask again|always allow|for this session|during this session|from this project|allow this host|keep allowing|in the future/iu;
const FORMAT_CHARACTER = /\p{Cf}/u;

export type ApprovalDecision = 'approve' | 'deny';

/** The authenticated fields of a push an answer needs. */
export interface ApprovalPayload {
  readonly paneId: string;
  readonly status: string;
  readonly timestamp: number;
  readonly episodeId?: string;
  readonly act?: number;
  readonly prompt?: string;
  readonly options: readonly string[];
}

/** What the Host's `approval-apply.js` is asked to do; it verifies all of it against the screen. */
export interface ApprovalApplyRequest {
  readonly pane: string;
  readonly episodeId: string;
  readonly timestamp: number;
  readonly decision: ApprovalDecision;
  /** The option's position on screen, from 1. */
  readonly option: number;
  readonly prompt: string;
  readonly label: string;
}

export type ApprovalOutcome =
  | 'answered'
  /** Nothing to say: a push that does not open, or an episode already answered. */
  | 'ignored'
  | 'expired'
  | 'optedOut'
  | 'notAnswerable'
  | 'promptCut'
  | 'denyOnly'
  | 'promptChanged'
  | 'pluginOutdated'
  | 'unreachable'
  | 'sendFailed'
  | 'timedOut'
  /** The device owner did not confirm an Approve the app itself had to ask for. */
  | 'notAuthenticated';

/**
 * Opens a push with this device's keys. Only what authenticates here may be believed: anyone who
 * can reach the relay could put plain fields next to the envelope.
 */
export function openNotificationEnvelope(
  envelope: string,
  keys: readonly NotificationKeyRecord[],
): { record: NotificationKeyRecord; payload: ApprovalPayload } | null {
  try {
    const frame = JSON.parse(envelope) as { v?: unknown; kid?: unknown; n?: unknown; ct?: unknown };
    if (frame.v !== 1 || typeof frame.n !== 'string' || typeof frame.ct !== 'string') return null;
    const record = keys.find(({ key }) => encodeBase64Url(notificationKeyId(key)) === frame.kid);
    if (!record || record.key.length !== NOTIFICATION_KEY_BYTES) return null;
    const nonce = decodeBase64Url(frame.n);
    const sealed = decodeBase64Url(frame.ct);
    if (!nonce || !sealed) return null;
    const plain = gcm(record.key, nonce, AAD).decrypt(sealed);
    const body = JSON.parse(utf8Decode(plain)) as Record<string, unknown>;
    if (typeof body.pane !== 'string' || typeof body.ts !== 'number') return null;
    return {
      record,
      payload: {
        paneId: body.pane,
        status: String(body.status),
        timestamp: body.ts,
        episodeId: typeof body.bid === 'string' ? body.bid : undefined,
        act: typeof body.act === 'number' ? body.act : undefined,
        prompt: typeof body.q === 'string' ? body.q : undefined,
        options: Array.isArray(body.opts)
          ? body.opts.filter((label): label is string => typeof label === 'string')
          : [],
      },
    };
  } catch {
    return null;
  }
}

/** What an option's label answers; a lasting Yes answers nothing from a notification. */
export function approvalAnswerRole(label: string): 'approve' | 'decline' | null {
  const folded = label.replaceAll('’', "'");
  if (NO_LABEL.test(folded)) return 'decline';
  if (YES_LABEL.test(folded) && !LASTING_YES.test(folded)) return 'approve';
  return null;
}

/** The checks that need no Host. Approve is held to what the Lock Screen really showed. */
export function planApproval(
  payload: ApprovalPayload,
  decision: ApprovalDecision,
  nowSeconds: number,
): { request: ApprovalApplyRequest } | { refusal: ApprovalOutcome } {
  const { prompt, episodeId, act } = payload;
  if (
    payload.status !== 'blocked' ||
    prompt === undefined ||
    episodeId === undefined ||
    !EPISODE_ID.test(episodeId) ||
    (act !== 1 && act !== 2)
  ) {
    return { refusal: 'notAnswerable' };
  }
  const age = nowSeconds - payload.timestamp;
  if (age > APPROVAL_TTL_SECONDS || age < -CLOCK_SKEW_SECONDS) return { refusal: 'expired' };
  if (decision === 'approve') {
    if (act !== 1 || [prompt, ...payload.options].some((text) => FORMAT_CHARACTER.test(text))) {
      return { refusal: 'denyOnly' };
    }
    if (prompt.length > BODY_LIMIT) return { refusal: 'promptCut' };
  }
  const wanted = decision === 'approve' ? 'approve' : 'decline';
  const matches = payload.options.flatMap((label, index) =>
    approvalAnswerRole(label) === wanted ? [{ label, option: index + 1 }] : [],
  );
  const [match] = matches;
  if (matches.length !== 1 || !match) return { refusal: 'promptChanged' };
  return {
    request: {
      pane: payload.paneId,
      episodeId,
      timestamp: payload.timestamp,
      decision,
      prompt,
      ...match,
    },
  };
}

/** Which Hosts this device answers from notifications for. Missing or unreadable reads as off. */
export class StoredApprovalOptIns {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = 'notifications.approval-opt-ins',
  ) {}

  hostIds(): string[] {
    try {
      const value: unknown = JSON.parse(this.storage.getString(this.key) ?? '[]');
      return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  isEnabled(hostId: string): boolean {
    return this.hostIds().includes(hostId);
  }

  setEnabled(enabled: boolean, hostId: string): void {
    const others = this.hostIds().filter((id) => id !== hostId);
    this.storage.set(this.key, JSON.stringify(enabled ? [...others, hostId] : others));
  }
}

/** The App Group file the widget reads the opt-ins from before it draws Approve and Deny. */
export const APPROVAL_OPT_IN_FILE_NAME = 'approval-opt-in.json';

/** The stored opt-ins, mirrored for the widget. A failed write leaves it off or stale; `sync` retries. */
export class MirroredApprovalOptIns extends StoredApprovalOptIns {
  private readonly file: MirrorFile;

  constructor(storage: KeyValueStorage, sink: KeyMirrorSink) {
    super(storage);
    this.file = new MirrorFile(APPROVAL_OPT_IN_FILE_NAME, sink);
  }

  override setEnabled(enabled: boolean, hostId: string): void {
    super.setEnabled(enabled, hostId);
    void this.sync();
  }

  sync(): Promise<void> {
    return this.file.write(JSON.stringify({ v: 1, hosts: this.hostIds().sort() }));
  }
}

/** Episodes this device already answered, so a double tap sends nothing twice. */
export class ApprovalLedger {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = 'notifications.approval-ledger',
  ) {}

  private read(): Record<string, number> {
    try {
      const value: unknown = JSON.parse(this.storage.getString(this.key) ?? '{}');
      return typeof value === 'object' && value !== null ? (value as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  /** False when spent. Spent before anything goes out: a failure never answers twice. */
  claim(hostId: string, episodeId: string, nowSeconds: number): boolean {
    const entry = `${hostId}/${episodeId}`;
    const kept = Object.entries(this.read()).filter(
      ([, at]) => nowSeconds - at < LEDGER_RETENTION_SECONDS,
    );
    if (kept.some(([key]) => key === entry)) return false;
    this.storage.set(this.key, JSON.stringify(Object.fromEntries([...kept, [entry, nowSeconds]])));
    return true;
  }
}

/** The result `approval-apply.js` printed, as what the user is told. */
export function approvalOutcomeOf(result: string): ApprovalOutcome {
  switch (result) {
    case 'sent':
      return 'answered';
    case 'claimed':
      return 'ignored';
    case 'prompt_changed':
    case 'option_changed':
    case 'unreadable':
    case 'not_approval':
      return 'promptChanged';
    case 'deny_only':
      return 'denyOnly';
    case 'too_slow':
      return 'timedOut';
    case 'send_failed':
    case 'failed':
      return 'sendFailed';
    default:
      return 'pluginOutdated';
  }
}

export interface ApprovalActionInput {
  readonly envelope: string;
  readonly decision: ApprovalDecision;
  readonly keys: readonly NotificationKeyRecord[];
  readonly optIns: Pick<StoredApprovalOptIns, 'isEnabled'>;
  readonly ledger: ApprovalLedger;
  readonly nowSeconds: number;
  /** Runs the apply on the Host and gives back the result it printed. */
  readonly apply: (hostId: string, request: ApprovalApplyRequest) => Promise<string>;
}

export interface ApprovalAnswerInput {
  readonly hostId: string;
  readonly payload: ApprovalPayload;
  readonly decision: ApprovalDecision;
  readonly ledger: ApprovalLedger;
  readonly nowSeconds: number;
  /**
   * Device owner authentication for Approve, where the OS does not ask first. It runs before the
   * ledger: an owner who cancels leaves the episode answerable. A throw counts as a refusal.
   */
  readonly authenticate?: (request: ApprovalApplyRequest) => Promise<boolean>;
  readonly apply: ApprovalActionInput['apply'];
}

/** The gates every answer goes through, wherever it was tapped; the binding one is on the Host. */
export async function answerApproval(input: ApprovalAnswerInput): Promise<ApprovalOutcome> {
  const plan = planApproval(input.payload, input.decision, input.nowSeconds);
  if ('refusal' in plan) return plan.refusal;
  if (input.decision === 'approve' && input.authenticate) {
    const confirmed = await input.authenticate(plan.request).catch(() => false);
    if (confirmed !== true) return 'notAuthenticated';
  }
  if (!input.ledger.claim(input.hostId, plan.request.episodeId, input.nowSeconds)) return 'ignored';
  try {
    return approvalOutcomeOf(await input.apply(input.hostId, plan.request));
  } catch {
    return 'unreachable';
  }
}

/** Approve or Deny from a notification: every check here, the binding one on the Host. */
export async function runApprovalAction(
  input: ApprovalActionInput,
): Promise<{ outcome: ApprovalOutcome; hostName?: string; hostId?: string; paneId?: string }> {
  const opened = openNotificationEnvelope(input.envelope, input.keys);
  if (!opened) return { outcome: 'ignored' };
  const { record, payload } = opened;
  const where = { hostName: record.hostName, hostId: record.hostId, paneId: payload.paneId };
  if (!input.optIns.isEnabled(record.hostId)) return { outcome: 'optedOut', ...where };
  const { decision, ledger, nowSeconds, apply } = input;
  const answer = { hostId: record.hostId, payload, decision, ledger, nowSeconds, apply };
  return { outcome: await answerApproval(answer), ...where };
}
