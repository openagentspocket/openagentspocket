import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Status } from '../theme/status';
import { makeStyles } from '../theme/theme';
import { Card, type CardLevel } from './Card';
import { SectionHeader, type SectionHeaderAction } from './SectionHeader';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  section: { gap: t.spacing.xs },
  separator: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    marginLeft: t.spacing.md,
  },
  footer: { paddingHorizontal: t.spacing.xxs },
}));

interface SectionProps {
  title?: string;
  status?: Status;
  count?: number;
  action?: SectionHeaderAction;
  /** Small print under the group (what a setting does). */
  footer?: string;
  /** Rows inside one card with hairlines between them (settings, hosts); false lays children out loose. */
  grouped?: boolean;
  level?: CardLevel;
  /** Collapsible: hides the children while false. */
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
  testID?: string;
}

/** A section header, a grouped container of rows, and an optional footer. */
export function Section({
  title,
  status,
  count,
  action,
  footer,
  grouped = true,
  level,
  expanded,
  onToggle,
  children,
  testID,
}: SectionProps) {
  const styles = useStyles();
  const open = onToggle ? (expanded ?? false) : true;
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section} testID={testID}>
      {title ? (
        <SectionHeader
          title={title}
          status={status}
          count={count}
          action={action}
          expanded={open}
          onToggle={onToggle}
        />
      ) : null}
      {open && rows.length > 0 ? (
        grouped ? (
          <Card padded={false} level={level}>
            {rows.map((row, index) => (
              <Fragment key={row.key ?? index}>
                {index > 0 ? <View style={styles.separator} testID="row-separator" /> : null}
                {row}
              </Fragment>
            ))}
          </Card>
        ) : (
          rows
        )
      ) : null}
      {open && footer ? (
        <Text variant="footnote" tone="secondary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
