import { rowKey, type StatusInboxItem } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import { airy, Card, makeStyles, SectionHeader, Skeleton, Text } from '@openagentspocket/ui';
import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeContent, HomeInboxSection } from './homeModel';
import { InboxItem } from './InboxItem';

const TITLES = {
  needsYou: 'Needs you',
  working: 'Working',
  doneRecent: 'Done',
} as const satisfies Record<HomeInboxSection['section'], AppKey>;

const useStyles = makeStyles((th) => ({
  zone: { gap: airy.sectionGap },
  section: { gap: th.spacing.xxs },
  pair: { flexDirection: 'row', gap: th.spacing.xxs },
  cell: { flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
}));

/** Cards in one column, or in two on a wide phone (Swift `CardPairRow`). */
export function ColumnRows<T>({
  items,
  columns,
  keyOf,
  render,
}: {
  items: readonly T[];
  columns: 1 | 2;
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
}) {
  const styles = useStyles();
  if (columns === 1) {
    return (
      <>
        {items.map((item) => (
          <Fragment key={keyOf(item)}>{render(item)}</Fragment>
        ))}
      </>
    );
  }
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return (
    <>
      {pairs.map((pair) => (
        <View key={keyOf(pair[0] as T)} style={styles.pair}>
          {pair.map((item) => (
            <View key={keyOf(item)} style={styles.cell}>
              {render(item)}
            </View>
          ))}
          {pair.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </>
  );
}

interface HomeInboxProps {
  content: HomeContent;
  now: number;
  columns: 1 | 2;
  isPinned: (item: StatusInboxItem) => boolean;
  onOpen?: (item: StatusInboxItem) => void;
  onPin: (item: StatusInboxItem) => void;
  onClose: (item: StatusInboxItem) => void;
  onSeeAll?: () => void;
}

/** Needs you / Working / Done, the skeleton or quiet card, and the idle line with See all. */
export function HomeInbox({
  content,
  now,
  columns,
  isPinned,
  onOpen,
  onPin,
  onClose,
  onSeeAll,
}: HomeInboxProps) {
  const styles = useStyles();
  if (content.isQuiet) {
    return content.isLoading ? (
      <View style={styles.section} accessibilityLabel={t('Loading Agents…')}>
        <Skeleton height={72} />
        <Skeleton height={72} />
      </View>
    ) : (
      <Card testID="home-quiet">
        <Text variant="subheadline" tone="secondary">
          {t('All quiet. Nothing needs you.')}
        </Text>
      </Card>
    );
  }
  return (
    <View style={styles.zone}>
      {content.sections.map(({ section, items, total }, index) => (
        <View key={section} style={styles.section}>
          <SectionHeader title={t(TITLES[section])} count={total} />
          <ColumnRows
            items={items}
            columns={columns}
            keyOf={(item) => rowKey(item.row)}
            render={(item) => (
              <InboxItem
                item={item}
                now={now}
                pinned={isPinned(item)}
                onOpen={onOpen}
                onPin={onPin}
                onClose={onClose}
              />
            )}
          />
          {index === content.sections.length - 1 ? (
            <View style={styles.footer}>
              <Text variant="footnote" tone="secondary" testID="home-idle">
                {content.idleCount > 0 ? t('%lld idle', content.idleCount) : ''}
              </Text>
              {onSeeAll ? (
                <Text
                  variant="footnote"
                  semibold
                  tone="accent"
                  onPress={onSeeAll}
                  testID="home-see-all"
                >
                  {t('See all')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
