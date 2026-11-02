import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../primitives/EmptyState';
import { Screen } from '../primitives/Screen';
import { SectionHeader } from '../primitives/SectionHeader';
import { Text } from '../primitives/Text';
import { makeStyles, ThemeProvider } from '../theme/theme';
import type { ThemeId } from '../theme/tokens.generated';
import { componentCatalog, findCatalogEntry } from './components/registry';

/** The two skins every catalog component must hold in. */
const SKINS: readonly ThemeId[] = ['indigo', 'papel'];
/** The Swift atlas width, so a capture is comparable with its crop. */
export const CAPTURE_WIDTH = 402;

const useStageStyles = makeStyles((t) => ({
  stage: {
    width: '100%',
    maxWidth: CAPTURE_WIDTH,
    backgroundColor: t.colors.canvas,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingVertical: t.spacing.md,
    overflow: 'hidden',
  },
  bleed: { marginHorizontal: -t.metrics.screenInset, width: CAPTURE_WIDTH },
}));

function Stage({
  children,
  testID,
  bleed,
}: {
  children: ReactNode;
  testID?: string;
  /** Cancels the Screen inset so the stage is the full 402pt of a Swift atlas crop. */
  bleed?: boolean;
}) {
  const styles = useStageStyles();
  return (
    <View style={[styles.stage, bleed && styles.bleed]} testID={testID}>
      {children}
    </View>
  );
}

/** `/__gallery?section=components`: every implemented catalog component, each variant in Índigo then Papel. */
export function ComponentsSection() {
  if (componentCatalog.length === 0)
    return (
      <EmptyState
        layout="compact"
        icon="info"
        title="No catalog components yet"
        message="The UX3 tasks register theirs in gallery/components/<group>.tsx."
      />
    );
  return (
    <>
      {componentCatalog.map((entry) => (
        <View key={entry.name} testID={`catalog-${entry.name}`}>
          <SectionHeader title={entry.name} />
          {entry.variants.map((variant) => (
            <View key={variant.id}>
              <Text variant="caption" tone="secondary">{`${entry.name}.${variant.id}`}</Text>
              {SKINS.map((skin) => (
                <ThemeProvider key={skin} themeId={skin}>
                  <Stage testID={`catalog-${entry.name}-${variant.id}-${skin}`}>
                    {variant.render()}
                  </Stage>
                </ThemeProvider>
              ))}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

interface ComponentCaptureProps {
  /** `Name` or `Name.variant`, from the route `/__gallery/components/<name>`. */
  name: string;
  theme?: string;
}

/** One catalog component alone at the atlas width on the canvas, for scripts/ux-components.mjs. */
export function ComponentCapture({ name, theme }: ComponentCaptureProps) {
  const [entryName = '', variantId = 'default'] = name.split('.');
  const variant = findCatalogEntry(entryName)?.variants.find(
    (candidate) => candidate.id === variantId,
  );
  const themeId: ThemeId = theme === 'papel' || theme === 'noche' ? theme : 'indigo';
  return (
    <ThemeProvider themeId={themeId}>
      <Screen>
        <Stage testID={`capture-${name}`} bleed>
          {variant ? (
            variant.render()
          ) : (
            <EmptyState layout="compact" icon="info" title={`No catalog component ${name}`} />
          )}
        </Stage>
      </Screen>
    </ThemeProvider>
  );
}
