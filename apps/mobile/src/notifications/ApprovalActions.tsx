import { type ApprovalDecision, runApprovalAction } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { applyApproval, type SshTransport } from '@openagentspocket/transport';
import { toast } from '@openagentspocket/ui';
import { useEffect, useRef } from 'react';
import { useConsoleStore } from '@/console/hooks';
import { waitForLiveHost } from '@/console/waitForLiveHost';
import { hostsRuntime } from '@/features/hosts/hostsRuntime';
import { approvalFeedback } from './approvalFeedback';
import { loadNotifications } from './loadNotifications';
import { useNotificationServices } from './services';

const DECISIONS: Readonly<Record<string, ApprovalDecision>> = {
  'agentico.approve': 'approve',
  'agentico.deny': 'deny',
};

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

/** Registers Approve and Deny, and answers them. The Host has the last word on every key. */
export function ApprovalActions(): null {
  const console = useConsoleStore();
  const { approvals } = useNotificationServices();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!approvals) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;
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
          await waitForLiveHost(console, hostId);
          const host = hostsRuntime()
            .model.getSnapshot()
            .hosts.find((h) => h.id === hostId);
          return console.withTransport(hostId, (transport) =>
            applyApproval(transport as SshTransport, request, host?.herdrEndpoint ?? null),
          );
        },
      });
      const title = approvalFeedback(outcome, hostName ?? '');
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
