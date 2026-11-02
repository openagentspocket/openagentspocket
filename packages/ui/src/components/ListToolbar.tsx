import { View } from 'react-native';
import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { GlassCapsule } from '../primitives/GlassCapsule';
import type { IconName } from '../primitives/Icon';
import { makeStyles } from '../theme/theme';

/** How the agents list is grouped; the toolbar icon follows it. */
export type ListPresentation = 'flat' | 'host' | 'status' | 'workspace';

export const PRESENTATION_ICON: Record<ListPresentation, IconName> = {
  flat: 'list',
  host: 'server',
  status: 'statusWorking',
  workspace: 'folder',
};

/** Glyphs fill about 60 percent of the 44 pt control, as in Swift. */
const TOOLBAR_ICON = 26;

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.xs,
  },
  circle: {
    width: t.metrics.minTapSize,
    height: t.metrics.minTapSize,
    justifyContent: 'center',
  },
  capsule: { height: t.metrics.minTapSize, paddingHorizontal: t.spacing.xxs, gap: t.spacing.xxs },
}));

interface ListToolbarProps {
  presentation: ListPresentation;
  presentationItems: readonly ActionMenuItem[];
  hostItems: readonly ActionMenuItem[];
  onHome: () => void;
  onNew: () => void;
  labels?: { home: string; host: string; presentation: string; new: string };
  testID?: string;
}

const DEFAULT_LABELS = {
  home: 'Home',
  host: 'Host filter',
  presentation: 'Presentation',
  new: 'New Agent',
};

/** Home in its own glass circle at left; Host filter, Presentation and New in one capsule at right. */
export function ListToolbar({
  presentation,
  presentationItems,
  hostItems,
  onHome,
  onNew,
  labels = DEFAULT_LABELS,
  testID = 'list-toolbar',
}: ListToolbarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar} testID={testID}>
      <GlassCapsule style={styles.circle} testID={`${testID}-home-capsule`}>
        <Button
          kind="text"
          icon="home"
          iconSize={TOOLBAR_ICON}
          accessibilityLabel={labels.home}
          onPress={onHome}
          testID={`${testID}-home`}
        />
      </GlassCapsule>
      <GlassCapsule style={styles.capsule} testID={`${testID}-capsule`}>
        <ActionMenuButton
          items={hostItems}
          icon="filter"
          iconSize={TOOLBAR_ICON}
          accessibilityLabel={labels.host}
          testID={`${testID}-host`}
        />
        <ActionMenuButton
          items={presentationItems}
          icon={PRESENTATION_ICON[presentation]}
          iconSize={TOOLBAR_ICON}
          accessibilityLabel={labels.presentation}
          testID={`${testID}-presentation`}
        />
        <Button
          kind="text"
          icon="add"
          iconSize={TOOLBAR_ICON}
          accessibilityLabel={labels.new}
          onPress={onNew}
          testID={`${testID}-new`}
        />
      </GlassCapsule>
    </View>
  );
}
