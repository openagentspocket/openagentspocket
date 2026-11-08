import { PROGRAM_KINDS } from '@openagentspocket/core';
import { View } from 'react-native';
import { Badge, StatusPill } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Chip, ChipRow } from '../primitives/Chip';
import { CopyableValueRow, CopyButton } from '../primitives/CopyButton';
import { Icon, iconNames } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { StatusDot } from '../primitives/StatusDot';
import { Text, type TextTone, type TextVariant } from '../primitives/Text';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { useTheme } from '../theme/theme';
import { colorKeys } from '../theme/tokens.generated';
import { Specimen, Stack, Wrap } from './galleryKit';

const STATUSES: Status[] = ['blocked', 'working', 'done', 'idle'];
const VARIANTS: TextVariant[] = [
  'title',
  'headline',
  'body',
  'callout',
  'caption',
  'label',
  'mono',
];
const TONES: TextTone[] = [
  'primary',
  'secondary',
  'tertiary',
  'accent',
  'danger',
  'warning',
  'success',
];
const noop = () => {};

export function TypeAndColor() {
  const theme = useTheme();
  return (
    <>
      <Specimen name="Text variants">
        <Stack>
          {VARIANTS.map((variant) => (
            <Text key={variant} variant={variant}>
              {variant}: The quick Agent jumps
            </Text>
          ))}
        </Stack>
      </Specimen>
      <Specimen name="Text tones">
        <Wrap>
          {TONES.map((tone) => (
            <Text key={tone} tone={tone}>
              {tone}
            </Text>
          ))}
        </Wrap>
      </Specimen>
      <Specimen name="Color tokens">
        <Wrap>
          {colorKeys.map((key) => (
            <View key={key} style={{ alignItems: 'center', width: 64, gap: airy.line }}>
              <View
                style={{
                  width: 40,
                  height: 28,
                  borderRadius: theme.metrics.chipRadius,
                  borderWidth: theme.metrics.hairlineWidth,
                  borderColor: theme.hairline,
                  backgroundColor: theme.colors[key],
                }}
              />
              <Text variant="caption2" tone="tertiary" numberOfLines={1}>
                {key}
              </Text>
            </View>
          ))}
        </Wrap>
      </Specimen>
      <Specimen name="Icon">
        <Wrap>
          {iconNames.map((name) => (
            <Icon key={name} name={name} size={20} color="textPrimary" />
          ))}
        </Wrap>
      </Specimen>
    </>
  );
}

export function Buttons() {
  return (
    <>
      <Specimen name="Button kinds">
        <Stack>
          <Button title="Primary" onPress={noop} />
          <Button kind="secondary" title="Secondary" icon="refresh" onPress={noop} />
          <Button kind="destructive" title="Delete Host" icon="trash" onPress={noop} />
          <Wrap>
            <Button kind="text" title="Text" onPress={noop} />
            <Button kind="capsule" size="small" title="Capsule" onPress={noop} />
            <Button kind="secondary" icon="more" accessibilityLabel="More" onPress={noop} />
            <Button kind="primary" icon="send" accessibilityLabel="Send" onPress={noop} />
          </Wrap>
        </Stack>
      </Specimen>
      <Specimen name="Button states">
        <Wrap>
          <Button title="Disabled" disabled onPress={noop} />
          <Button title="Loading" loading onPress={noop} />
          <Button kind="secondary" size="small" title="Small" onPress={noop} />
        </Wrap>
      </Specimen>
      <Specimen name="CopyButton / CopyableValueRow">
        <Card>
          <CopyableValueRow label="Pane id" value="wB:p1" />
          <CopyableValueRow label="Workspace" value="api" copyable={false} />
          <Wrap>
            <CopyButton value="herdr attach p1" />
            <CopyButton value="herdr attach p1" title="Copy Command" />
          </Wrap>
        </Card>
      </Specimen>
    </>
  );
}

export function BadgesAndMarks() {
  return (
    <>
      <Specimen name="Badge">
        <Wrap>
          <Badge label="new" />
          <Badge label="12" kind="control" />
          <Badge label="beta" kind="outline" />
        </Wrap>
      </Specimen>
      <Specimen name="StatusPill / StatusDot">
        <Wrap>
          {STATUSES.map((status) => (
            <StatusPill key={status} status={status} label={status} />
          ))}
          {STATUSES.map((status) => (
            <StatusDot key={status} status={status} />
          ))}
        </Wrap>
      </Specimen>
      <Specimen name="Chip / ChipRow">
        <ChipRow>
          <Chip label="api" icon="folder" />
          <Chip label="opus-5-5" icon="model" />
          <Chip label="your-host" icon="server" />
          <Chip label="Blocked" mono={false} selected onPress={noop} />
          <Chip label="Working" mono={false} onPress={noop} />
        </ChipRow>
      </Specimen>
      <Specimen name="ProgramMark">
        <Wrap>
          {STATUSES.map((status) => (
            <ProgramMark key={status} program="claude" status={status} size={24} />
          ))}
          <ProgramMark program="codex" size={32} status="working" />
          <ProgramMark program="zsh" size={20} />
        </Wrap>
        <Wrap>
          {PROGRAM_KINDS.map((info) => (
            <ProgramMark key={info.kind} program={info.kind} size={28} status="done" />
          ))}
        </Wrap>
      </Specimen>
    </>
  );
}
