import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';

export default function ChangesLayout() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}
