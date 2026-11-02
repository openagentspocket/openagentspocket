import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  column: {
    width: 330,
    flex: 1,
    margin: t.spacing.xs,
    borderRadius: 24,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.sm,
  },
  titleMenu: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
    marginHorizontal: t.spacing.md,
    marginTop: t.spacing.sm,
    paddingHorizontal: t.spacing.sm,
    borderRadius: 999,
    backgroundColor: t.colors.control,
  },
  input: { flex: 1, color: t.colors.textPrimary, fontSize: 17, paddingVertical: 0 },
  list: { flex: 1, paddingTop: t.spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.xs,
    paddingBottom: t.spacing.xs,
  },
  footerGroup: { flexDirection: 'row', alignItems: 'center' },
}));

export interface SidebarFooterAction {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}

interface SidebarColumnProps {
  /** Current mode title ("Agents"); the menu switches modes. */
  title: string;
  titleItems: readonly ActionMenuItem[];
  titleLabel?: string;
  onNew: () => void;
  onHide: () => void;
  search: string;
  onSearchChange: (text: string) => void;
  searchPlaceholder?: string;
  /** Left footer actions (Hosts, Settings). */
  footerStart: readonly SidebarFooterAction[];
  /** Right footer menus (Host filter, Presentation). */
  footerEnd: readonly {
    key: string;
    icon: IconName;
    label: string;
    items: readonly ActionMenuItem[];
  }[];
  labels?: { new: string; hide: string };
  children: ReactNode;
  testID?: string;
}

/** The iPad sidebar: a floating rounded column with title menu, search pill, list and footer actions. */
export function SidebarColumn({
  title,
  titleItems,
  titleLabel = title,
  onNew,
  onHide,
  search,
  onSearchChange,
  searchPlaceholder = 'Search',
  footerStart,
  footerEnd,
  labels = { new: 'New', hide: 'Hide Sidebar' },
  children,
  testID = 'sidebar-column',
}: SidebarColumnProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.column} testID={testID}>
      <View style={styles.header}>
        <View style={styles.titleMenu}>
          <Text variant="title2" accessibilityRole="header">
            {title}
          </Text>
          <ActionMenuButton
            items={titleItems}
            icon="chevronDown"
            accessibilityLabel={titleLabel}
            testID={`${testID}-title-menu`}
          />
        </View>
        <Button
          kind="text"
          icon="add"
          accessibilityLabel={labels.new}
          onPress={onNew}
          testID={`${testID}-new`}
        />
        <Button
          kind="text"
          icon="sidebar"
          accessibilityLabel={labels.hide}
          onPress={onHide}
          testID={`${testID}-hide`}
        />
      </View>
      <View style={styles.search}>
        <Icon name="search" size={18} />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={theme.colors.textSecondary}
          accessibilityLabel={searchPlaceholder}
          style={styles.input}
          testID={`${testID}-search`}
        />
      </View>
      <View style={styles.list}>{children}</View>
      <View style={styles.footer}>
        <View style={styles.footerGroup}>
          {footerStart.map((action) => (
            <Button
              key={action.key}
              kind="text"
              icon={action.icon}
              accessibilityLabel={action.label}
              onPress={action.onPress}
              testID={`${testID}-footer-${action.key}`}
            />
          ))}
        </View>
        <View style={styles.footerGroup}>
          {footerEnd.map((menu) => (
            <ActionMenuButton
              key={menu.key}
              items={menu.items}
              icon={menu.icon}
              accessibilityLabel={menu.label}
              testID={`${testID}-footer-${menu.key}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
