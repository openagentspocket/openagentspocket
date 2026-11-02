import {
  type Host,
  hostTrustKey,
  type PluginStatus,
  type PreflightReport,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { askToTrust } from '@/connections/trustPrompt';
import type { ProbeOutcome } from './HostProbe';
import { hostsRuntime, policyFor } from './hostsRuntime';

export interface ChecksState {
  readonly running: boolean;
  readonly report: PreflightReport | null;
  readonly routeInUse: string | null;
  readonly changedKey: ProbeOutcome['changedKey'];
  /** What herdr says about the Agentico plugin once the checks passed. */
  readonly plugin: PluginStatus;
}

const IDLE: ChecksState = {
  running: false,
  report: null,
  routeInUse: null,
  changedKey: null,
  plugin: { kind: 'checking' },
};

/** Runs and tracks the preflight of one Host, with the TOFU and changed-key prompts. */
export function useHostChecks(host: Host | null) {
  const [state, setState] = useState<ChecksState>(IDLE);
  const generation = useRef(0);
  const hostId = host?.id;

  const run = useCallback(async () => {
    const { model, probe, trustTimeoutMs, confirmFirstConnect } = hostsRuntime();
    const current = hostId ? model.find(hostId) : null;
    if (!current) return;
    const mine = ++generation.current;
    model.setConnection(current.id, 'connecting');
    setState({ ...IDLE, running: true });
    const policy = policyFor(
      model,
      confirmFirstConnect ?? ((candidate) => askToTrust(candidate, trustTimeoutMs)),
    );
    const outcome = await probe.run(current, policy);
    if (mine !== generation.current) return;
    model.setConnection(current.id, outcome.report.failure ? 'cantConnect' : 'connected');
    model.setLatency(current.id, outcome.report.failure ? null : (outcome.latencyMs ?? null));
    setState({
      running: false,
      report: outcome.report,
      routeInUse: outcome.routeInUse,
      changedKey: outcome.changedKey,
      plugin: outcome.plugin ?? { kind: 'unavailable' },
    });
    if (!outcome.report.failure) void hostsRuntime().reconnect?.(current.id);
  }, [hostId]);

  const cancel = useCallback(() => {
    generation.current += 1;
    if (hostId) hostsRuntime().model.setConnection(hostId, 'notConnected');
    setState(IDLE);
  }, [hostId]);

  /** Pins the key the Host presents now, after a confirmation, and checks again. */
  const trustNewKey = useCallback(async () => {
    const { model } = hostsRuntime();
    const changed = state.changedKey;
    if (!hostId || !changed) return;
    const sure = await confirm({
      title: t('Replace the trusted Host key?'),
      message: t(
        'Compare the new key with what the command prints on the Host first. A changed key can indicate a reinstalled Host or an attack.',
      ),
      confirmLabel: t('Trust New Key'),
      destructive: true,
    });
    if (!sure) return;
    const key = hostTrustKey(hostId);
    model.knownHosts.forgetFingerprints(key.host, key.port);
    model.knownHosts.setFingerprint(changed.presented, key.host, key.port);
    await run();
  }, [hostId, state.changedKey, run]);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  return { state, run, cancel, trustNewKey };
}
