import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  capsule: {
    height: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.xs,
    justifyContent: 'center',
    flexShrink: 1,
  },
}));

interface HostScopeMenuProps {
  /** Empty with fewer than two Hosts: there is nothing to choose and the capsule is hidden. */
  items: readonly ActionMenuItem[];
  /** The current choice: a Host's name, or All Hosts. */
  label: string;
  accessibilityLabel: string;
  testID?: string;
}

/** The nav bar capsule that shows which Host a screen is scoped to and changes it. */
export function HostScopeMenu({
  items,
  label,
  accessibilityLabel,
  testID = 'host-scope',
}: HostScopeMenuProps) {
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <GlassCapsule style={styles.capsule} testID={`${testID}-capsule`}>
      <ActionMenuButton
        items={items}
        icon="server"
        iconSize={18}
        label={label}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
    </GlassCapsule>
  );
}
