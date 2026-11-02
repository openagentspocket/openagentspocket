import { claudeProgram, comparablePath, type HostReading } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Card, Icon, makeStyles, Text } from '@openagentspocket/ui';
import { Pressable } from 'react-native';

const useStyles = makeStyles((th) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.sm,
    minHeight: 48,
    paddingHorizontal: th.spacing.md,
  },
  title: { flex: 1 },
}));

/** The Claude Code directories a lone connected Host suggests; null when there is nothing to show. */
export function accountsNoticeTitle(readings: readonly HostReading[]): string | null {
  const [only] = readings;
  if (readings.length !== 1 || !only || (only.isConnected ?? true) === false) return null;
  if (only.state.kind !== 'available') return null;
  const claude = claudeProgram(only.state.report);
  // A plugin older than Accounts reports none: no notice.
  if (!claude?.accounts) return null;
  const counted = new Set(claude.accounts.map((a) => comparablePath(a.directory)));
  const count = (claude.accountSuggestions ?? []).filter(
    (s) => !counted.has(comparablePath(s.directory)),
  ).length;
  if (count === 0) return null;
  return count === 1
    ? t('Found 1 Claude Code directory')
    : t('Found %@ Claude Code directories', String(count));
}

/** usage.accounts-notice: "Found N Claude Code directories", a tap opens the Accounts sheet. */
export function UsageAccountsNotice({ title, onPress }: { title: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Card padded={false} testID="usage-accounts-notice">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={styles.row}
        testID="usage-accounts-notice-open"
      >
        <Icon name="folder" size={20} color="accent" />
        <Text style={styles.title}>{title}</Text>
        <Icon name="chevronRight" size={12} color="textTertiary" />
      </Pressable>
    </Card>
  );
}
