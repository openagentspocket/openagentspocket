import { type GestureResponderEvent, View } from 'react-native';
import { Card } from '../primitives/Card';
import { MetaChip } from '../primitives/MetaChip';
import { ProgramMark } from '../primitives/ProgramMark';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles } from '../theme/theme';

export type InboxSection = 'needsYou' | 'working' | 'done';

export interface InboxPresentation {
  /** The program the Agent runs ("claude"). */
  program: string;
  title: string;
  /** What the Agent asks or does, already localized. */
  subtitle?: string;
  /** "4m", already localized. */
  age?: string;
  chips: readonly string[];
  section: InboxSection;
}

const SECTION_STATUS: Record<InboxSection, Status> = {
  needsYou: 'blocked',
  working: 'working',
  done: 'done',
};

const useStyles = makeStyles((t) => ({
  body: { gap: t.spacing.xs, padding: airy.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  title: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: airy.stack },
}));

interface InboxCardProps {
  presentation: InboxPresentation;
  /** The row open in the detail column (iPad): Card's selected look. */
  selected?: boolean;
  onPress?: () => void;
  /** Opens the quick-detail sheet. */
  onLongPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Swift's Status Inbox card: program mark with its status, title and age, what the Agent asks in
 * secondary text and mono chips (Host, directory). Needs-you cards carry a red ring.
 */
export function InboxCard({
  presentation: p,
  selected = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID = 'inbox-card',
}: InboxCardProps) {
  const styles = useStyles();
  const label =
    accessibilityLabel ??
    [p.title, p.subtitle, p.chips.join(', '), p.age].filter(Boolean).join('. ');
  return (
    <Card
      selected={selected}
      accent={p.section === 'needsYou' ? 'statusBlocked' : undefined}
      padded={false}
      style={styles.body}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={styles.header}>
        <ProgramMark program={p.program} status={SECTION_STATUS[p.section]} size={24} />
        <Text variant="subheadline" semibold numberOfLines={1} style={styles.title}>
          {p.title}
        </Text>
        {p.age ? (
          <Text variant="subheadline" tone="secondary" testID={`${testID}-age`}>
            {p.age}
          </Text>
        ) : null}
      </View>
      {p.subtitle ? (
        <Text variant="subheadline" tone="secondary" numberOfLines={3}>
          {p.subtitle}
        </Text>
      ) : null}
      {p.chips.length > 0 ? (
        <View style={styles.chips}>
          {p.chips.map((chip) => (
            <MetaChip key={chip} label={chip} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
