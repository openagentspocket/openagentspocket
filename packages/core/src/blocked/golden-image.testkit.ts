/**
 * Test support: maps the port's values into the JSON image the Swift goldens use
 * (packages/core/goldens/README.md, "JSON encoding"), so a test can deep-compare parsed values.
 * Not exported from the package.
 */
import { renderText } from '../errors/text';
import type { DialogFingerprint } from './fingerprint';
import type { ConfirmationRule, DialogExpectation, DialogStep, PlanResult } from './plan-types';
import type { AnsiScreen, ScreenColor, ScreenRow, ScreenStyle } from './screen';
import type { BlockedDialog, DialogOption, DialogParseResult, InputRowState } from './types';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const colorImage = (color: ScreenColor | null): Json => {
  if (color === null) return null;
  return color.kind === 'indexed' ? { indexed: color.index } : { rgb: [color.r, color.g, color.b] };
};

export const styleImage = (style: ScreenStyle): Json => ({
  background: colorImage(style.background),
  foreground: colorImage(style.foreground),
  isBold: style.isBold,
  isDim: style.isDim,
  isItalic: style.isItalic,
  isReverse: style.isReverse,
});

export const rowImage = (row: ScreenRow): Json => ({
  index: row.index,
  runs: row.runs.map((run) => ({
    column: run.column,
    style: styleImage(run.style),
    text: run.text,
    width: run.width,
  })),
  text: row.text,
  width: row.width,
});

/** The `.screen.json` image: distinct styles in first-use order, runs as arrays. */
export function screenImage(screen: AnsiScreen): Json {
  const styles: ScreenStyle[] = [];
  const keyOf = (style: ScreenStyle) => JSON.stringify(styleImage(style));
  const rows = screen.rows.map((row) => ({
    index: row.index,
    runs: row.runs.map((run) => {
      let at = styles.findIndex((known) => keyOf(known) === keyOf(run.style));
      if (at < 0) {
        styles.push(run.style);
        at = styles.length - 1;
      }
      return [run.column, run.width, at, run.text];
    }),
    text: row.text,
    width: row.width,
  }));
  return { columns: screen.columns, rows, styles: styles.map(styleImage) };
}

const fingerprintImage = (fingerprint: DialogFingerprint): Json => ({
  requestLines: fingerprint.requestLines,
  ruleLines: fingerprint.ruleLines,
  value: fingerprint.value,
});

const inputImage = (input: InputRowState | null): Json =>
  input === null
    ? null
    : input.kind === 'placeholder'
      ? { placeholder: input.text }
      : { text: input.text };

const optionImage = (option: DialogOption): Json => ({
  detail: option.detail,
  input: inputImage(option.input),
  isChecked: option.isChecked,
  isFocused: option.isFocused,
  label: option.label,
  number: option.number,
  ordinal: option.ordinal,
  role: option.role,
  shortcut: option.shortcut,
});

const dialogImage = (dialog: BlockedDialog): Json => ({
  body: [...dialog.body],
  fingerprint: fingerprintImage(dialog.fingerprint),
  focus: { ...dialog.focus, checked: [...dialog.focus.checked] },
  kind: dialog.kind,
  note: dialog.note,
  options: dialog.options.map(optionImage),
  positionLabel: dialog.positionLabel,
  progress: dialog.progress,
  rows: { ...dialog.rows },
  sourceSuffix: dialog.sourceSuffix,
  subject: {
    ...dialog.subject,
    destinations: [...dialog.subject.destinations],
    questionHeaders: [...dialog.subject.questionHeaders],
    notes: [...dialog.subject.notes],
    reviewAnswers: dialog.subject.reviewAnswers.map((entry) => ({ ...entry })),
  },
  title: dialog.title,
});

/** The golden's `parse` value for a result. */
export function parseImage(result: DialogParseResult): Json {
  if (result.kind === 'none') return 'none';
  if (result.kind === 'dialog') return { dialog: dialogImage(result.dialog) };
  const { excerpt } = result;
  return {
    unrecognized: {
      displayLines: excerpt.displayLines ? [...excerpt.displayLines] : null,
      fingerprint: fingerprintImage(excerpt.fingerprint),
      numbered: Object.fromEntries(
        [...excerpt.numbered].map(([number, label]) => [String(number), label]),
      ),
      reason: renderText(excerpt.reason),
      rows: excerpt.rows.map(rowImage),
    },
  };
}

const expectationImage = (expectation: DialogExpectation): Json => {
  switch (expectation.kind) {
    case 'focus':
    case 'feedbackMode':
      return { [expectation.kind]: { ordinal: expectation.ordinal } };
    case 'inputText':
    case 'notes':
      return { [expectation.kind]: expectation.text };
    case 'checked':
      return { checked: [...expectation.ordinals] };
    case 'page':
      return { page: expectation.page };
    case 'queuedNotice':
      return { queuedNotice: expectation.title };
  }
};

const stepImage = (step: DialogStep): Json => {
  if (step.kind === 'keys') return { keys: [...step.keys] };
  if (step.kind === 'paste') return { paste: step.text };
  return { expect: expectationImage(step.expectation) };
};

const confirmationImage = (rule: ConfirmationRule): Json => {
  if (rule.kind === 'toolResult') return { toolResult: { id: rule.id } };
  if (rule.kind === 'queuedNotice') return { queuedNotice: rule.title };
  return rule.kind;
};

/** The golden's `result` value for a planner outcome. */
export function planImage(result: PlanResult): Json {
  if (result.ok) {
    return {
      plan: {
        confirmation: confirmationImage(result.plan.confirmation),
        focusesComposer: result.plan.focusesComposer,
        steps: result.plan.steps.map(stepImage),
      },
    };
  }
  const { error } = result;
  if (error.kind === 'unsupported') return { error: { unsupported: renderText(error.reason) } };
  if (error.kind === 'noSuchOption') return { error: { noSuchOption: error.ordinal } };
  return { error: error.kind };
}
