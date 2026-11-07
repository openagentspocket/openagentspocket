import type { ActivityTap } from '@openagentspocket/core';
import { toast } from '@openagentspocket/ui';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { parseAppLink } from '@/links/appLink';
import { approvalFeedback } from '@/notifications/approvalFeedback';
import { useNotificationServices } from '@/notifications/services';

/** The launch URL is answered once per process: it stays readable for the app's whole life. */
let initialUrlAnswered = false;

/** Test hook: lets each test start from a fresh process. */
export function resetInitialUrlAnswer(): void {
  initialUrlAnswered = false;
}

/** The answer a link asks for, or null. `useIncomingLinks` opens its Agent either way. */
export function activityTapOf(url: string): ActivityTap | null {
  const link = parseAppLink(url);
  if (link?.kind !== 'agent' || !link.answer) return null;
  if (link.host.kind !== 'id' || link.paneId === null) return null;
  const { decision, episodeId } = link.answer;
  return { hostId: link.host.id, paneId: link.paneId, episodeId, decision };
}

/**
 * Answers the Live Activity's Approve and Deny. iOS gives a button no safe time for SSH in the
 * background, so a button is a link: it opens the app, like a notification action does, and the app
 * answers here, through every gate of `ActivityTapRunner`.
 */
export function LiveActivityActions(): null {
  const { liveActivity } = useNotificationServices();

  useEffect(() => {
    if (!liveActivity) return;
    const answer = async (url: string | null | undefined) => {
      const tap = url ? activityTapOf(url) : null;
      if (!tap) return;
      const result = await liveActivity.answer(tap);
      const title = result && approvalFeedback(result.outcome, result.host);
      if (title) toast({ title });
    };
    const subscription = Linking.addEventListener('url', ({ url }) => void answer(url));
    if (!initialUrlAnswered) {
      initialUrlAnswered = true;
      void Linking.getInitialURL().then(answer);
    }
    return () => subscription.remove();
  }, [liveActivity]);
  return null;
}
