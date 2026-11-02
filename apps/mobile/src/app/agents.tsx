import { t } from '@openagentspocket/i18n';
import { Stack } from 'expo-router';
import { AgentsScreen } from '@/features/agents/AgentsScreen';

export default function Agents() {
  return (
    <>
      <Stack.Screen options={{ title: t('Agents') }} />
      <AgentsScreen />
    </>
  );
}
