import { Redirect, Stack } from 'expo-router';

/** `/__gallery` (dev only): the primitives gallery and `/__gallery/components/<name>` captures. */
export default function GalleryLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
