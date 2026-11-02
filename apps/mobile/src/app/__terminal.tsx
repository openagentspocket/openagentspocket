import { Redirect, useLocalSearchParams } from 'expo-router';
import { harnessParams } from '@/dev/sshHarness';
import { TerminalSpikeScreen } from '@/dev/terminal/TerminalSpikeScreen';

/** Dev-only terminal renderer spike (libghostty); same query as `__ssh`. */
export default function TerminalSpikeRoute() {
  const query = useLocalSearchParams<Record<string, string>>();
  const params = harnessParams(query);
  if (!__DEV__ || !params) return <Redirect href="/" />;
  return <TerminalSpikeScreen params={params} autoRun={query.auto === '1'} />;
}
