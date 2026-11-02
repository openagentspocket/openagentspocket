import { useLocalSearchParams } from 'expo-router';
import { UsageScreen } from '@/usage/UsageScreen';

/** `/usage[?host=<id>]`: the dashboard, scoped to one Host when the link names it. */
export default function Usage() {
  const { host } = useLocalSearchParams<{ host?: string }>();
  return <UsageScreen key={host ?? 'all'} initial={host ? { host } : undefined} />;
}
