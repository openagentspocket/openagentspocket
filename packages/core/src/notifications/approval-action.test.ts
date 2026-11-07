import { gcm } from '@noble/ciphers/aes.js';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { encodeBase64Url, utf8Encode } from '../pairing/bytes';
import {
  APPROVAL_OPT_IN_FILE_NAME,
  ApprovalLedger,
  approvalAnswerRole,
  approvalOutcomeOf,
  MirroredApprovalOptIns,
  openNotificationEnvelope,
  planApproval,
  runApprovalAction,
  StoredApprovalOptIns,
} from './approval-action';
import { approvalApplyResult, approvalApplyScript } from './approval-script';
import { notificationKeyId } from './key-store';

const KEY = new Uint8Array(32).fill(7);
const RECORD = { hostId: 'h1', hostName: 'Studio', key: KEY };
const NOW = 1_000_000;
const BODY = {
  pane: 'w1:p1',
  kind: 'claude',
  status: 'blocked',
  ts: NOW - 10,
  bid: 'abcdefghijk',
  act: 1,
  q: 'Run ls?',
  opts: ['Yes', "Yes, and don't ask again", 'No'],
};

function seal(body: object, key = KEY): string {
  const nonce = new Uint8Array(12).fill(1);
  const sealed = gcm(key, nonce, utf8Encode('HERDR-NOTIFY:1')).encrypt(
    utf8Encode(JSON.stringify(body)),
  );
  return JSON.stringify({
    v: 1,
    kid: encodeBase64Url(notificationKeyId(key)),
    n: encodeBase64Url(nonce),
    ct: encodeBase64Url(sealed),
  });
}

function input(overrides: object = {}) {
  const storage = new MemoryStorage();
  const optIns = new StoredApprovalOptIns(storage);
  optIns.setEnabled(true, 'h1');
  return {
    envelope: seal(BODY),
    decision: 'approve' as const,
    keys: [RECORD],
    optIns,
    ledger: new ApprovalLedger(storage),
    nowSeconds: NOW,
    apply: vi.fn(async () => 'sent'),
    ...overrides,
  };
}

const planned = (body: object, decision: 'approve' | 'deny' = 'approve', now = NOW) => {
  const opened = openNotificationEnvelope(seal({ ...BODY, ...body }), [RECORD]);
  if (!opened) throw new Error('did not open');
  return planApproval(opened.payload, decision, now);
};

describe('openNotificationEnvelope', () => {
  it('opens with the key that sealed it', () => {
    expect(openNotificationEnvelope(seal(BODY), [RECORD])?.payload.paneId).toBe('w1:p1');
  });

  it('refuses what another key sealed and what is not an envelope', () => {
    expect(openNotificationEnvelope(seal(BODY, new Uint8Array(32).fill(9)), [RECORD])).toBeNull();
    expect(openNotificationEnvelope('{"pane":"w1:p1","act":1}', [RECORD])).toBeNull();
    expect(openNotificationEnvelope('nope', [RECORD])).toBeNull();
  });
});

describe('planApproval', () => {
  it('picks the one-time Yes for Approve and No for Deny, never the lasting Yes', () => {
    expect(planned({})).toMatchObject({ request: { option: 1, label: 'Yes' } });
    expect(planned({}, 'deny')).toMatchObject({ request: { option: 3, label: 'No' } });
    expect(approvalAnswerRole("Yes, and don't ask again")).toBeNull();
  });

  it('refuses after the time to live and far in the future', () => {
    expect(planned({}, 'approve', NOW + 31 * 60)).toEqual({ refusal: 'expired' });
    expect(planned({ ts: NOW + 6 * 60 })).toEqual({ refusal: 'expired' });
  });

  it('holds Approve to what the Lock Screen showed', () => {
    expect(planned({ act: 2 })).toEqual({ refusal: 'denyOnly' });
    expect(planned({ q: 'x'.repeat(121) })).toEqual({ refusal: 'promptCut' });
    expect(planned({ q: 'rm ‮safe' })).toEqual({ refusal: 'denyOnly' });
  });

  it('still lets Deny answer what only Deny may answer', () => {
    expect(planned({ act: 2 }, 'deny')).toHaveProperty('request');
  });

  it('refuses a push that is not an answerable prompt, or two matching options', () => {
    expect(planned({ status: 'done' })).toEqual({ refusal: 'notAnswerable' });
    expect(planned({ bid: 'short' })).toEqual({ refusal: 'notAnswerable' });
    expect(planned({ opts: ['Yes', 'Yes, do it', 'No'] })).toEqual({ refusal: 'promptChanged' });
  });
});

