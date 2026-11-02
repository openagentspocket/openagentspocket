import { t } from '@openagentspocket/i18n';
import {
  ActionMenuButton,
  type ActionMenuItem,
  Button,
  makeStyles,
  Text,
} from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  title: { flex: 1 },
}));

interface FolderHeaderProps {
  title: string;
  path: string | null;
  loadingLabel: string;
  canGoUp: boolean;
  menu: readonly ActionMenuItem[];
  onGoUp: () => void;
}

/** The folder's name and path, the way up, and the upload / refresh menu. */
export function FolderHeader({
  title,
  path,
  loadingLabel,
  canGoUp,
  menu,
  onGoUp,
}: FolderHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Button
        icon="arrowUp"
        accessibilityLabel={t('Parent folder')}
        kind="text"
        disabled={!canGoUp}
        onPress={onGoUp}
        testID="files-up"
      />
      <View style={styles.title}>
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        <Text
          variant="caption"
          tone="secondary"
          numberOfLines={1}
          accessibilityLabel={t('Path %@', path ?? '')}
        >
          {path ?? loadingLabel}
        </Text>
      </View>
      <ActionMenuButton items={menu} accessibilityLabel={t('Upload')} icon="more" />
    </View>
  );
}
