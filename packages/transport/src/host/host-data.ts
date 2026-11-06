import type { SshTransport } from '../transport';
import { runBoundedScript } from './bounded-script';

const DEADLINE_MS = 10_000;
const REMOTE_SECONDS = 5;

/** `HostDataStore.run` over a Transport: one bounded script, its stdout, a non-zero exit throws. */
export async function runHostDataScript(
  transport: SshTransport,
  feature: string,
  script: string,
): Promise<string> {
  const result = await runBoundedScript(transport, script, {
    feature,
    deadlineMs: DEADLINE_MS,
    remoteSeconds: REMOTE_SECONDS,
    timeoutMarkerPrefix: '__oap_host_data_',
    timedOut: { kind: 'channelFailed', detail: `${feature} took too long` },
  });
  if (result.exitCode !== 0) throw new Error(`${feature} exited ${result.exitCode}`);
  return result.stdout;
}
