// What the Composer's empty input says Send does. While the Agent works, a program whose input box
// takes a message and holds it says when the Agent reads it (its send policy's `whileWorking`);
// a program that does not, or one unverified, keeps "Message Agent". Blocked keeps it too: there
// the send's own refusal says why nothing goes.

import { type Message, message } from '../../errors/text';
import type { ChatAgentActivity } from '../model/types';
import type { ProgramSendPolicy } from './policy';

export function composerPlaceholder(
  policy: Pick<ProgramSendPolicy, 'whileWorking'> | null,
  activity: ChatAgentActivity,
): Message {
  if (activity === 'working') {
    switch (policy?.whileWorking) {
      case 'queuesForTurnEnd':
        return message('Queue for after this turn');
      case 'queuesForNextStep':
        return message("Queue for the Agent's next step");
    }
  }
  return message('Message Agent');
}
