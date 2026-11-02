import { useState } from 'react';
import { ActionMenuButton } from '../overlay/ActionMenu';
import { confirm } from '../overlay/confirm';
import { Sheet, type SheetDetent } from '../overlay/Sheet';
import { toast } from '../overlay/toast';
import { Banner } from '../primitives/Banner';
import { BarChart } from '../primitives/BarChart';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { EmptyState, ErrorState } from '../primitives/EmptyState';
import { Meter } from '../primitives/Meter';
import { ProgramMark } from '../primitives/ProgramMark';
import { SkeletonRows } from '../primitives/Skeleton';
import { Text } from '../primitives/Text';
import type { Tone } from '../theme/status';
import { compactNumber, sampleMonth, sampleWeek } from './galleryData';
import { Specimen, Stack, Wrap } from './galleryKit';

const TONES: Tone[] = ['info', 'success', 'warning', 'danger', 'accent'];
const noop = () => {};

export function Feedback() {
  const [dismissed, setDismissed] = useState(false);
  return (
    <>
      <Specimen name="Banner">
        <Stack>
          {TONES.map((tone) => (
            <Banner
              key={tone}
              tone={tone}
              title={`${tone} notice`}
              message="One line on what happened."
            />
          ))}
          {dismissed ? null : (
            <Banner
              tone="warning"
              title="Plugin update available"
              message="Update herdr's plugin on this Host to read Usage."
              actionLabel="Update"
              onAction={noop}
              onDismiss={() => setDismissed(true)}
            />
          )}
        </Stack>
      </Specimen>
      <Specimen name="EmptyState">
        <Card>
          <EmptyState
            layout="compact"
            title="No Agents"
            message="Start one from New Agent."
            actions={<Button kind="secondary" size="small" title="New Agent" onPress={noop} />}
          />
        </Card>
      </Specimen>
      <Specimen name="ErrorState">
        <Card>
          <ErrorState
            layout="compact"
            summary="Can't reach your Host"
            recovery="Check that it is awake and on your network."
            detail="ECONNREFUSED 22"
            onRetry={noop}
          />
        </Card>
      </Specimen>
      <Specimen name="Skeleton">
        <SkeletonRows rows={2} />
      </Specimen>
      <Specimen name="Meter">
        <Stack>
          <Text variant="caption" tone="secondary">
            32% · pace 50%
          </Text>
          <Meter value={0.32} pace={0.5} accessibilityLabel="Session limit" />
          <Text variant="caption" tone="secondary">
            86% (warning)
          </Text>
          <Meter value={0.86} pace={0.6} accessibilityLabel="Weekly limit" />
          <Text variant="caption" tone="secondary">
            97% (danger)
          </Text>
          <Meter value={0.97} accessibilityLabel="Opus limit" />
        </Stack>
      </Specimen>
      <Specimen name="BarChart">
        <Stack>
          <BarChart
            data={sampleWeek}
            highlightKey="sun"
            formatValue={compactNumber}
            accessibilityLabel="Tokens this week"
          />
          <BarChart
            data={sampleMonth}
            height={80}
            tint="info"
            formatValue={compactNumber}
            accessibilityLabel="Tokens this month"
          />
        </Stack>
      </Specimen>
    </>
  );
}

export function Overlays() {
  const [detent, setDetent] = useState<SheetDetent | null>(null);
  const answered = (answer: unknown) =>
    toast({ title: `Answer: ${String(answer)}`, tone: 'info', durationMs: 1500 });
  return (
    <>
      <Specimen name="confirm()">
        <Wrap>
          <Button
            kind="secondary"
            title="Alert"
            onPress={() =>
              confirm({
                title: 'Reconnect?',
                message: 'The session dropped.',
                confirmLabel: 'Reconnect',
              }).then(answered)
            }
          />
          <Button
            kind="destructive"
            title="Destructive"
            onPress={() =>
              confirm({
                title: 'Delete this Host?',
                message: 'Its keys stay on the Host.',
                confirmLabel: 'Delete',
                destructive: true,
              }).then(answered)
            }
          />
          <Button
            kind="secondary"
            title="Dialog"
            onPress={() =>
              confirm({
                title: 'Close the Agent?',
                actions: [
                  { key: 'close', title: 'Close', destructive: true },
                  { key: 'detach', title: 'Detach only' },
                ],
              }).then(answered)
            }
          />
          <Button
            kind="secondary"
            title="Info"
            onPress={() => confirm({ title: 'Copied', cancelLabel: null }).then(answered)}
          />
        </Wrap>
      </Specimen>
      <Specimen name="Sheet">
        <Wrap>
          {(['medium', 'large', 'fit'] as const).map((value) => (
            <Button key={value} kind="secondary" title={value} onPress={() => setDetent(value)} />
          ))}
        </Wrap>
        <Sheet
          visible={detent !== null}
          detent={detent ?? 'medium'}
          title={`Sheet (${detent ?? ''})`}
          onClose={() => setDetent(null)}
          footer={<Button title="Done" onPress={() => setDetent(null)} />}
        >
          <Text tone="secondary">
            One Sheet for every sheet: grabber, title, close, scrolling body.
          </Text>
        </Sheet>
      </Specimen>
      <Specimen name="ActionMenu">
        <Wrap>
          <ActionMenuButton
            accessibilityLabel="More"
            title="Agent"
            items={[
              { key: 'rename', title: 'Rename', icon: 'edit', onPress: () => answered('rename') },
              {
                key: 'pin',
                title: 'Pin',
                icon: 'pin',
                checked: true,
                onPress: () => answered('pin'),
              },
              { key: 'off', title: 'Unavailable', disabled: true, onPress: noop },
              {
                key: 'close',
                title: 'Close',
                icon: 'trash',
                destructive: true,
                onPress: () => answered('close'),
              },
            ]}
          />
        </Wrap>
      </Specimen>
      <Specimen name="toast() / InAppBanner">
        <Wrap>
          {TONES.map((tone) => (
            <Button
              key={tone}
              kind="secondary"
              size="small"
              title={tone}
              onPress={() =>
                toast({ title: `${tone} toast`, message: 'Disappears on its own.', tone })
              }
            />
          ))}
          <Button
            kind="secondary"
            size="small"
            title="Agent needs you"
            onPress={() =>
              toast({
                title: 'Fix flaky reconnect test',
                message: 'Claude is asking to run a command.',
                leading: (
                  <ProgramMark
                    program="claude"
                    status="blocked"
                    size={28}
                    surface="surfaceRaised"
                  />
                ),
                onPress: () => answered('open agent'),
              })
            }
          />
        </Wrap>
      </Specimen>
    </>
  );
}
