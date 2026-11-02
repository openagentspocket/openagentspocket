import { Redirect, useLocalSearchParams } from 'expo-router';
import { SshAuthHarnessScreen } from '@/dev/SshAuthHarnessScreen';
import { authHarnessParams } from '@/dev/sshAuthHarness';

/**
 * Dev-only SSH authentication harness. Open with
 * `agentico:///__ssh-auth?host=127.0.0.1&port=<sshd>&user=<user>&fport=<fixture http
 * port>&pin=<SHA256:...>[&fhost=127.0.0.1]` after starting modules/ssh/scripts/auth-fixture.py.
 */
export default function SshAuthHarnessRoute() {
  const query = useLocalSearchParams<Record<string, string>>();
  if (!__DEV__) return <Redirect href="/" />;
  return <SshAuthHarnessScreen params={authHarnessParams(query)} />;
}
