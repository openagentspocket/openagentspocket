import { ComponentCapture } from '@openagentspocket/ui';
import { useLocalSearchParams } from 'expo-router';

/**
 * `/__gallery/components/<Name>[.<variant>]?theme=papel`: one catalog component alone at the Swift
 * atlas width, captured by scripts/ux-components.mjs next to its reference crop.
 */
export default function GalleryComponentRoute() {
  const { name, theme } = useLocalSearchParams<{ name: string; theme?: string }>();
  return <ComponentCapture name={name} theme={theme} />;
}
