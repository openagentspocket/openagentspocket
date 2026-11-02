import { View } from 'react-native';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  title: { flex: 1 },
  split: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  diff: { flexDirection: 'row', gap: t.spacing.xs },
}));

export interface AgentListFieldsPreviewLabels {
  caption: string;
  name: string;
  status: string;
  subtitle: string;
  path: string;
}

export const defaultAgentFieldsPreviewLabels: AgentListFieldsPreviewLabels = {
  caption: 'CONSOLE PREVIEW',
  name: 'agentico',
  status: 'Idle',
  subtitle: 'fix sidebar sync',
  path: '/work/agentico',
};

interface AgentListFieldsPreviewProps {
  hostName: string;
  /** Field ids of the layout being edited; a sample line is hidden when its field is absent. */
  fields?: readonly string[];
  labels?: Partial<AgentListFieldsPreviewLabels>;
  testID?: string;
}

/**
 * One sample Agent row reflecting the layout being edited, under a caption. Until the shared
 * AgentCard lands (UX3-agent-rows) it draws the same anatomy from primitives.
 */
export function AgentListFieldsPreview({
  hostName,
  fields,
  labels,
  testID = 'agent-fields-preview',
}: AgentListFieldsPreviewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultAgentFieldsPreviewLabels, ...labels };
  const shows = (field: string) => !fields || fields.includes(field);
  return (
    <View
      style={styles.root}
      testID={testID}
      accessible
      accessibilityLabel={`${text.name}, ${text.status}`}
    >
      <Text variant="caption" tone="secondary" semibold>
        {text.caption}
      </Text>
      <View style={styles.head}>
        <Icon name="sparkles" size={20} color="accent" />
        <Text variant="headline" style={styles.title} numberOfLines={1}>
          {text.name}
        </Text>
        <Badge label={text.status} kind="control" />
      </View>
      <View style={styles.split}>
        {shows('subtitle') ? <Text variant="footnote">{text.subtitle}</Text> : null}
        {shows('host') ? (
          <Text variant="footnote" tone="secondary">
            {hostName}
          </Text>
        ) : null}
      </View>
      <View style={styles.split}>
        {shows('directory') ? (
          <Text variant="footnote" monospaced tone="secondary">
            {text.path}
          </Text>
        ) : null}
        {shows('diff') ? (
          <View style={styles.diff}>
            <Text variant="footnote" monospaced style={{ color: theme.colors.success }}>
              +12
            </Text>
            <Text variant="footnote" monospaced style={{ color: theme.colors.danger }}>
              −7
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
