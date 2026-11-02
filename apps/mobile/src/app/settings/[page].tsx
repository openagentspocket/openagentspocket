import { useLocalSearchParams } from 'expo-router';
import { SettingsScreen } from '@/settings/SettingsScreen';

export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return <SettingsScreen page={page} />;
}
