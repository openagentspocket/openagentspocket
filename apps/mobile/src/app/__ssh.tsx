import { Redirect, useLocalSearchParams } from 'expo-router';
import { SshHarnessScreen } from '@/dev/SshHarnessScreen';
import { harnessParams } from '@/dev/sshHarness';

/**
 * Dev-only SSH integration harness. Open with
 * `agentico:///__ssh?host=127.0.0.1&port=<sshd>&user=<user>&sock=<herdr socket>&fsock=<fixture
 * socket>&fport=<fixture http port>&pin=<SHA256:...>&auto=1`.
 */
export default function SshHarnessRoute() {
  const query = useLocalSearchParams<Record<string, string>>();
  if (!__DEV__) return <Redirect href="/" />;
  return <SshHarnessScreen params={harnessParams(query)} autoRun={query.auto === '1'} />;
}
