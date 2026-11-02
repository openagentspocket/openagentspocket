import type { ReactNode } from 'react';
import { Card } from '../primitives/Card';
import { EmptyState } from '../primitives/EmptyState';

interface QRNoticeProps {
  title: string;
  message: string;
  actions?: ReactNode;
  testID: string;
}

/** The camera area when there is no camera to show: why, and what to do instead. */
export function QRNotice({ title, message, actions, testID }: QRNoticeProps) {
  return (
    <Card>
      <EmptyState
        layout="compact"
        icon="camera"
        title={title}
        message={message}
        actions={actions}
        testID={testID}
      />
    </Card>
  );
}
