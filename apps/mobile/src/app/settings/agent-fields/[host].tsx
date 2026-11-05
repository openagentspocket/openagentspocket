import { useLocalSearchParams } from 'expo-router';
import { AgentFieldsHostScreen } from '@/settings/agentFields/AgentFieldsHostScreen';

export default function AgentFieldsHostRoute() {
  const { host } = useLocalSearchParams<{ host: string }>();
  return <AgentFieldsHostScreen hostId={host} />;
}