describe('runApprovalAction', () => {
  it('answers once: a second tap sends nothing', async () => {
    const action = input();
    expect((await runApprovalAction(action)).outcome).toBe('answered');
    expect((await runApprovalAction(action)).outcome).toBe('ignored');
    expect(action.apply).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a Host that opted out, or a forged push', async () => {
    const off = input({ optIns: new StoredApprovalOptIns(new MemoryStorage()) });
    expect((await runApprovalAction(off)).outcome).toBe('optedOut');
    expect(off.apply).not.toHaveBeenCalled();
    const forged = input({ envelope: '{"v":1}' });
    expect((await runApprovalAction(forged)).outcome).toBe('ignored');
    expect(forged.apply).not.toHaveBeenCalled();
  });

  it('reports a Host it cannot reach, and never retries the episode', async () => {
    const action = input({ apply: vi.fn(() => Promise.reject(new Error('down'))) });
    expect((await runApprovalAction(action)).outcome).toBe('unreachable');
    expect((await runApprovalAction(action)).outcome).toBe('ignored');
  });
});

describe('the Host side', () => {
  it('maps what the apply printed', () => {
    expect(approvalOutcomeOf('sent')).toBe('answered');
    expect(approvalOutcomeOf('claimed')).toBe('ignored');
    expect(approvalOutcomeOf('prompt_changed')).toBe('promptChanged');
    expect(approvalOutcomeOf('')).toBe('pluginOutdated');
    expect(approvalApplyResult('noise\n{"v":1,"result":"sent","keys":["1"]}\n')).toBe('sent');
    expect(approvalApplyResult('not json')).toBe('');
  });

  it('quotes every value, so a prompt can never run on the Host', () => {
    const script = approvalApplyScript(
      '/plugins/agentico',
      {
        pane: "w1'; rm -rf /; '",
        episodeId: 'abcdefghijk',
        timestamp: 1,
        decision: 'approve',
        option: 1,
        prompt: '$(rm -rf /)',
        label: 'Yes',
      },
      null,
    );
    expect(script).not.toContain('$(rm -rf /)');
    expect(script).not.toContain("--pane 'w1'; rm");
  });
});

describe('MirroredApprovalOptIns', () => {
  it('writes the file the widget reads, in the shape it decodes, also when a Host leaves', async () => {
    const files = new Map<string, string>();
    const optIns = new MirroredApprovalOptIns(new MemoryStorage(), async (name, text) => {
      files.set(name, text);
      return true;
    });
    optIns.setEnabled(true, 'b');
    optIns.setEnabled(true, 'a');
    await optIns.sync();
    expect(JSON.parse(files.get(APPROVAL_OPT_IN_FILE_NAME) ?? '')).toEqual({
      v: 1,
      hosts: ['a', 'b'],
    });
    optIns.setEnabled(false, 'a');
    await optIns.sync();
    expect(JSON.parse(files.get(APPROVAL_OPT_IN_FILE_NAME) ?? '').hosts).toEqual(['b']);
  });

  it('sync writes what was stored before this launch, and retries a failed write', async () => {
    const storage = new MemoryStorage();
    new StoredApprovalOptIns(storage).setEnabled(true, 'a');
    let accepted = false;
    const writes: string[] = [];
    const optIns = new MirroredApprovalOptIns(storage, async (_name, text) => {
      writes.push(text);
      return accepted;
    });
    await optIns.sync();
    accepted = true;
    await optIns.sync();
    await optIns.sync();
    expect(writes).toHaveLength(2);
  });
});
