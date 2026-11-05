import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { SectionHeader } from '../primitives/SectionHeader';
import { Text } from '../primitives/Text';
import { useTerminalColors } from '../terminal/TerminalThemeContext';
import { withAlpha } from '../theme/color';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';

export interface StripSession {
  id: string;
  kind: 'agent' | 'shell';
  /** The program ("claude") or shell name ("landing $"). */
  name: string;
  title: string;
  host: string;
  status?: Status;
}

export const TILE_WIDTH = 132;
const TILE_GAP = 13;

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.xs },
  header: { paddingHorizontal: t.metrics.screenInset },
  strip: { paddingHorizontal: t.metrics.screenInset, gap: TILE_GAP },
  item: { width: TILE_WIDTH, gap: t.spacing.xxs },
  tile: {
    height: 84,
    justifyContent: 'space-between',
    padding: airy.tile,
    borderRadius: t.metrics.cardRadius,
    backgroundColor: t.colors.surface,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  caption: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  captionTitle: { flex: 1 },
}));

interface SessionsStripProps {
  sessions: readonly StripSession[];
  /** "Sessions", already localized. */
  title: string;
  /** With both, the header carries a "See all" action. */
  seeAllLabel?: string;
  onSeeAll?: () => void;
  onOpen: (id: string) => void;
  /** What fills a tile in place of the program name (a PaneSnapshot); the name stays when it is absent. */
  renderPreview?: (session: StripSession) => ReactNode;
}

/** Swift's Home Sessions strip: tiles that bleed to the edge and snap, captions below each. */
export function SessionsStrip({
  sessions,
  title,
  seeAllLabel,
  onOpen,
  onSeeAll,
  renderPreview,
}: SessionsStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const terminal = useTerminalColors();
  return (
    <View style={styles.root} testID="sessions-strip">
      <View style={styles.header}>
        <SectionHeader
          title={title}
          count={sessions.length}
          action={
            seeAllLabel && onSeeAll
              ? {
                  title: seeAllLabel,
                  onPress: onSeeAll,
                  accessibilityLabel: `${seeAllLabel} ${title}`,
                }
              : undefined
          }
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TILE_WIDTH + TILE_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.strip}
      >
        {sessions.map((s) => (
          <Pressable
            key={s.id}
            style={styles.item}
            onPress={() => onOpen(s.id)}
            accessibilityRole="button"
            accessibilityLabel={[s.title, s.name, s.host].join(', ')}
            testID={`session-${s.id}`}
          >
            <View style={[styles.tile, { backgroundColor: terminal.background }]}>
              {renderPreview?.(s) ?? (
                <>
                  <Icon
                    name={s.kind === 'agent' ? 'sparkles' : 'terminal'}
                    size={14}
                    tint={withAlpha(theme.colors.terminalForeground, 0.7)}
                  />
                  <Text
                    variant="footnote"
                    monospaced
                    numberOfLines={1}
                    style={{ color: theme.colors.terminalForeground }}
                  >
                    {s.name}
                  </Text>
                </>
              )}
            </View>
            <View style={styles.caption}>
              {s.kind === 'agent' ? (
                <ProgramMark program={s.name} status={s.status} size={18} surface="canvas" />
              ) : (
                <Icon name="terminal" size={16} color="textPrimary" />
              )}
              <Text variant="footnote" semibold numberOfLines={1} style={styles.captionTitle}>
                {s.title}
              </Text>
            </View>
            <Text variant="caption2" monospaced tone="tertiary" numberOfLines={1}>
              {s.host}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
