import { DirectoryBrowser, type DirectoryLister, RemoteHostPath } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Icon,
  ListRow,
  makeStyles,
  Section,
  Sheet,
  SkeletonRows,
  TextField,
  useStoreState,
} from '@openagentspocket/ui';
import { type ReactNode, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { browserErrorText } from './text';

const useStyles = makeStyles((t) => ({
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: t.spacing.md,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.control,
  },
  filterInput: { flex: 1 },
}));

interface DirectoryBrowserSheetProps {
  visible: boolean;
  lister: DirectoryLister;
  /** The folder the user chose; the owner closes the sheet. */
  onSelect: (path: string) => void;
  onClose: () => void;
}

/** console.directory-browser: walks a Host's folders one level at a time to pick a directory. */
export function DirectoryBrowserSheet({
  visible,
  lister,
  onSelect,
  onClose,
}: DirectoryBrowserSheetProps) {
  // A fresh browser per opening, so a late answer never lands on an older visit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `visible` starts a new visit
  const browser = useMemo(() => new DirectoryBrowser(lister), [lister, visible]);
  const state = useStoreState(browser);
  useEffect(() => {
    if (!visible) return;
    void browser.start();
    return () => browser.cancel();
  }, [browser, visible]);

  const { currentPath, isLoading, error, filter } = state;
  const shown = browser.visibleDirectories;
  let list: ReactNode;
  if (currentPath === undefined && error) {
    list = null;
  } else if (currentPath === undefined) {
    list = <SkeletonRows accessibilityLabel={t('Loading folders…')} />;
  } else if (shown.length === 0 && filter === '') {
    list = (
      <EmptyState
        icon="folder"
        title={state.truncated ? t('No Loaded Folders') : t('No Subfolders')}
        message={t('You can select this folder for the new Workspace.')}
        layout="compact"
      />
    );
  } else if (shown.length === 0) {
    list = (
      <EmptyState
        icon="search"
        title={t('No Matching Folders')}
        message={t('No loaded folders match “%@”.', filter)}
        actions={
          <Button kind="text" title={t('Clear Filter')} onPress={() => browser.setFilter('')} />
        }
        layout="compact"
      />
    );
  } else {
    list = (
      <Section title={t('Folders')} testID="directory-list">
        {shown.map((name) => (
          <ListRow
            key={name}
            title={name}
            leading={<Icon name="folder" color="textSecondary" />}
            trailing={
              browser.isSymbolicLink(name) ? (
                <Icon name="share" color="textTertiary" accessibilityLabel={t('Symbolic link')} />
              ) : undefined
            }
            chevron
            onPress={() => void browser.enter(name)}
            testID={`directory-${name}`}
          />
        ))}
      </Section>
    );
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Browse Directories')}
      detent="large"
      closeLabel={t('Cancel')}
      trailing={{
        label: t('Select'),
        disabled: currentPath === undefined,
        onPress: () => currentPath !== undefined && onSelect(currentPath),
        testID: 'directory-select',
      }}
      testID="directory-browser"
    >
      <FilterField
        value={filter}
        onChange={(text) => browser.setFilter(text)}
        hidden={currentPath === undefined}
      />
      <Section
        footer={
          currentPath === undefined
            ? undefined
            : t('You can select this folder for the new Workspace.')
        }
      >
        <ListRow
          title={
            currentPath ? RemoteHostPath.lastComponent(currentPath) || '/' : t('Loading folders…')
          }
          subtitle={currentPath}
          subtitleMono
          titleSemibold
          trailing={<Icon name="arrowUp" color="accent" />}
          accessibilityLabel={t('Parent folder')}
          disabled={!browser.canGoBack || isLoading}
          onPress={() => void browser.goBack()}
          testID="directory-back"
        />
      </Section>
      {error ? (
        <Banner
          tone="danger"
          title={t("Couldn't Load Folders")}
          message={browserErrorText(error)}
          actionLabel={t('Try Again')}
          onAction={() => void browser.retry()}
          testID="directory-error"
        />
      ) : null}
      {state.truncated && currentPath !== undefined ? (
        <Banner
          tone="warning"
          title={t(
            'Only part of this folder is available. Filtering searches the loaded folders only.',
          )}
        />
      ) : null}
      {list}
    </Sheet>
  );
}

/** The pill search field of the sheet: a magnifier and the placeholder "Filter folders". */
function FilterField({
  value,
  onChange,
  hidden,
}: {
  value: string;
  onChange: (text: string) => void;
  hidden: boolean;
}) {
  const styles = useStyles();
  if (hidden) return null;
  return (
    <View style={styles.filter}>
      <Icon name="search" color="textSecondary" />
      <View style={styles.filterInput}>
        <TextField
          inline
          label={t('Filter folders')}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          testID="directory-filter"
        />
      </View>
    </View>
  );
}
