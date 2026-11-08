import { useState } from 'react';
import { View } from 'react-native';
import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { Sheet } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import { Badge, StatusPill } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Chip } from '../primitives/Chip';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import { ProgramMark } from '../primitives/ProgramMark';
import { ScreenBackground } from '../primitives/ScreenBackground';
import { Section } from '../primitives/Section';
import { SectionHeader } from '../primitives/SectionHeader';
import { Segmented } from '../primitives/Segmented';
import { StatusOrb } from '../primitives/StatusOrb';
import { Text, type TextVariant } from '../primitives/Text';
import { FontScaleOverride } from '../theme/accessibility';
import { airy } from '../theme/metrics';
import { makeStyles, ThemeProvider, useTheme } from '../theme/theme';
import type { ThemeId } from '../theme/tokens.generated';
import { sampleAgents } from './galleryData';

const said = (title: string) => () => toast({ title, tone: 'info', durationMs: 1200 });
const STYLES: TextVariant[] = [
  'largeTitle',
  'title2',
  'headline',
  'body',
  'callout',
  'subheadline',
  'footnote',
  'caption',
  'caption2',
];
const MENU: ActionMenuItem[] = [
  { key: 'rename', title: 'Rename', icon: 'edit', section: 'Build agent', onPress: said('Rename') },
  { key: 'pin', title: 'Pin', icon: 'pin', onPress: said('Pin') },
  { key: 'close', title: 'Close', icon: 'trash', destructive: true, onPress: said('Close') },
];

const useStyles = makeStyles((t) => ({
  stage: {
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    overflow: 'hidden',
    padding: t.metrics.screenInset,
    gap: t.spacing.md,
  },
  rows: { gap: 2 * airy.rowInset },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  grow: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, flexWrap: 'wrap' },
  gap: { height: airy.sectionGap },
  toolbar: { alignSelf: 'flex-end', paddingHorizontal: t.spacing.xs, gap: t.spacing.xs },
}));

/** The primitives of docs/ux/design-system.md as one Swift-like screen, in the current theme. */
function ParityScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const [range, setRange] = useState('week');
  const [sheet, setSheet] = useState<'fraction' | 'bar' | 'large' | null>(null);
  return (
    <View style={styles.stage} testID="parity-stage">
      <ScreenBackground testID="parity-glow" />
      <GlassCapsule style={styles.toolbar} testID="parity-glass">
        <Icon name="settings" />
        <ActionMenuButton items={MENU} accessibilityLabel="More" title="Agent" native={false} />
      </GlassCapsule>
      <Text variant="title">Agentico</Text>
      <View>
        <SectionHeader
          title="Needs you"
          count={2}
          action={{ title: 'See all', onPress: () => {} }}
        />
        <View style={styles.rows}>
          {sampleAgents.slice(0, 3).map((agent) => (
            <Card
              key={agent.id}
              accent={agent.status === 'blocked' ? 'statusBlocked' : undefined}
              onPress={said(agent.name)}
              testID={`parity-row-${agent.id}`}
            >
              <View style={styles.titleLine}>
                <ProgramMark program={agent.program} status={agent.status} size={24} />
                <Text variant="headline" numberOfLines={1} style={styles.grow}>
                  {agent.name}
                </Text>
                <Text variant="caption" tone="secondary" monospaced tabularNums>
                  4m
                </Text>
              </View>
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                Run the targeted UI test before commit?
              </Text>
              <View style={styles.inline}>
                <Chip size="small" label={agent.workspace} />
                <Chip size="small" label={agent.program} />
                {agent.status === 'working' ? (
                  <StatusPill status="working" label="Working" leading={<StatusOrb size={12} />} />
                ) : (
                  <StatusPill status={agent.status} label={agent.status} />
                )}
                <Badge kind="wash" color={theme.colors.warning} label="16 %" />
              </View>
            </Card>
          ))}
        </View>
      </View>
      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <Section title="Settings" footer="Grouped rows share one card.">
        <ListRow icon="bell" title="Notifications" value="On" chevron />
        <ListRow icon="settings" title="Appearance" subtitle="Índigo" chevron />
      </Section>
      <View style={styles.inline}>
        {STYLES.map((variant) => (
          <Text key={variant} variant={variant} numberOfLines={1}>
            {variant}
          </Text>
        ))}
      </View>
      <View style={styles.inline}>
        <Button
          kind="secondary"
          size="small"
          title="Sheet 65%"
          onPress={() => setSheet('fraction')}
        />
        <Button kind="secondary" size="small" title="Form bar" onPress={() => setSheet('bar')} />
        <Button
          kind="secondary"
          size="small"
          title="Large title"
          onPress={() => setSheet('large')}
        />
      </View>
      <Sheet
        visible={sheet === 'fraction'}
        onClose={() => setSheet(null)}
        title="Workspace"
        detent={{ fraction: 0.65 }}
      >
        <Text tone="secondary">A 65% detent that grows to large.</Text>
      </Sheet>
      <Sheet
        visible={sheet === 'bar'}
        onClose={() => setSheet(null)}
        title="New Agent"
        detent="large"
        leading={{ label: 'Cancel', onPress: () => setSheet(null) }}
        trailing={{ label: 'Start', onPress: () => setSheet(null) }}
      >
        <Text tone="secondary">Cancel leading, confirm trailing.</Text>
      </Sheet>
      <Sheet
        visible={sheet === 'large'}
        onClose={() => setSheet(null)}
        title="Settings"
        detent="large"
        largeTitle
        leading={{ label: 'Done', onPress: () => setSheet(null) }}
      >
        <Text tone="secondary">Large title with a Done capsule.</Text>
      </Sheet>
    </View>
  );
}

function Variant({ label, themeId, scale }: { label: string; themeId: ThemeId; scale?: number }) {
  return (
    <ThemeProvider themeId={themeId}>
      <FontScaleOverride.Provider value={scale ?? null}>
        <Text variant="footnote" tone="secondary" testID={`parity-label-${label}`}>
          {label}
        </Text>
        <ParityScreen />
      </FontScaleOverride.Provider>
    </ThemeProvider>
  );
}

/** Every UX1 primitive in Índigo, Papel and at an accessibility text size (AX1, 1.8x). */
export function Parity() {
  return (
    <>
      <Variant label="Índigo" themeId="indigo" />
      <Variant label="Papel" themeId="papel" />
      <Variant label="Índigo, accessibility size" themeId="indigo" scale={1.8} />
    </>
  );
}
