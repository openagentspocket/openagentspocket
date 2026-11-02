// Answers from async-question replies (Swift CodexTimelineProjector.Answers).

import { type QuestionReply, questionReplies } from './message-formatter';
import type { CodexTimeline } from './timeline';
import { displayAnswer } from './tool-summary';

/** Answers from async-question replies: by question id, or (older clients) by message id. */
export class Answers {
  private readonly byQuestionID = new Map<string, string>();
  private readonly byItemID = new Map<string, QuestionReply[]>();

  constructor(timeline: CodexTimeline) {
    for (const turn of timeline.turns) {
      for (const entry of turn.entries) {
        if (entry.content.type !== 'item' || entry.content.value.type !== 'user') continue;
        const replies = questionReplies(entry.content.value.value.text);
        if (!replies) continue;
        for (const reply of replies) {
          if (reply.questionItemID.startsWith('[')) {
            if (!this.byQuestionID.has(reply.questionItemID)) {
              this.byQuestionID.set(reply.questionItemID, reply.answer);
            }
          } else {
            const list = this.byItemID.get(reply.questionItemID) ?? [];
            list.push(reply);
            this.byItemID.set(reply.questionItemID, list);
          }
        }
      }
    }
  }

  /** The reply that settles a question, or null while it is open. */
  reply(
    questionID: string | null,
    itemID: string | null,
    title: string,
  ): { answer: string | null } | null {
    const byID = questionID === null ? undefined : this.byQuestionID.get(questionID);
    if (byID !== undefined) return { answer: displayAnswer(byID) };
    const replies = itemID === null ? undefined : this.byItemID.get(itemID);
    if (!replies) return null;
    const match = replies.find((r) => r.question === title);
    return { answer: match ? displayAnswer(match.answer) : null };
  }
}
