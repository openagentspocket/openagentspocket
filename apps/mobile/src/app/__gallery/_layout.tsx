import { Stack } from 'expo-router';

/** `/__gallery` (dev only): the primitives gallery and `/__gallery/components/<name>` captures. */
export default function GalleryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
