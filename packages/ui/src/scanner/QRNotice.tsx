import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../primitives/EmptyState';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles(() => ({ area: { minHeight: 360 } }));

interface QRNoticeProps {
  title: string;
  message: string;
  actions?: ReactNode;
  testID: string;
}

/** The camera area when there is no camera to show: a centered empty state saying why and what to do instead. */
export function QRNotice({ title, message, actions, testID }: QRNoticeProps) {
  const styles = useStyles();
  return (
    <View style={styles.area}>
      <EmptyState icon="camera" title={title} message={message} actions={actions} testID={testID} />
    </View>
  );
}
