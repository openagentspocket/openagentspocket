import { fingerprintDisplay, type HostKeyCandidate } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';

export const TRUST_TIMEOUT_MS = 60_000;

/** The "Trust this Host?" alert; a prompt left unanswered past `timeoutMs` counts as declined. */
export function askToTrust(candidate: HostKeyCandidate, timeoutMs: number): Promise<boolean> {
  const answer = confirm({
    title: t('Trust this Host?'),
    message: t(
      "First connection to %@:%@.\n\nKey fingerprint:\n%@\n\nVerify it matches the Host's key before trusting.",
      candidate.host,
      String(candidate.port),
      fingerprintDisplay(candidate.fingerprint),
    ),
    confirmLabel: t('Trust'),
    cancelLabel: t("Don't Trust"),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  return Promise.race([answer, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Host-key prompts one at a time: several Hosts connecting at launch must not stack alerts.
 * The policy re-reads the pinned keys after each answer, so a key trusted by an earlier
 * answer is not asked about twice.
 */
export class TrustPromptQueue {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ask: (candidate: HostKeyCandidate) => Promise<boolean> = (candidate) =>
      askToTrust(candidate, TRUST_TIMEOUT_MS),
  ) {}

  confirm = (candidate: HostKeyCandidate): Promise<boolean> => {
    const run = this.tail.then(() => this.ask(candidate));
    this.tail = run.catch(() => undefined);
    return run;
  };
}
