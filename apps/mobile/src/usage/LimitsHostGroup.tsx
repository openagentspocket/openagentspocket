import { claudeProgram, type IncludedHost, type QuickCard } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, ListRow, makeStyles, Section, Text, ToggleRow } from '@openagentspocket/ui';
import { View } from 'react-native';
import { QuickCardView } from './QuickCardView';

const useStyles = makeStyles((th) => ({
  root: { gap: th.spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xs },
}));

interface Props {
  host: IncludedHost;
  cards: readonly QuickCard[];
  now: Date;
  claudeLimits: boolean;
  onClaudeLimits: (enabled: boolean) => void;
  onAccounts: () => void;
}

/** One Host of the limits sheet: name, the Claude Code switch with its Accounts row, then its program cards. */
export function LimitsHostGroup({
  host,
  cards,
  now,
  claudeLimits,
  onClaudeLimits,
  onAccounts,
}: Props) {
  const styles = useStyles();
  const accounts = claudeProgram(host.report)?.accounts;
  return (
    <View style={styles.root} testID={`limits-host-${host.id}`}>
      <View style={styles.head}>
        <Icon name="server" size={22} color="textPrimary" />
        <Text variant="title2" accessibilityRole="header">
          {host.name}
        </Text>
      </View>
      <Section
        grouped
        footer={t(
          'The plugin asks Claude Code on this computer for your plan limits. Neither the plugin nor Agentico handles your sign-in. This automated use is not officially supported.',
        )}
      >
        <ToggleRow
          title={t('Claude Code limits')}
          subtitle={claudeLimits ? undefined : t('Usage Limits are off.')}
          value={claudeLimits}
          onValueChange={onClaudeLimits}
          testID={`claude-limits-toggle-${host.id}`}
        />
        {accounts ? (
          <ListRow
            title={t('Claude Code Accounts')}
            value={String(accounts.length)}
            chevron
            onPress={onAccounts}
            testID={`open-accounts-${host.id}`}
          />
        ) : null}
      </Section>
      {cards.map((card) => (
        <QuickCardView key={card.id} card={card} now={now} compact />
      ))}
    </View>
  );
}
