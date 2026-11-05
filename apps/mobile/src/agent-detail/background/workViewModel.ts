import type {
  BackgroundWorkAgent,
  BackgroundWorkPresentation,
  BackgroundWorkPresentedRow,
  Text,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type {
  BackgroundWorkAgentItem,
  BackgroundWorkDetailItem,
  BackgroundWorkItem,
  BackgroundWorkSummaryLine,
} from '@openagentspocket/ui';
import { renderMessage } from '@/lib/renderText';

const words = (text: Text | null): string | undefined =>
  text === null ? undefined : renderMessage(text);

/** A strip row: title, type or phase, fraction, and the time (or why there is none). */
export function stripItem(row: BackgroundWorkPresentedRow): BackgroundWorkItem {
  return {
    id: row.id,
    title: row.title,
    caption: renderMessage(row.caption),
    monospaced: row.kind === 'workflow',
    state: row.status,
    fraction: row.fraction ?? undefined,
    meta: row.time ?? words(row.shortNote),
  };
}

function agentItem(agent: BackgroundWorkAgent, index: number): BackgroundWorkAgentItem {
  return {
    id: agent.id,
    state: agent.status,
    label: agent.label === '' ? t('Agent %lld', index + 1) : agent.label,
    phase: agent.phase ?? undefined,
  };
}

/** A sheet row: the work in full, what it is, how far along, and what it cost once it ended. */
export function detailItem(row: BackgroundWorkPresentedRow): BackgroundWorkDetailItem {
  const finished =
    row.status === 'completed' || row.status === 'failed' || row.status === 'stopped';
  return {
    id: row.id,
    title: row.title,
    monospaced: row.kind === 'workflow',
    state: row.status,
    time: row.time ?? undefined,
    note: words(row.note),
    body: row.detail ?? renderMessage(row.caption),
    fraction: row.fraction ?? undefined,
    // While it runs, a Workflow can start more agents.
    fractionText: row.fraction
      ? finished
        ? t('%lld of %lld agents done', row.fraction.done, row.fraction.total)
        : t('%lld of %lld agents done so far', row.fraction.done, row.fraction.total)
      : undefined,
    usage: words(row.usage),
    agents: row.agents.map(agentItem),
    accessibilityLabel: renderMessage(row.accessibilityLabel),
  };
}

export function summaryLine(
  presentation: BackgroundWorkPresentation,
): BackgroundWorkSummaryLine | undefined {
  const summary = presentation.summary;
  return summary ? { state: summary.status, text: renderMessage(summary.text) } : undefined;
}
