import { Redirect, useLocalSearchParams } from 'expo-router';
import { harnessParams } from '@/dev/sshHarness';
import { TerminalSpikeScreen } from '@/dev/terminal/TerminalSpikeScreen';

/** Dev-only terminal renderer spike; same query as `__ssh` plus `renderer=ghostty|xterm`. */
export default function TerminalSpikeRoute() {
  const query = useLocalSearchParams<Record<string, string>>();
  const params = harnessParams(query);
  if (!__DEV__ || !params) return <Redirect href="/" />;
  const renderer = query.renderer === 'xterm' ? 'xterm' : 'ghostty';
  return <TerminalSpikeScreen params={params} renderer={renderer} autoRun={query.auto === '1'} />;
}
