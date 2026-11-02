import { t } from '@openagentspocket/i18n';
import { ListRow, Section } from '@openagentspocket/ui';

interface Props {
  onQuick: () => void;
  onLimits: () => void;
  /** Present when a Host in scope has Claude Code Accounts. */
  onAccounts?: () => void;
}

/** The ways to the quick limits sheet, the full Limits page and the Claude Code Accounts. */
export function UsageLimitsRows({ onQuick, onLimits, onAccounts }: Props) {
  return (
    <Section grouped>
      <ListRow title={t('Usage Limits')} chevron onPress={onQuick} testID="open-limits-sheet" />
      <ListRow
        title={t('Limits')}
        subtitle={t('Account windows as each service reports them')}
        chevron
        onPress={onLimits}
        testID="open-limits-page"
      />
      {onAccounts ? (
        <ListRow
          title={t('Claude Code Accounts')}
          chevron
          onPress={onAccounts}
          testID="open-accounts"
        />
      ) : null}
    </Section>
  );
}
