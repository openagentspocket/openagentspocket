import { message } from '../errors/text';
import type { ClaudeContext } from './claude-context';
import { type FieldText, fieldInputState, readQuestionTabs } from './claude-models';
import { readClaudeQuestion } from './claude-question';
import { readTitleRow, type TitleRow } from './claude-regions';
import { permissionRole, splitShortcut } from './row-scanner';
import { rowIsBlank, trimBlanks, trimmedText } from './screen';
import {
  type BlockedDialogKind,
  type DialogOption,
  type DialogParseResult,
  makeOption,
  makeSubject,
} from './types';

const PERMISSION_TITLES: Readonly<Record<string, BlockedDialogKind>> = {
  'Bash command': 'claudeBash',
  'Edit file': 'claudeFileEdit',
  'Create file': 'claudeFileCreate',
  'Read file': 'claudeFileRead',
  Fetch: 'claudeFetch',
};
const PLAN_QUESTION_PREFIX = 'Claude has written up a plan';

/** Reads a dialog whose numbered options were found (Swift's ClaudeDialogReader). */
export function readClaudeDialog(ctx: ClaudeContext): DialogParseResult {
  const { tools, regions, results } = ctx;
  const firstOption = tools.block.rows[0];
  if (!firstOption) return { kind: 'none' };
  const firstRow = firstOption.rowIndex;
  if (firstOption.number !== 1) {
    return results.unrecognized(
      null,
      message('The options do not start at 1, so the list may be scrolled.'),
    );
  }
  const top = regions.topRule(firstRow);
  if (top === null) {
    return results.unrecognized(null, message('The top of the dialog is off screen.'));
  }
  let headerRow = -1;
  for (let index = top + 1; index < firstRow; index += 1) {
    if (!rowIsBlank(tools.at(index))) {
      headerRow = index;
      break;
    }
  }
  if (headerRow < 0) return results.unrecognized(top, message('The dialog has no title.'));
  const header = tools.at(headerRow);
  const tabs = readQuestionTabs(header);
  if (tabs) return readClaudeQuestion(ctx, top, headerRow, tabs, firstRow);
  if (trimmedText(header).startsWith(PLAN_QUESTION_PREFIX)) {
    return readPlan(ctx, top, headerRow, firstRow);
  }
  const title = readTitleRow(header);
  const kind = PERMISSION_TITLES[title.text];
  if (kind === undefined || !Object.hasOwn(PERMISSION_TITLES, title.text)) {
    if (title.text === '') {
      return results.unrecognized(top, message("The dialog's title could not be read."));
    }
    return results.unrecognized(
      top,
      message('Agentico does not know the dialog “%@”.', title.text),
    );
  }
  return readPermission(ctx, kind, top, headerRow, title, firstRow);
}

