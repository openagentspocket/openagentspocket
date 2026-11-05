import { Card, Text } from '@openagentspocket/ui';
import { nativeSsh } from 'agentico-ssh';
import { useEffect, useRef, useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { type AuthHarnessParams, runSshAuthHarness } from './sshAuthHarness';
import type { StepResult } from './sshHarness';

/** Dev-only screen that runs the SSH authentication harness on open and lists every step. */
export function SshAuthHarnessScreen({ params }: { params: AuthHarnessParams | null }) {
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!params || started.current) return;
    started.current = true;
    runSshAuthHarness(nativeSsh(), params, (step) => setSteps((all) => [...all, step])).finally(
      () => setDone(true),
    );
  }, [params]);

  const passed = steps.filter((s) => s.ok).length;
  return (
    <AppScreen header={{ variant: 'native' }}>
      <Text variant="title">SSH auth harness</Text>
      {params ? null : <Text tone="danger">Open with host, port, user, fport and pin.</Text>}
      <Text variant="headline" testID="ssh-auth-summary">
        {`${passed}/${steps.length} passed${done ? ', done' : ''}`}
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
