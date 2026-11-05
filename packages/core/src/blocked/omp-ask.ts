// Oh My Pi's `Ask` panels (Swift OMPDialogParser.ask and review): one page per question, with a tab
// row when there are several, and a review page before the submit.

import { message } from '../errors/text';
import type { OmpLine, OmpPanel } from './omp-panel';
import { chars, dialogResult, pointed, unrecognized } from './omp-result';
import { type AnsiScreen, isBlankChar, trimBlanks } from './screen';
import {
  type DialogOption,
  type DialogParseResult,
  makeOption,
  makeSubject,
  type ReviewAnswer,
} from './types';

/** The unchecked radio of OMP's nerd-font symbols. */
const RADIO = '\u{F10C}';
const OTHER_LABEL = 'Other (type your own)';
const RECOMMENDED_SUFFIX = ' (Recommended)';
const SUBMIT_TAB = 'Submit';
const REVIEW_TITLE = 'Review answers';
const DRAFT_GUARD_FOOTER = 'Finish or clear the current prompt to answer';

/** `<pointer> <radio> label`, or the radio alone off focus. */
function choice(text: string): { label: string; isFocused: boolean } | null {
  const value = pointed(text);
  if (!value || chars(value.rest)[0] !== RADIO) return null;
  const label = chars(value.rest).slice(1);
  const space = label[0];
  if (space === undefined || !isBlankChar(space)) return null;
  let trimmed = trimBlanks(label.join(''));
  if (trimmed.endsWith(RECOMMENDED_SUFFIX)) trimmed = trimmed.slice(0, -RECOMMENDED_SUFFIX.length);
  return trimmed === '' ? null : { label: trimmed, isFocused: value.isFocused };
}

/**
 * `Ask`, one page per question. Several questions add a tab row above the question (`fruit    size
 * Submit`, the active tab bold on a fill). Below a rule, one row per option, `<pointer> <radio>
 * label`, the pointer on the focused one and the typed `Other` last; then the key hints. Digits do
 * nothing; arrows move and Enter answers, turning to the next tab. The Submit tab reviews the
 * answers above a lone `Submit`. While the prompt below holds a draft, the hints ask to finish it
 * first and keys go to the draft.
 *
 * Only the radio glyph seen live is read. Any other row, such as a multi-select question's or an
 * option's description, leaves the question to the terminal.
 */
export function ask(panel: OmpPanel, screen: AnsiScreen): DialogParseResult {
  const layout = () =>
    unrecognized(
      panel,
      screen,
      message(
        "Agentico doesn't know this question's layout. Answer it with these keys or in the terminal.",
      ),
    );
  const footer = panel.sections[2]?.[0]?.text;
  if (panel.sections.length !== 3 || footer === undefined) return layout();
  let header = [...(panel.sections[0] as readonly OmpLine[])];
  let tabs: string[] = [];
  let activeTab: string | null = null;
  const first = header[0];
  if (first && first.indent >= 2) {
    tabs = first.text
      .replace(/\s{2,}/g, '\u001f')
      .split('\u001f')
      .filter((tab) => tab !== '');
    const active = first.row.runs.find((run) => run.style.isBold && run.style.background !== null);
    activeTab = active ? trimBlanks(active.text) : null;
    if (activeTab === null || !tabs.includes(activeTab)) return layout();
    header = header.slice(1);
  }
  const question = header.map((line) => line.text).join(' ');
  if (question === '') return layout();
  const isGuarded = footer.startsWith(DRAFT_GUARD_FOOTER);
  const headers = tabs[tabs.length - 1] === SUBMIT_TAB ? tabs.slice(0, -1) : tabs;
  if (activeTab === SUBMIT_TAB && question === REVIEW_TITLE) {
    if (!isGuarded && !footer.includes('submit')) return layout();
    return review(panel, headers, isGuarded) ?? layout();
  }
  // Rows come first: a multi-select page's footer reads `toggle · submit`, never `select`, and is
  // still a question Agentico leaves to the terminal.
  const options: DialogOption[] = [];
  for (const line of panel.sections[1] as readonly OmpLine[]) {
    const read = choice(line.text);
    if (!read) {
      return unrecognized(
        panel,
        screen,
        message(
          "Agentico answers only Oh My Pi's single-select questions. Answer this one in the terminal.",
        ),
      );
    }
    options.push(
      makeOption({
        ordinal: options.length + 1,
        number: null,
        label: read.label,
        role: read.label === OTHER_LABEL ? 'otherText' : 'answer',
        isFocused: read.isFocused,
      }),
    );
  }
  if ((!isGuarded && !footer.includes('select')) || !options.some((o) => o.role === 'answer')) {
    return layout();
  }
  const focused = options.filter((option) => option.isFocused);
  const subject = makeSubject();
  subject.question = question;
  subject.questionHeaders = headers;
  return dialogResult(
    panel,
    'ompQuestion',
    question,
    [question],
    activeTab,
    options,
    focused.length === 1 ? (focused[0] as DialogOption).ordinal : null,
    isGuarded,
    subject,
  );
}

/** `Review answers`: `1. fruit: apple` per question, then `Submit`. */
function review(panel: OmpPanel, headers: string[], isGuarded: boolean): DialogParseResult | null {
  const answers: ReviewAnswer[] = [];
  const body: string[] = [];
  let submit: DialogOption | null = null;
  for (const line of panel.sections[1] as readonly OmpLine[]) {
    if (submit !== null) return null;
    const read = pointed(line.text);
    const colon = line.text.indexOf(': ');
    if (read && read.rest === SUBMIT_TAB) {
      submit = makeOption({
        ordinal: 1,
        number: null,
        label: read.rest,
        role: 'submit',
        isFocused: read.isFocused,
      });
    } else if (/^\d+\. /.test(line.text) && colon >= 0) {
      const before = line.text.slice(0, colon);
      const name = trimBlanks(before.slice(Math.max(0, before.indexOf(' '))));
      answers.push({ question: name, answer: line.text.slice(colon + 2) });
      body.push(line.text);
    } else {
      return null;
    }
  }
  if (submit === null || answers.length === 0 || answers.length !== headers.length) return null;
  const subject = makeSubject();
  subject.questionHeaders = headers;
  subject.reviewAnswers = answers;
  return dialogResult(
    panel,
    'ompQuestionReview',
    REVIEW_TITLE,
    body,
    REVIEW_TITLE,
    [submit],
    submit.isFocused ? submit.ordinal : null,
    isGuarded,
    subject,
  );
}
