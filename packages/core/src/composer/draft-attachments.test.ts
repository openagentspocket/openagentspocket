import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { MemoryStorage } from '../hosts/known-hosts';
import { terminalPolicy } from './policy';
import { ComposerRegistry } from './registry';
import { ComposerStore } from './store';
import { chatPolicy, type Rig, rig, states } from './store.testkit';

describe('ComposerStore attachments', () => {
  const image = {
    medium: 'image',
    name: 'IMG_1.jpg',
    hostPath: '/tmp/agentico.AB/stage-1/image.jpg',
    previewUri: 'file:///cache/IMG_1.jpg',
  } as const;
  const file = {
    medium: 'file',
    name: 'notes.md',
    hostPath: '/tmp/agentico.AB/stage-2/notes.md',
  } as const;

  function released(r: Rig) {
    const gone: string[] = [];
    r.store = new ComposerStore({
      target: 'w1:p1',
      clock: r.clock,
      releaseAttachment: (attachment) => gone.push(attachment.name),
      prompt: async (params) => {
        r.calls.push(params);
        const failure = r.failures.shift();
        if (failure) throw failure;
      },
    });
    return gone;
  }

  it('leaves the draft alone until Send, then appends the path to what was typed', async () => {
    const r = rig();
    r.store.replaceDraft('look at this');
    r.store.attach(image);
    expect(r.store.getSnapshot().draft).toBe('look at this');
    expect(r.store.getSnapshot().attachments).toMatchObject([image]);
    await r.store.send();
    expect(r.calls.map((call) => call.text)).toEqual([`look at this ${image.hostPath} `]);
    expect(r.store.getSnapshot().draft).toBe('');
    expect(r.store.getSnapshot().attachments).toEqual([]);
  });

  it('adds no second space after text that ends in one', async () => {
    const r = rig();
    r.store.replaceDraft('see ');
    r.store.attach(image);
    await r.store.send();
    expect(r.calls[0]?.text).toBe(`see ${image.hostPath} `);
  });

  it('sends several attachments in the order they were added', async () => {
    const r = rig();
    r.store.attach(image);
    r.store.attach(file);
    await r.store.send();
    expect(r.calls[0]?.text).toBe(`${image.hostPath} ${file.hostPath} `);
  });

  it('sends an attachment alone, a blank draft adding nothing', async () => {
    const r = rig();
    expect(r.store.canSend).toBe(false);
    r.store.replaceDraft('  ');
    r.store.attach(image);
    expect(r.store.canSend).toBe(true);
    await r.store.send();
    expect(r.calls[0]?.text).toBe(`${image.hostPath} `);
  });

  it('removing one takes it out of the message and tells who owns its preview', async () => {
    const r = rig();
    const gone = released(r);
    r.store.attach(image);
    r.store.attach(file);
    const first = r.store.getSnapshot().attachments[0];
    r.store.removeAttachment(first?.id ?? '');
    expect(gone).toEqual(['IMG_1.jpg']);
    await r.store.send();
    expect(r.calls[0]?.text).toBe(`${file.hostPath} `);
  });

  it('checks the policy against the whole message and keeps the attachment on a refusal', async () => {
    const r = rig();
    const seen: string[] = [];
    r.store.replaceDraft('/compact');
    r.store.attach(file);
    const refusal = { kind: 'commandUnavailable', reason: 'no arguments' } as const;
    const result = await r.store.send(
      chatPolicy({
        validate: (text) => {
          seen.push(text);
          return refusal;
        },
      }),
    );
    expect(result).toEqual({ kind: 'refused', refusal });
    expect(seen).toEqual([`/compact ${file.hostPath} `]);
    expect(r.store.getSnapshot().draft).toBe('/compact');
    expect(r.store.getSnapshot().attachments).toHaveLength(1);
  });

  it('a change of attachments ends a refusal notice, since the message changed', async () => {
    const r = rig();
    r.store.replaceDraft('/compact');
    r.store.attach(file);
    await r.store.send(chatPolicy({ validate: () => ({ kind: 'unsafeText', reason: 'no' }) }));
    expect(r.store.getSnapshot().notice).toBeDefined();
    r.store.removeAttachment(r.store.getSnapshot().attachments[0]?.id ?? '');
    expect(r.store.getSnapshot().notice).toBeUndefined();
  });

  it('a failed send withdrawn to the draft gets its text and attachment back, the path out of the input', async () => {
    const r = rig();
    const gone = released(r);
    r.failures.push(new Error('down'));
    r.store.replaceDraft('look');
    r.store.attach(image);
    await r.store.send();
    expect(states(r.store)[0]?.kind).toBe('failed');
    r.store.attach(file);
    r.store.withdrawToDraft(r.store.getSnapshot().messages[0]?.id ?? '');
    const snapshot = r.store.getSnapshot();
    expect(snapshot.draft).toBe('look');
    expect(snapshot.attachments.map((attachment) => attachment.name)).toEqual([
      'IMG_1.jpg',
      'notes.md',
    ]);
    expect(new Set(snapshot.attachments.map((attachment) => attachment.id)).size).toBe(2);
    expect(gone).toEqual([]);
  });

  it('a preflight refusal returns the attachment to the Composer', async () => {
    const r = rig();
    r.store.replaceDraft('look');
    r.store.attach(image);
    await r.store.send(
      chatPolicy({ preflight: async () => ({ kind: 'inputNotReady', reason: 'busy' }) }),
    );
    expect(r.store.getSnapshot().draft).toBe('look');
    expect(r.store.getSnapshot().attachments).toMatchObject([image]);
    expect(r.calls).toEqual([]);
  });

  it('Chat refused by a Blocked Agent keeps the attachment too', async () => {
    const r = rig('blocked');
    r.store.attach(image);
    await r.store.send(chatPolicy());
    expect(r.store.getSnapshot().draft).toBe('');
    expect(r.store.getSnapshot().attachments).toMatchObject([image]);
  });

  it('a Blocked terminal gets the path with the draft, not before', async () => {
    const r = rig('blocked');
    const inserted: string[] = [];
    r.store.bindAttachInput({
      insertComposerDraft: (text) => {
        inserted.push(text);
        return true;
      },
    });
    r.store.replaceDraft('look');
    r.store.attach(image);
    expect(inserted).toEqual([]);
    expect((await r.store.send(terminalPolicy)).kind).toBe('deliveredViaAttach');
    expect(inserted).toEqual([`look ${image.hostPath} `]);
  });

  it('releases a preview only once its message reached the Agent', async () => {
    const r = rig();
    const gone = released(r);
    r.failures.push(new Error('down'));
    r.store.attach(image);
    await r.store.send();
    expect(gone).toEqual([]);
    await r.store.retry(r.store.getSnapshot().messages[0]?.id ?? '');
    expect(gone).toEqual(['IMG_1.jpg']);
  });
});

