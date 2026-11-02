import { type ComponentType, useState } from 'react';
import { OverlayHost } from '../overlay/OverlayHost';
import { Chip, ChipRow } from '../primitives/Chip';
import { Screen } from '../primitives/Screen';
import { SectionHeader } from '../primitives/SectionHeader';
import { Text } from '../primitives/Text';
import { ThemeProvider } from '../theme/theme';
import { type ThemeId, themeIds, themes } from '../theme/tokens.generated';
import { BadgesAndMarks, Buttons, TypeAndColor } from './galleryBasics';
import { Content, Lists } from './galleryContent';
import { Feedback, Overlays } from './galleryFeedback';
import { CardsAndRows, Forms } from './galleryRows';
import { Scanner } from './galleryScanner';

export interface GallerySection {
  id: string;
  title: string;
  Body: ComponentType;
}

/** Every primitive in its states, grouped. The ids are stable: deep links and Maestro use them. */
export const gallerySections: readonly GallerySection[] = [
  { id: 'type', title: 'Type & color', Body: TypeAndColor },
  { id: 'buttons', title: 'Buttons', Body: Buttons },
  { id: 'badges', title: 'Badges & marks', Body: BadgesAndMarks },
  { id: 'rows', title: 'Cards & rows', Body: CardsAndRows },
  { id: 'forms', title: 'Forms', Body: Forms },
  { id: 'feedback', title: 'Feedback', Body: Feedback },
  { id: 'overlays', title: 'Overlays', Body: Overlays },
  { id: 'content', title: 'Content', Body: Content },
  { id: 'lists', title: 'Lists', Body: Lists },
  { id: 'scanner', title: 'Scanner', Body: Scanner },
];

const isThemeId = (value: string | undefined): value is ThemeId =>
  themeIds.includes(value as ThemeId);

interface GalleryProps {
  /** A theme id from the route (`?theme=papel`); defaults to Índigo. */
  initialTheme?: string;
  /** A section id from the route (`?section=overlays`); defaults to all. */
  initialSection?: string;
}

/**
 * The component gallery: every primitive in every state, in Índigo, Papel or
 * Noche, so agents and the integrator check looks after a Metro reload instead
 * of a native rebuild. Mounts its own OverlayHost so alerts and toasts draw in
 * the chosen theme.
 */
export function Gallery({ initialTheme, initialSection }: GalleryProps) {
  const [themeId, setThemeId] = useState<ThemeId>(
    isThemeId(initialTheme) ? initialTheme : 'indigo',
  );
  const [sectionId, setSectionId] = useState<string | null>(
    gallerySections.some((section) => section.id === initialSection)
      ? (initialSection ?? null)
      : null,
  );
  const shown = gallerySections.filter((section) => sectionId === null || section.id === sectionId);
  return (
    <ThemeProvider themeId={themeId}>
      <Screen testID="gallery">
        <Text variant="title">Gallery</Text>
        <ChipRow>
          {themeIds.map((id) => (
            <Chip
              key={id}
              label={themes[id].name}
              mono={false}
              selected={id === themeId}
              onPress={() => setThemeId(id)}
              testID={`gallery-theme-${id}`}
            />
          ))}
        </ChipRow>
        <ChipRow>
          <Chip
            label="All"
            mono={false}
            selected={sectionId === null}
            onPress={() => setSectionId(null)}
            testID="gallery-section-all"
          />
          {gallerySections.map((section) => (
            <Chip
              key={section.id}
              label={section.title}
              mono={false}
              selected={section.id === sectionId}
              onPress={() => setSectionId(section.id)}
              testID={`gallery-section-${section.id}`}
            />
          ))}
        </ChipRow>
        {shown.map(({ id, title, Body }) => (
          <GalleryBlock key={id} id={id} title={title} Body={Body} />
        ))}
      </Screen>
      <OverlayHost />
    </ThemeProvider>
  );
}

function GalleryBlock({ id, title, Body }: GallerySection) {
  return (
    <>
      <SectionHeader title={title} testID={`gallery-${id}`} />
      <Body />
    </>
  );
}
