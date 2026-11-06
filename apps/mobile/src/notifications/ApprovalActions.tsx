import {
  type ApprovalDecision,
  type ApprovalOutcome,
  runApprovalAction,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { applyApproval, type SshTransport } from '@openagentspocket/transport';
import { toast } from '@openagentspocket/ui';
import { useEffect, useRef } from 'react';
import { useConsoleStore } from '@/console/hooks';
import { hostsRuntime } from '@/features/hosts/hostsRuntime';
import { useNotificationServices } from './services';

const DECISIONS: Readonly<Record<string, ApprovalDecision>> = {
  'agentico.approve': 'approve',
  'agentico.deny': 'deny',
};
/** An app opened by the action needs a moment to reach the Host. */
const CONNECT_WAIT_MS = 8_000;
const CONNECT_POLL_MS = 200;

interface Response {
  readonly actionIdentifier: string;
  readonly notification: {
    readonly request: {
      readonly identifier: string;
      readonly content: { readonly data?: unknown };
      readonly trigger?: { readonly payload?: unknown } | null;
    };
  };
}

function envelopeOf({ notification: { request } }: Response): string | null {
  const read = (source: unknown) => (source as { envelope?: unknown } | null | undefined)?.envelope;
  const value = read(request.content.data) ?? read(request.trigger?.payload);
  if (typeof value === 'string') return value;
  return value ? JSON.stringify(value) : null;
}

function feedback(outcome: ApprovalOutcome, host: string): string | null {
  switch (outcome) {
    case 'answered':
    case 'ignored':
      return null;
    case 'expired':
      return t('Too old to answer from here. Open the Agent.');
    case 'optedOut':
      return t('Approving from notifications is off for %@. Nothing was sent.', host);
    case 'notAnswerable':
    case 'promptChanged':
      return t("That prompt changed, or can't be answered here. Nothing was sent.");
    case 'promptCut':
      return t('The prompt was cut short, so approve it in the app. Nothing was sent.');
    case 'denyOnly':
      return t('Approve this kind of request in the app. Nothing was sent.');
    case 'pluginOutdated':
      return t(
        'Update the Agentico plugin on %@ to answer from notifications. Nothing was sent.',
        host,
      );
    case 'unreachable':
      return t("Couldn't reach %@. Nothing was sent.", host);
    case 'sendFailed':
    case 'timedOut':
      return t("Sent, but the Agent didn't react. Check it.");
  }
}

/** Registers Approve and Deny, and answers them. The Host has the last word on every key. */
export function ApprovalActions(): null {
  const console = useConsoleStore();
  const { approvals } = useNotificationServices();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!approvals) return;
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const open = { identifier: 'agentico.open', buttonTitle: t('Open') };
    const deny = {
      identifier: 'agentico.deny',
      buttonTitle: t('Deny'),
      options: { opensAppToForeground: true, isDestructive: true },
    };
    const approve = {
      identifier: 'agentico.approve',
      buttonTitle: t('Approve'),
      options: { opensAppToForeground: true, isAuthenticationRequired: true },
    };
    void Notifications.setNotificationCategoryAsync('AGENT_APPROVAL', [open, deny, approve]);
    void Notifications.setNotificationCategoryAsync('AGENT_APPROVAL_DENY_ONLY', [open, deny]);

    const live = async (hostId: string) => {
      const until = Date.now() + CONNECT_WAIT_MS;
      const isLive = () =>
        console.getState().hosts.find((host) => host.id === hostId)?.link === 'live';
      while (!isLive() && Date.now() < until) {
        await new Promise<void>((resolve) => setTimeout(resolve, CONNECT_POLL_MS));
      }
    };
    const answer = async (response: Response | null) => {
      const decision = response && DECISIONS[response.actionIdentifier];
      const envelope = response && envelopeOf(response);
      if (!response || !decision || !envelope) return;
      const id = `${response.notification.request.identifier}/${decision}`;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      const { outcome, hostName } = await runApprovalAction({
        envelope,
        decision,
        keys: approvals.keys.allRecords(),
        optIns: approvals.optIns,
        ledger: approvals.ledger,
        nowSeconds: Math.floor(Date.now() / 1000),
        apply: async (hostId, request) => {
          await live(hostId);
          const host = hostsRuntime()
            .model.getSnapshot()
            .hosts.find((h) => h.id === hostId);
          return console.withTransport(hostId, (transport) =>
            applyApproval(transport as SshTransport, request, host?.herdrEndpoint ?? null),
          );
        },
      });
      const title = feedback(outcome, hostName ?? '');
      if (title) toast({ title });
    };
    void answer(Notifications.getLastNotificationResponse() as Response | null);
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => void answer(response as Response),
    );
    return () => subscription.remove();
  }, [approvals, console]);
  return null;
}