function readPermission(
  ctx: ClaudeContext,
  kind: BlockedDialogKind,
  top: number,
  titleRow: number,
  title: TitleRow,
  firstOption: number,
): DialogParseResult {
  const { tools, options: reader, regions, results } = ctx;
  const scan = reader.scan(firstOption, false);
  if (!scan)
    return results.unrecognized(top, message('The rows after the options are not a footer.'));
  if (scan.problem) return results.unrecognized(top, scan.problem, scan);
  const options: DialogOption[] = [];
  for (const [index, draft] of scan.drafts.entries()) {
    const { label, shortcut } = splitShortcut(draft.label);
    const role = draft.labelIsInactive ? null : permissionRole(label, shortcut);
    if (role === null) {
      return results.unrecognized(
        top,
        message(
          'Option %@ reads “%@”, which is not a label Agentico knows.',
          String(draft.number ?? index + 1),
          label,
        ),
        scan,
      );
    }
    if (draft.field !== null && !draft.isFeedback) {
      return results.unrecognized(
        top,
        message('Option %@ is a text field Agentico does not expect here.', String(index + 1)),
        scan,
      );
    }
    options.push(
      makeOption({
        ordinal: index + 1,
        number: draft.number,
        label,
        detail: draft.detail,
        shortcut,
        role,
        isFocused: draft.isFocused,
        input: draft.field ? fieldInputState(draft.field) : null,
      }),
    );
  }
  if (
    !options.some((option) => option.role === 'decline') ||
    !options.some((option) => option.role !== 'decline')
  ) {
    return results.unrecognized(top, message('The dialog lacks a Yes or a No option.'), scan);
  }

  const sections = regions.bodySections(titleRow + 1, firstOption);
  const subject = makeSubject();
  const body: string[] = [];
  const description = sections.before.join(' ');
  if (description !== '') body.push(description);
  switch (kind) {
    case 'claudeBash': {
      const command = tools.joinRows(sections.content);
      subject.command = command === '' ? null : command;
      subject.commandDescription = description === '' ? null : description;
      if (command !== '') body.push(command);
      break;
    }
    case 'claudeFetch': {
      subject.host = trimBlanks(description.split(' from ').pop() ?? '');
      for (const entry of regions.labeledEntries(sections.content, ['url:', 'prompt:'])) {
        body.push(entry);
        if (entry.startsWith('url:')) subject.url = trimBlanks(entry.slice(4));
        else if (entry.startsWith('prompt:')) subject.prompt = trimBlanks(entry.slice(7));
      }
      break;
    }
    case 'claudeFileRead': {
      // `Read(<path>)`, a long path wrapped at the screen's edge.
      const call = sections.content.length === 0 ? description : tools.joinRows(sections.content);
      if (sections.content.length > 0 && call !== '') body.push(call);
      if (call.startsWith('Read(') && call.endsWith(')')) {
        subject.filePath = call.slice('Read('.length, -1);
      } else {
        subject.filePath = call === '' ? null : call;
      }
      break;
    }
    default: {
      subject.filePath = description === '' ? null : description;
      for (const row of sections.content) {
        const text = trimmedText(row);
        if (text !== '') body.push(text);
      }
    }
  }
  body.push(...sections.after);
  return results.dialog({
    kind,
    title: title.text,
    sourceSuffix: title.suffix,
    positionLabel: title.position,
    body,
    progress: null,
    options,
    top,
    scan,
    subject,
  });
}

function readPlan(
  ctx: ClaudeContext,
  lowerRule: number,
  questionRow: number,
  firstOption: number,
): DialogParseResult {
  const { options: reader, regions, results, tools } = ctx;
  const scan = reader.scan(firstOption, false);
  if (!scan) {
    return results.unrecognized(lowerRule, message('The rows after the options are not a footer.'));
  }
  if (scan.problem) return results.unrecognized(lowerRule, scan.problem, scan);
  const options: DialogOption[] = [];
  for (const [index, draft] of scan.drafts.entries()) {
    if (index === scan.drafts.length - 1) {
      // The last row is the "keep planning" field: its placeholder until the user types into it.
      const field: FieldText =
        draft.field ??
        (draft.labelIsInactive
          ? { kind: 'placeholder', text: draft.label }
          : { kind: 'typed', text: draft.label });
      const label =
        field.kind === 'placeholder' && field.text !== ''
          ? field.text
          : 'Tell Claude what to change';
      options.push(
        makeOption({
          ordinal: index + 1,
          number: draft.number,
          label,
          detail: draft.detail,
          role: 'otherText',
          isFocused: draft.isFocused,
          input: fieldInputState(field),
        }),
      );
      continue;
    }
    const { label, shortcut } = splitShortcut(draft.label);
    const role =
      draft.field === null && !draft.labelIsInactive ? permissionRole(label, shortcut) : null;
    if (role === null) {
      return results.unrecognized(
        lowerRule,
        message(
          'Option %@ reads “%@”, which is not a label Agentico knows.',
          String(draft.number ?? index + 1),
          label,
        ),
        scan,
      );
    }
    options.push(
      makeOption({
        ordinal: index + 1,
        number: draft.number,
        label,
        detail: draft.detail,
        shortcut,
        role,
        isFocused: draft.isFocused,
      }),
    );
  }
  if (options.length < 2) {
    return results.unrecognized(lowerRule, message('The plan dialog has too few options.'), scan);
  }
  const question = tools.paragraphs(questionRow, firstOption).join(' ');
  const upper = regions.planUpperBox(lowerRule);
  const subject = makeSubject();
  subject.planFilePath =
    [...(scan.footer?.extras ?? [])].reverse().find((extra) => extra.includes('/')) ?? null;
  return results.dialog({
    kind: 'claudePlan',
    title: upper.title ?? question,
    sourceSuffix: null,
    positionLabel: null,
    body: [...upper.planRows, ...(question === '' ? [] : [question])],
    progress: null,
    options,
    top: upper.top ?? lowerRule,
    scan,
    subject,
  });
}
