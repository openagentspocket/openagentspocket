import type { ActivityLink, ApprovalDecision } from '@openagentspocket/core';
import { toast } from '@openagentspocket/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { parseAppLink } from '@/links/appLink';
import { approvalFeedback } from '@/notifications/approvalFeedback';
import { useNotificationServices } from '@/notifications/services';
import { useAppLockState } from '@/settings/AppLockProvider';
import { ActivityConfirmSheet } from './ActivityConfirmSheet';
import type { ActivityLinkReview } from './runtime';

/** The launch URL is answered once per process: it stays readable for the app's whole life. */
let initialUrlAnswered = false;

/** Test hook: lets each test start from a fresh process. */
export function resetInitialUrlAnswer(): void {
  initialUrlAnswered = false;
}

/** The prompt an answer link names, or null. `useIncomingLinks` opens its Agent either way. */
export function activityLinkOf(url: string): ActivityLink | null {
  const link = parseAppLink(url);
  if (link?.kind !== 'agent' || !link.answer) return null;
  if (link.host.kind !== 'id' || link.paneId === null) return null;
  return { hostId: link.host.id, paneId: link.paneId, episodeId: link.answer.episodeId };
}

/**
 * Takes the Live Activity's Approve and Deny. iOS gives a button no safe time for SSH in the
 * background, so a button is a link that opens the app. But any app or page can open that link, so
 * it answers nothing: it opens a sheet with the prompt read from the Host, and only a tap there goes
 * on through the gates of `ActivityTapRunner`. While the app is covered nothing shows and nothing
 * runs; the link waits, and is read when the cover lifts.
 */
export function LiveActivityActions() {
  const { liveActivity } = useNotificationServices();
  const { covered } = useAppLockState();
  const [link, setLink] = useState<ActivityLink | null>(null);
  const [review, setReview] = useState<ActivityLinkReview | null>(null);
  // A prompt on screen stays: a link must not swap what the owner is about to tap.
  const showsAsk = useRef(false);
  showsAsk.current = review?.kind === 'ask' && !covered;

  useEffect(() => {
    if (!liveActivity) return;
    const receive = (url: string | null | undefined) => {
      const next = url ? activityLinkOf(url) : null;
      if (next && !showsAsk.current) setLink(next);
    };
    const subscription = Linking.addEventListener('url', ({ url }) => receive(url));
    if (!initialUrlAnswered) {
      initialUrlAnswered = true;
      void Linking.getInitialURL().then(receive);
    }
    return () => subscription.remove();
  }, [liveActivity]);

  useEffect(() => {
    setReview(null);
    if (!liveActivity || !link || covered) return;
    let current = true;
    void liveActivity.review(link).then((next) => {
      if (current) setReview(next);
    });
    return () => {
      current = false;
    };
  }, [liveActivity, link, covered]);

  const close = useCallback(() => setLink(null), []);

  const decide = useCallback(
    async (decision: ApprovalDecision) => {
      if (!liveActivity || !link || review?.kind !== 'ask') return;
      setLink(null);
      const result = await liveActivity.answer({ ...link, decision, shown: review.ask });
      const title = result && approvalFeedback(result.outcome, result.host);
      if (title) toast({ title });
    },
    [liveActivity, link, review],
  );

  if (!liveActivity) return null;
  return (
    <ActivityConfirmSheet
      visible={link !== null && !covered}
      review={review}
      onDecide={(decision) => void decide(decision)}
      onClose={close}
    />
  );
}
