// A user message on the branch (Swift PiTranscriptReducer, `message` role `user`): it opens a turn,
// or steers the one running.

import { notice, userMessage } from '../model/factories';
import { asBool, type JsonObject } from '../model/reducer';
import type { ChatEntryContent } from '../model/types';
import type { PiBuilder } from './builder';
import { type PiRecord, writtenAt } from './record';
import { piSkill } from './skills';
import { imageCount, STEER_WRITE_WINDOW, textOf } from './tools';

export function userRow(b: PiBuilder, record: PiRecord, message: JsonObject): void {
  const text = textOf(message.content);
  const images = imageCount(message.content);
  // A message sent while a turn runs steers it. Oh My Pi flags it; Pi writes it as a plain
  // prompt the moment the turn's tool batch ends, before its next reply. A turn whose reply
  // broke off unrecorded, such as one resumed after its process died, still ends at a prompt.
  // The turn may have opened above the lines read.
  const lastTurn = b.transcript.turns[b.transcript.turns.length - 1];
  const isOpen = lastTurn
    ? lastTurn.ending === null
    : b.transcript.needsOlderHistory && b.transcript.precedingTurnEnd === null;
  const at = writtenAt(record);
  const delivered =
    !b.flagsSteers &&
    b.toolResultWrittenAt !== null &&
    at !== null &&
    (at.ms - b.toolResultWrittenAt) / 1000 < STEER_WRITE_WINDOW;
  const steers = isOpen && (asBool(message.steering) === true || delivered);
  let content: ChatEntryContent;
  let prompt: string;
  const skill = piSkill(text);
  if (record.isTruncated && text === '' && images === 0) {
    content = {
      type: 'notice',
      value: notice('system', 'Message exceeds the preview limit'),
    };
    prompt = text;
  } else if (skill) {
    // Pi records `/skill:name args` as the skill's block followed by the arguments.
    content = {
      type: 'user',
      value: userMessage(
        skill.arguments === '' ? `/${skill.name}` : `/${skill.name} ${skill.arguments}`,
        {
          imageCount: images,
          command: { name: skill.name, arguments: skill.arguments },
          wasQueued: steers,
        },
      ),
    };
    prompt =
      skill.arguments === '' ? `/skill:${skill.name}` : `/skill:${skill.name} ${skill.arguments}`;
  } else {
    content = {
      type: 'user',
      value: userMessage(text, { imageCount: images, wasQueued: steers }),
    };
    prompt = text;
  }
  if (steers) b.joinTurn(record, content, prompt);
  else b.openTurn(record, content, prompt);
  b.toolResultWrittenAt = null;
}
