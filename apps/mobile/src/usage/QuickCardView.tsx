import { cardSubtitle, cardTitle, type QuickCard } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Card, Chip, makeStyles, ProgramMark, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { LimitWindowRow } from './LimitWindowRow';
import { localeTag, renderMessage, translateKey } from './usageText';

const useStyles = makeStyles((th) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xs },
  titles: { flex: 1 },
  body: { gap: th.spacing.sm, marginTop: th.spacing.sm },
}));

interface Props {
  card: QuickCard;
  now: Date;
}

/** One Usage Limits card: a program's (or one Claude Code Account's) windows on one Host. */
export function QuickCardView({ card, now }: Props) {
  const styles = useStyles();
  const subtitle = cardSubtitle(card, now, localeTag(), translateKey);
  const { body } = card;
  return (
    <Card level="overlay" accent={card.isStale ? 'warning' : undefined} testID={`card-${card.id}`}>
      <View style={styles.head}>
        <ProgramMark program={card.program} size={28} />
        <View style={styles.titles}>
          <Text variant="headline">{cardTitle(card)}</Text>
          {subtitle ? (
            <Text variant="caption" tone={card.isStale ? 'warning' : 'secondary'}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {card.plan ? <Chip label={card.plan} mono={false} /> : null}
      </View>
      <View style={styles.body}>
        {body.kind === 'windows'
          ? body.windows.map((window) => (
              <LimitWindowRow key={window.id} window={window} now={now} />
            ))
          : null}
        {body.kind === 'reading' ? (
          <Text tone="secondary">{t('Reading Usage Limits…')}</Text>
        ) : null}
        {body.kind === 'limitsOff' ? <Text tone="secondary">{t('Limits off')}</Text> : null}
        {body.kind === 'message' ? <Text tone="secondary">{renderMessage(body.text)}</Text> : null}
        {body.kind === 'uncounted' ? (
          <Text tone="secondary">{renderMessage(body.reason)}</Text>
        ) : null}
      </View>
    </Card>
  );
}
