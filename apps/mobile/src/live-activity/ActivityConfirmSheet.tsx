import type { ApprovalDecision, ApprovalOutcome } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, makeStyles, Sheet, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { approvalFeedback } from '@/notifications/approvalFeedback';
import type { ActivityLinkReview } from './runtime';

const useStyles = makeStyles((th) => ({
  body: { gap: th.spacing.sm, padding: th.spacing.md },
  actions: { flexDirection: 'row', gap: th.spacing.sm, padding: th.spacing.md },
  action: { flex: 1 },
}));

/** Why there is no prompt to answer: a gone prompt reads the same however it went. */
function nothingMessage(outcome: ApprovalOutcome, host: string): string {
  if (outcome === 'promptChanged' || outcome === 'notAnswerable') {
    return t('There is nothing to answer here.');
  }
  return approvalFeedback(outcome, host) ?? t('There is nothing to answer here.');
}

function ConfirmBody({ review }: { review: ActivityLinkReview | null }) {
  const styles = useStyles();
  if (!review) {
    return (
      <View style={styles.body}>
        <Text tone="secondary">{t('Checking…')}</Text>
      </View>
    );
  }
  if (review.kind === 'nothing') {
    return (
      <View style={styles.body}>
        <Text testID="activity-confirm-nothing">{nothingMessage(review.outcome, review.host)}</Text>
      </View>
    );
  }
  const { ask, approve, deny, approveRefusal, host } = review;
  const note = approveRefusal && approvalFeedback(approveRefusal, host);
  return (
    <View style={styles.body}>
      <Text variant="footnote" tone="secondary">
        {host}
      </Text>
      <Text variant="mono" testID="activity-confirm-prompt">
        {ask.prompt}
      </Text>
      {approve !== null ? <Text>{t('Approve: %@', approve)}</Text> : null}
      {deny !== null ? <Text>{t('Deny: %@', deny)}</Text> : null}
      {note ? (
        <Text variant="footnote" tone="secondary">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

interface Props {
  visible: boolean;
  /** What to ask; null while the Host is being read. */
  review: ActivityLinkReview | null;
  onDecide: (decision: ApprovalDecision) => void;
  onClose: () => void;
}

/** What a Live Activity link opens: the prompt as the Host reports it, and only a tap here answers. */
export function ActivityConfirmSheet({ visible, review, onDecide, onClose }: Props) {
  const styles = useStyles();
  const ask = visible && review?.kind === 'ask' ? review : null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Answer This Prompt')}
      detent="fit"
      testID="activity-confirm"
      footer={
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              title={t('Cancel')}
              kind="secondary"
              size="dense"
              onPress={onClose}
              testID="activity-confirm-cancel"
            />
          </View>
          {ask?.deny != null ? (
            <View style={styles.action}>
              <Button
                title={t('Deny')}
                kind="destructive"
                size="dense"
                onPress={() => onDecide('deny')}
                testID="activity-confirm-deny"
              />
            </View>
          ) : null}
          {ask?.approve != null ? (
            <View style={styles.action}>
              <Button
                title={t('Approve')}
                size="dense"
                onPress={() => onDecide('approve')}
                testID="activity-confirm-approve"
              />
            </View>
          ) : null}
        </View>
      }
    >
      {visible ? <ConfirmBody review={review} /> : null}
    </Sheet>
  );
}
