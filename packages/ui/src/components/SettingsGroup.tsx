import { Fragment, type ReactNode } from 'react';
import { Switch, View } from 'react-native';
import { impact } from '../haptics';
import { Card } from '../primitives/Card';
import { Icon, type IconName } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import { SectionHeader } from '../primitives/SectionHeader';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const GLYPH = 24;

const useStyles = makeStyles((t) => ({
  group: { gap: t.spacing.xs },
  glyph: { width: GLYPH, alignItems: 'center' },
  separator: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    // Inset past the glyph: row padding, glyph and the gap after it.
    marginLeft: t.spacing.md + GLYPH + t.spacing.sm,
  },
  footer: { paddingHorizontal: t.spacing.xxs },
}));

export interface SettingsGroupRow {
  key: string;
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** Trailing value, truncated: "Índigo", "Off". */
  value?: string;
  /** A switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
  /** Shown before the value (palette dots). */
  valueAccessory?: ReactNode;
  onPress?: () => void;
}

interface SettingsGroupProps {
  title?: string;
  rows: readonly SettingsGroupRow[];
  footer?: string;
  testID?: string;
}

/** A settings section: a caption, then one rounded card of icon rows with hairlines inset past the glyph. */
export function SettingsGroup({ title, rows, footer, testID }: SettingsGroupProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.group} testID={testID}>
      {title ? <SectionHeader title={title} /> : null}
      <Card padded={false}>
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? <View style={styles.separator} testID="row-separator" /> : null}
            <ListRow
              title={row.title}
              subtitle={row.subtitle}
              leading={
                row.icon ? (
                  <View style={styles.glyph}>
                    <Icon name={row.icon} size={GLYPH} />
                  </View>
                ) : undefined
              }
              value={row.toggle ? undefined : row.value}
              trailing={
                row.toggle ? (
                  <Switch
                    value={row.toggle.value}
                    onValueChange={(next) => {
                      impact('light');
                      row.toggle?.onChange(next);
                    }}
                    accessibilityLabel={row.title}
                    trackColor={{ false: theme.colors.control, true: theme.colors.accent }}
                    ios_backgroundColor={theme.colors.control}
                    testID={`settings-toggle-${row.key}`}
                  />
                ) : (
                  row.valueAccessory
                )
              }
              chevron={!row.toggle}
              onPress={row.toggle ? undefined : row.onPress}
              testID={`settings-row-${row.key}`}
            />
          </Fragment>
        ))}
      </Card>
      {footer ? (
        <Text variant="footnote" tone="secondary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
