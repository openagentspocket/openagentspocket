import { Screen, Section } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { SettingsRowView } from './SettingsRowView';
import { SETTINGS_PAGES, type SettingsContext, type SettingsRow } from './schema';
import { useSettingsContext } from './useSettingsContext';

const shown = (row: SettingsRow, ctx: SettingsContext) => !row.when || row.when(ctx);

/** Renders any settings page from the declarative schema: sections, footers, rows by kind. */
export function SettingsScreen({ page: pageId = 'root' }: { page?: string }) {
  const ctx = useSettingsContext();
  const page = SETTINGS_PAGES[pageId] ?? SETTINGS_PAGES.root;
  if (!page) return null;
  return (
    <Screen edges={['bottom', 'left', 'right']} testID={`settings-${page.id}`}>
      <Stack.Screen options={{ title: page.title(ctx), headerShown: true }} />
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
            testID={`settings-section-${section.id}`}
          >
            {rendered.map((row) => (
              <SettingsRowView key={row.id} row={row} ctx={ctx} />
            ))}
          </Section>
        );
      })}
    </Screen>
  );
}
