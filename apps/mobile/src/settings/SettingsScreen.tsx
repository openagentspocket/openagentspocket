import { t } from '@openagentspocket/i18n';
import { type ScreenHeader, Section } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { AppScreen } from '@/navigation/AppScreen';
import { SettingsRowView } from './SettingsRowView';
import { SETTINGS_PAGES, type SettingsContext, type SettingsRow } from './schema';
import { useSettingsContext } from './useSettingsContext';

const shown = (row: SettingsRow, ctx: SettingsContext) => !row.when || row.when(ctx);

/**
 * Renders any settings page from the declarative schema: sections, footers, rows by kind. The root
 * page is the sheet's first screen (Done capsule and a large title); the others push inside it with
 * the native header and back button.
 */
export function SettingsScreen({ page: pageId = 'root' }: { page?: string }) {
  const ctx = useSettingsContext();
  const router = useRouter();
  const page = SETTINGS_PAGES[pageId] ?? SETTINGS_PAGES.root;
  if (!page) return null;
  const title = page.title(ctx);
  // The root page is the sheet's first screen (Done and a large title); the others push inside it.
  const header: ScreenHeader =
    page.id === 'root'
      ? {
          variant: 'sheet',
          title,
          large: true,
          testID: 'settings-header',
          leading: { label: t('Done'), onPress: () => router.dismiss(), testID: 'settings-done' },
        }
      : { variant: 'native', title };
  return (
    <AppScreen header={header} testID={`settings-${page.id}`}>
      {page.sections.map((section) => {
        const rows = section.rows.filter((row) => shown(row, ctx));
        // A section whose rows are all hidden (routes not built yet, no lock hardware) disappears.
        const rendered = rows.filter((row) => row.kind !== 'route' || row.route);
        if (rendered.length === 0) return null;
        return (
          <Section
            key={section.id}
            title={section.title?.(ctx)}
            footer={section.footer?.(ctx)}
            grouped={!section.loose}
            iconInset={rendered.some((row) => row.icon)}
            testID={`settings-section-${section.id}`}
          >
            {rendered.map((row) => (
              <SettingsRowView key={row.id} row={row} ctx={ctx} />
            ))}
          </Section>
        );
      })}
    </AppScreen>
  );
}
