import type { ClaudeRecord, ClaudeToolResult } from './record-types';
import { type ClaudeToolOutcome, toolOutcome } from './tool-summary';

export interface Answer {
  record: ClaudeRecord;
  result: ClaudeToolResult;
  trailingTexts: string[];
  stoppedWhileRunning: boolean;
}

export function answerOutcome(answer: Answer): ClaudeToolOutcome {
  const outcome = toolOutcome(answer.result, answer.record.toolResult, answer.trailingTexts);
  return answer.stoppedWhileRunning && outcome.type === 'declined' && outcome.feedback === null
    ? { type: 'interrupted' }
    : outcome;
}

/** The tool results a record answers, each with the text blocks that follow it. */
export function answersIn(record: ClaudeRecord): Answer[] {
  const answers: Answer[] = [];
  for (const block of record.blocks) {
    if (block.type === 'toolResult') {
      answers.push({ record, result: block.result, trailingTexts: [], stoppedWhileRunning: false });
    } else if (block.type === 'text' && answers.length > 0) {
      (answers[answers.length - 1] as Answer).trailingTexts.push(block.text);
    }
  }
  return answers;
}
