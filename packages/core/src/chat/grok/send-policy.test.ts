import { describe, expect, it } from 'vitest';
import { makeSkill } from '../../skills/agent-skill';
import { detectInputBox } from '../send/detect';
import { sendPolicyFor } from '../send/registry';
import { rulesFor } from '../send/send.testkit';
import { witnessVerdict } from '../send/send-witness';
import { composerInterrupt } from '../send/stop-plan';
import { grokEchoKey } from './reducer';
import { capture } from './screen.testkit';
import { grokSendPolicy } from './send-policy';

const policy = sendPolicyFor('grok');

describe('Grok Build send policy', () => {
  it('is the registered policy for grok', () => {
    expect(policy.program).toBe('grok');
    expect(policy.chatName).toBe('Grok Build');
    expect(policy.echoClockStopsWhileWorking).toBe(true);
    expect(policy.mayRefillInputBoxAfterSend).toBe(true);
    expect(policy.terminalStop).toBe(false);
    expect(policy.sessionCheck).toBeDefined();
    expect(policy.sendWitness).toBeDefined();
  });

  it('presses Ctrl+C behind a screen guard, one gap apart', () => {
    expect(policy.stop.keys).toEqual(['ctrl+c']);
    expect(policy.stop.screenGuard).toBeDefined();
    expect(policy.stop.wait.minimumGapMs).toBe(1500);
    expect(typeof composerInterrupt).toBe('function');
  });

  it('offers a skill only when user-invocable and not named like a built-in', () => {
    const skill = (name: string, isUserInvocable = true) => ({
      ...makeSkill({ scope: 'global', name }),
      isUserInvocable,
    });
    expect(policy.offersSkill(skill('review'))).toBe(true);
    expect(policy.offersSkill(skill('review', false))).toBe(false);
    expect(policy.offersSkill(skill('Plan'))).toBe(false);
    expect(policy.offersSkill(skill('model'))).toBe(false);
  });

  it('refuses what the input box reads as more than a message', () => {
    const rules = rulesFor('grok');
    for (const draft of [
      'exit',
      ':wq',
      'quit',
      'look at /goal later',
      'ask /btw this',
      '/compact the logs',
    ]) {
      expect(rules.validate(draft), draft).toBeDefined();
    }
    expect(rules.validate('Reply with the word kiwi.')).toBeUndefined();
    expect(rules.validate('/compact')).toBeUndefined();
  });

  it('reads the input box of the captures through the registry', () => {
    expect(detectInputBox(capture('grok-01-idle-empty'), policy).kind).toBe('empty');
    expect(detectInputBox(capture('grok-02-idle-draft'), policy)).toEqual({
      kind: 'text',
      text: 'hello draft',
    });
    // A blocked card is a dialog the generic check finds before the program reads its box.
    expect(detectInputBox(capture('grok-12-permission-command'), grokSendPolicy()).kind).toBe(
      'dialog',
    );
  });

  it('names the session that took a prompt from its prompt history', () => {
    const witness = policy.sendWitness;
    if (!witness) throw new Error('no witness');
    expect(witness.logPath('/home/dev/.grok/sessions/%2Fwork%2Fapp/s1.jsonl')).toMatch(
      /prompt_history\.jsonl$/,
    );
    const line = (prompt: string, session: string, bash = false) =>
      new TextEncoder().encode(
        JSON.stringify({ timestamp: 't', session_id: session, prompt, is_bash: bash }),
      );
    const lines = [
      line('Reply with the word kiwi.', 'S-1'),
      line('ls', 'S-2', true),
      new TextEncoder().encode('{bad'),
    ];
    const common = {
      lines,
      key: grokEchoKey('Reply with the word kiwi.'),
      isWholeAppend: true,
      echoKey: grokEchoKey,
    };
    expect(witnessVerdict(witness, { ...common, sessionID: 's-1' })).toBe('here');
    expect(witnessVerdict(witness, { ...common, sessionID: 's-9' })).toBe('elsewhere');
    expect(witnessVerdict(witness, { ...common, sessionID: 's-9', isWholeAppend: false })).toBe(
      'unknown',
    );
    expect(witness.entry(lines[1] as Uint8Array)).toBeNull();
  });
});
