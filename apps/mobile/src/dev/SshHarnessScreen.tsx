import { Button, Card, Text } from '@openagentspocket/ui';
import { nativeSsh } from 'agentico-ssh';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { type HarnessParams, runSshHarness, type StepResult } from './sshHarness';

/** Dev-only screen that runs the SSH integration harness and lists every step. */
export function SshHarnessScreen({
  params,
  autoRun,
}: {
  params: HarnessParams | null;
  autoRun: boolean;
}) {
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    if (!params) return;
    setRunning(true);
    setSteps([]);
    await runSshHarness(nativeSsh(), params, (step) => setSteps((all) => [...all, step]));
    setRunning(false);
  }, [params]);

  useEffect(() => {
    if (autoRun && params && !started.current) {
      started.current = true;
      run();
    }
  }, [autoRun, params, run]);

  const passed = steps.filter((s) => s.ok).length;
  return (
    <AppScreen header={{ variant: 'native' }}>
      <Text variant="title">SSH harness</Text>
      {params ? (
        <Text variant="mono" tone="secondary">
          {`${params.user}@${params.host}:${params.port}`}
        </Text>
      ) : (
        <Text tone="danger">Open with host, port, user, sock, fsock and fport parameters.</Text>
      )}
      <Button title={running ? 'Running' : 'Run'} onPress={run} disabled={running || !params} />
      <Text variant="headline" testID="ssh-harness-summary">
        {`${passed}/${steps.length} passed${running ? '' : steps.length ? ', done' : ''}`}
      </Text>
      {steps.map((step) => (
        <Card key={step.name}>
          <Text variant="label" tone={step.ok ? 'accent' : 'danger'}>
            {`${step.ok ? 'PASS' : 'FAIL'}  ${step.name} (${step.ms} ms)`}
          </Text>
          <Text variant="mono" tone={step.ok ? 'secondary' : 'danger'}>
            {step.detail}
          </Text>
        </Card>
      ))}
    </AppScreen>
  );
}
