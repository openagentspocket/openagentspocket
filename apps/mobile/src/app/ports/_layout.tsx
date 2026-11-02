import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';

export default function PortsLayout() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}
