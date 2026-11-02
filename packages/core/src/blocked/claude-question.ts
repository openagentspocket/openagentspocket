import { message } from '../errors/text';
import type { ClaudeContext } from './claude-context';
import { fieldInputState, type QuestionTabs } from './claude-models';
import { rowIsBlank, trimmedText } from './screen';
import {
  type DialogOption,
  type DialogOptionRole,
  type DialogParseResult,
  makeOption,
  makeSubject,
} from './types';

const REVIEW_TITLE = 'Review your answers';
const PREVIEWS_REASON = message('Agentico does not handle questions with previews yet.');

/** Claude's question pages and the `Review your answers` page. */
export function readClaudeQuestion(
  ctx: ClaudeContext,
  top: number,
  tabsRow: number,
  tabs: QuestionTabs,
  firstOption: number,
): DialogParseResult {
  const { tools, options: reader, results } = ctx;
  const { rows } = tools;
  const titleRows: number[] = [];
  let at = tabsRow + 1;
  while (at < firstOption && rowIsBlank(tools.at(at))) at += 1;
  while (at < firstOption && !rowIsBlank(tools.at(at))) {
    titleRows.push(at);
    at += 1;
  }
  const title = tools.joinRows(titleRows.map((index) => tools.at(index)));
  const isReview = title === REVIEW_TITLE || tabs.active === 'Submit';
  const scan = reader.scan(firstOption, !isReview);
  if (!scan) {
    // Claude Code 2.1.301 draws the previews beside the options, which no option scan reads;
    // its notes hint still names them.
    if (rows.slice(firstOption).some((row) => row.text.includes('to add notes'))) {
      return results.unrecognized(top, PREVIEWS_REASON, null, false);
    }
    return results.unrecognized(top, message('The rows after the options are not a footer.'));
  }
  if (scan.problem) return results.unrecognized(top, scan.problem, scan);
  if (scan.footer?.hints.some((hint) => hint.key === 'n' && hint.action.startsWith('add notes'))) {
    // The preview layout: digits only move focus there.
    return results.unrecognized(top, PREVIEWS_REASON, scan, false);
  }
  const subject = makeSubject();
  subject.questionHeaders = tabs.headers;

  if (isReview) {
    const options: DialogOption[] = [];
    for (const [index, draft] of scan.drafts.entries()) {
      const role: DialogOptionRole | null =
        draft.label === 'Submit answers' ? 'submit' : draft.label === 'Cancel' ? 'cancel' : null;
      if (role === null || draft.field !== null) {
        return results.unrecognized(
          top,
          message('The review page offers “%@”, which Agentico does not know.', draft.label),
          scan,
        );
      }
      options.push(
        makeOption({
          ordinal: index + 1,
          number: draft.number,
          label: draft.label,
          role,
          isFocused: draft.isFocused,
        }),
      );
    }
    const bodyFrom = (titleRows[titleRows.length - 1] ?? tabsRow) + 1;
    const body: string[] = [];
    for (let index = bodyFrom; index < firstOption; index += 1) {
      const text = trimmedText(tools.at(index));
      if (text !== '') body.push(text);
    }
    subject.reviewAnswers = ctx.regions.reviewAnswers(bodyFrom, firstOption);
    return results.dialog({
      kind: 'claudeQuestionReview',
      title: REVIEW_TITLE,
      sourceSuffix: null,
      positionLabel: null,
      body,
      progress: REVIEW_TITLE,
      options,
      top,
      scan,
      subject,
    });
  }

  if (title === '') {
    return results.unrecognized(top, message("The question's text is not on screen."), scan);
  }
  // The last numbered option before the rule is "Type something": its placeholder until the user
  // types into it.
  const numberedBeforeRule = scan.drafts.filter((draft) => draft.number !== null && !draft.isChat);
  let otherIndex = -1;
  for (const [index, draft] of scan.drafts.entries()) {
    if (draft.number !== null && !draft.isChat) otherIndex = index;
  }
  const isMultiSelect =
    numberedBeforeRule.some((draft) => draft.isChecked !== null) &&
    scan.drafts.some((draft) => draft.isButton);
  const options: DialogOption[] = [];
  for (const [index, draft] of scan.drafts.entries()) {
    const ordinal = index + 1;
    if (index === otherIndex) {
      const field =
        draft.field ??
        (draft.labelIsInactive
          ? ({ kind: 'placeholder', text: draft.label } as const)
          : ({ kind: 'typed', text: draft.label } as const));
      const label =
        field.kind === 'placeholder' && field.text !== ''
          ? field.text
          : isMultiSelect
            ? 'Type something'
            : 'Type something.';
      options.push(
        makeOption({
          ordinal,
          number: draft.number,
          label,
          detail: draft.detail,
          role: 'otherText',
          isFocused: draft.isFocused,
          isChecked: isMultiSelect ? (draft.isChecked ?? false) : draft.isChecked,
          input: fieldInputState(field),
        }),
      );
      continue;
    }
    if (draft.field !== null || (draft.droppedResidue && draft.label === '')) {
      return results.unrecognized(
        top,
        message('Option %@ could not be read.', String(ordinal)),
        scan,
      );
    }
    const role: DialogOptionRole = draft.isButton ? 'next' : draft.isChat ? 'chat' : 'answer';
    options.push(
      makeOption({
        ordinal,
        number: draft.number,
        label: draft.label,
        detail: draft.detail,
        role,
        isFocused: draft.isFocused,
        isChecked:
          role === 'answer' ? (isMultiSelect ? (draft.isChecked ?? false) : draft.isChecked) : null,
      }),
    );
  }
  if (!options.some((option) => option.role === 'answer')) {
    return results.unrecognized(
      top,
      message('The question has no answers Agentico can read.'),
      scan,
    );
  }
  subject.question = title;
  return results.dialog({
    kind: 'claudeQuestion',
    title,
    sourceSuffix: null,
    positionLabel: null,
    body: [],
    progress: tabs.active,
    options,
    top,
    scan,
    subject,
  });
}
