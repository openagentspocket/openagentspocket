import { DirectoryBrowser, type DirectoryLister } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Icon,
  ListRow,
  Section,
  Sheet,
  SkeletonRows,
  Text,
  TextField,
} from '@openagentspocket/ui';
import { type ReactNode, useEffect, useMemo } from 'react';
import { useStoreState } from '@/changes/useStoreState';
import { browserErrorText } from './text';

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
      footer={
        <Button
          title={t('Select')}
          accessibilityLabel={t('Select folder')}
          disabled={currentPath === undefined}
          onPress={() => currentPath !== undefined && onSelect(currentPath)}
          testID="directory-select"
        />
      }
      testID="directory-browser"
    >
      <Button
        kind="secondary"
        icon="arrowUp"
        title={currentPath ?? t('Loading folders…')}
        accessibilityLabel={t('Parent folder')}
        disabled={!browser.canGoBack || isLoading}
        onPress={() => void browser.goBack()}
        testID="directory-back"
      />
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
      {currentPath !== undefined ? (
        <>
          <Text variant="caption" tone="secondary">
            {t('You can select this folder for the new Workspace.')}
          </Text>
          <TextField
            label={t('Filter folders')}
            value={filter}
            onChangeText={(text) => browser.setFilter(text)}
            autoCapitalize="none"
            autoCorrect={false}
            testID="directory-filter"
          />
          {state.truncated ? (
            <Banner
              tone="warning"
              title={t(
                'Only part of this folder is available. Filtering searches the loaded folders only.',
              )}
            />
          ) : null}
        </>
      ) : null}
      {list}
    </Sheet>
  );
}
