import { Gallery } from '@openagentspocket/ui';
import { useLocalSearchParams } from 'expo-router';

/**
 * The component gallery (`/__gallery?theme=papel&section=overlays`): every
 * primitive of packages/ui in every state. For agents and the integrator to
 * check looks after a Metro reload; not linked from the app's UI.
 */
export default function GalleryRoute() {
  const { theme, section } = useLocalSearchParams<{ theme?: string; section?: string }>();
  return <Gallery initialTheme={theme} initialSection={section} />;
}
