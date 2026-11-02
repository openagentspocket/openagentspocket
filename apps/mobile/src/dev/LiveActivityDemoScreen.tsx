import { Button, Card, Screen, Text } from '@openagentspocket/ui';
import { appGroup } from 'agentico-app-group';
import { liveActivityController } from 'agentico-live-activity';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type DemoStep, runDemoStep } from './liveActivityDemo';

/** Dev-only: drives the real ActivityKit module with demo Agents. `?step=start|update|end` runs one on open. */
export function LiveActivityDemoScreen({ autoStep }: { autoStep: DemoStep | null }) {
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const ran = useRef(false);

  const run = useCallback(async (step: DemoStep) => {
    let outcome: string;
    try {
      outcome = await runDemoStep(step, liveActivityController(), appGroup());
    } catch (thrown) {
      outcome = `failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`;
    }
    setLog((lines) => [...lines, { id: lines.length, text: `${step}: ${outcome}` }]);
  }, []);

  useEffect(() => {
    if (autoStep && !ran.current) {
      ran.current = true;
      run(autoStep);
    }
  }, [autoStep, run]);

  return (
    <Screen>
      <Text variant="title">Live Activity demo</Text>
      <Button title="Start" onPress={() => run('start')} />
      <Button title="Update" onPress={() => run('update')} />
      <Button title="End" onPress={() => run('end')} />
      <Card>
        {log.map((line) => (
          <Text key={line.id} variant="mono" testID="live-activity-log">
            {line.text}
          </Text>
        ))}
      </Card>
    </Screen>
  );
}