describe('ComposerRegistry attachments', () => {
  it('keeps standing attachments across a restart and forgets them with the Agent', async () => {
    const clock = new FakeClock();
    const storage = new MemoryStorage();
    const input = { key: 'h1/p1', target: 'p1', prompt: async () => {}, status: 'idle' };
    const attachment = { medium: 'file', name: 'a.md', hostPath: '/tmp/a.md' } as const;
    const registry = new ComposerRegistry({ storage, clock });
    registry.composerFor(input).attach(attachment);
    const rebuilt = new ComposerRegistry({ storage, clock });
    const store = rebuilt.composerFor(input);
    expect(store.getSnapshot().attachments).toMatchObject([attachment]);
    expect(store.canSend).toBe(true);
    await store.send();
    expect(
      new ComposerRegistry({ storage, clock }).composerFor(input).getSnapshot().attachments,
    ).toEqual([]);
    store.attach(attachment);
    rebuilt.discard(input.key);
    expect(
      new ComposerRegistry({ storage, clock }).composerFor(input).getSnapshot().attachments,
    ).toEqual([]);
  });

  it("hands the Agent's attachments back when it closes, and reads a damaged record as none", () => {
    const clock = new FakeClock();
    const storage = new MemoryStorage();
    const gone: string[] = [];
    const input = { key: 'h1/p1', target: 'p1', prompt: async () => {}, status: 'idle' };
    const registry = new ComposerRegistry({
      storage,
      clock,
      releaseAttachment: (attachment) => gone.push(attachment.name),
    });
    registry.composerFor(input).attach({ medium: 'file', name: 'a.md', hostPath: '/tmp/a.md' });
    registry.discard(input.key);
    expect(gone).toEqual(['a.md']);
    storage.set('composer.attachments.h1/p2', 'not json');
    storage.set('composer.attachments.h1/p3', '[{"name":1}]');
    for (const key of ['h1/p2', 'h1/p3']) {
      const store = new ComposerRegistry({ storage, clock }).composerFor({ ...input, key });
      expect(store.getSnapshot().attachments).toEqual([]);
    }
  });
});
