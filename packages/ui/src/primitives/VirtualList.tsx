import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { type ReactElement, type Ref, useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { SectionHeader } from './SectionHeader';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.metrics.screenInset, paddingVertical: t.spacing.md },
  header: {
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.xs,
    backgroundColor: t.colors.canvas,
  },
}));

export interface VirtualListProps<T> {
  data: readonly T[];
  renderItem: (item: T, index: number) => ReactElement | null;
  keyExtractor: (item: T, index: number) => string;
  /** Recycling pools per type (a header, a message, a tool row). */
  getItemType?: (item: T, index: number) => string;
  /** Chat mode: starts at the bottom and keeps following new items while the reader is at the end. */
  startAtBottom?: boolean;
  onEndReached?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
  stickyHeaderIndices?: number[];
  listRef?: Ref<FlashListRef<T>>;
  testID?: string;
}

/** The one long list (FlashList v2) with the screen inset and the theme's refresh control. */
export function VirtualList<T>({
  data,
  renderItem,
  keyExtractor,
  getItemType,
  startAtBottom = false,
  onEndReached,
  refreshing = false,
  onRefresh,
  ListEmptyComponent,
  ListHeaderComponent,
  stickyHeaderIndices,
  listRef,
  testID,
}: VirtualListProps<T>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <FlashList
      ref={listRef}
      data={data}
      renderItem={({ item, index }) => renderItem(item, index)}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      contentContainerStyle={styles.content}
      maintainVisibleContentPosition={
        startAtBottom
          ? { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }
          : undefined
      }
      onEndReached={onEndReached}
      ListEmptyComponent={ListEmptyComponent}
      ListHeaderComponent={ListHeaderComponent}
      stickyHeaderIndices={stickyHeaderIndices}
      keyboardShouldPersistTaps="handled"
      indicatorStyle={theme.appearance === 'dark' ? 'white' : 'black'}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        ) : undefined
      }
      testID={testID}
    />
  );
}

export interface ListSection<T> {
  key: string;
  title: string;
  data: readonly T[];
}

export type SectionedItem<T> =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; item: T };

/** Flattens sections into one list of headers and items, with the header indexes for sticking. */
export function flattenSections<T>(
  sections: readonly ListSection<T>[],
  keyOf: (item: T) => string,
): { items: SectionedItem<T>[]; headerIndexes: number[] } {
  const items: SectionedItem<T>[] = [];
  const headerIndexes: number[] = [];
  for (const section of sections) {
    if (section.data.length === 0) continue;
    headerIndexes.push(items.length);
    items.push({
      kind: 'header',
      key: `header:${section.key}`,
      title: section.title,
      count: section.data.length,
    });
    // Keys are namespaced by section: one Agent may sit in two sections, and FlashList needs unique keys.
    for (const item of section.data) {
      items.push({ kind: 'item', key: `${section.key}:${keyOf(item)}`, item });
    }
  }
  return { items, headerIndexes };
}

interface VirtualSectionListProps<T>
  extends Omit<
    VirtualListProps<T>,
    'data' | 'renderItem' | 'keyExtractor' | 'getItemType' | 'listRef'
  > {
  sections: readonly ListSection<T>[];
  renderItem: (item: T) => ReactElement | null;
  keyExtractor: (item: T) => string;
  /** Pins each section header to the top while its rows scroll. */
  stickyHeaders?: boolean;
}

/** A VirtualList grouped under SectionHeaders (empty sections are skipped). */
export function VirtualSectionList<T>({
  sections,
  renderItem,
  keyExtractor,
  stickyHeaders = false,
  ...rest
}: VirtualSectionListProps<T>) {
  const { items, headerIndexes } = useMemo(
    () => flattenSections(sections, keyExtractor),
    [sections, keyExtractor],
  );
  return (
    <VirtualList<SectionedItem<T>>
      {...rest}
      data={items}
      keyExtractor={(entry) => entry.key}
      getItemType={(entry) => entry.kind}
      stickyHeaderIndices={stickyHeaders ? headerIndexes : undefined}
      renderItem={(entry) =>
        entry.kind === 'header' ? (
          <SectionHeaderCell title={entry.title} count={entry.count} />
        ) : (
          renderItem(entry.item)
        )
      }
    />
  );
}

function SectionHeaderCell({ title, count }: { title: string; count: number }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <SectionHeader title={title} count={count} />
    </View>
  );
}
