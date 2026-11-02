import { t } from '@openagentspocket/i18n';
import { Stack } from 'expo-router';

export default function HostsLayout() {
  return <Stack screenOptions={{ headerShown: true, title: t('Hosts') }} />;
}
