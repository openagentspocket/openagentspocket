import { t } from '@openagentspocket/i18n';
import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/useStackScreenOptions';

export default function HostsLayout() {
  return <Stack screenOptions={{ ...useStackScreenOptions(), title: t('Hosts') }} />;
}
