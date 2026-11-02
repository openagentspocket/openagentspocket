import { useState } from 'react';
import { View } from 'react-native';
import { AgentListFieldsEditor } from '../../components/AgentListFieldsEditor';
import { AgentListFieldsPreview } from '../../components/AgentListFieldsPreview';
import {
  type OverlayPeer,
  type OverlayPeerMode,
  OverlayPeerPickerBody,
} from '../../components/OverlayPeerPicker';
import { OverlayPeerViews } from '../../components/OverlayPeerViews';
import { PortPreview } from '../../components/PortPreview';
import {
  type TerminalThemeOption,
  TerminalThemePicker,
} from '../../components/TerminalThemePicker';
import { type TerminalPalette, TerminalThemePreview } from '../../components/TerminalThemePreview';
import { Text } from '../../primitives/Text';
import { type Theme, useTheme } from '../../theme/theme';
import type { CatalogEntry } from './types';

const noop = () => undefined;

/** Demo palettes are drawn from the app tokens: the gallery has no color literals. */
function palettes(theme: Theme): TerminalPalette[] {
  const c = theme.colors;
  return [
    {
      background: c.canvas,
      foreground: c.textPrimary,
      accent: c.accent,
      success: c.success,
      directory: c.info,
      prompt: c.warning,
      muted: c.textSecondary,
    },
    {
      background: c.surfaceRaised,
      foreground: c.textPrimary,
      accent: c.danger,
      success: c.success,
      directory: c.accent,
      prompt: c.accent,
      muted: c.textTertiary,
    },
  ];
}

function PreviewDemo() {
  const theme = useTheme();
  return <TerminalThemePreview palette={palettes(theme)[0] as TerminalPalette} />;
}

function PickerDemo() {
  const theme = useTheme();
  const [selected, setSelected] = useState('vesper');
  const [a, b] = palettes(theme) as [TerminalPalette, TerminalPalette];
  const swatch = (p: TerminalPalette) => ({
    background: p.background,
    bars: [p.accent, p.foreground, p.success] as const,
  });
  const themes: TerminalThemeOption[] = [
    ['default', 'Default', 'Alabaster in Light Mode, Afterglow in Dark Mode', a],
    ['vesper', 'Vesper', 'A warm, low-contrast dark theme', b],
    ['apple', 'Apple System Colors', "Apple's terminal palette for each appearance", a],
    ['dracula', 'Dracula', 'The classic high-contrast dark palette', b],
  ].map(([id, name, subtitle, p]) => ({
    id: id as string,
    name: name as string,
    subtitle: subtitle as string,
    swatch: swatch(p as TerminalPalette),
  }));
  const current = selected === 'vesper' || selected === 'dracula' ? b : a;
  return (
    <View style={{ paddingHorizontal: theme.metrics.screenInset }}>
      <TerminalThemePicker
        themes={themes}
        selectedId={selected}
        onSelect={setSelected}
        preview={<TerminalThemePreview palette={current} />}
        footnote="Changes apply instantly to current and future Attach terminals without reconnecting."
      />
    </View>
  );
}

function EditorDemo() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.metrics.screenInset }}>
      <AgentListFieldsEditor
        host="Studio Mac"
        rows={[
          { id: 'r1', title: 'Row 1', fields: ['workspace'] },
          { id: 'r2', title: 'Row 2', fields: ['terminal_title_stripped'] },
          { id: 'r3', title: 'Row 3', fields: ['directory'] },
        ]}
        preview={<AgentListFieldsPreview hostName="Studio Mac" />}
        labels={{ subtitle: 'Following herdr plugin' }}
        onEdit={noop}
        onAdd={noop}
        onSync={noop}
        onReset={noop}
      />
    </View>
  );
}

function PreviewOnlyDemo() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.metrics.screenInset }}>
      <AgentListFieldsPreview hostName="Studio Mac" />
    </View>
  );
}

const peers: OverlayPeer[] = [
  {
    id: 'a',
    name: 'build-server',
    ip: '100.101.102.12',
    machineName: 'build-server.tailnet',
    reachability: 'Relayed · 46 ms',
  },
  {
    id: 'b',
    name: 'studio-mac',
    ip: '100.101.102.11',
    machineName: 'studio-mac.tailnet',
    reachability: 'Direct · 14 ms',
    chosen: true,
  },
  {
    id: 'c',
    name: 'media-nas',
    ip: '100.101.102.13',
    machineName: 'media-nas.tailnet',
    reachability: 'Offline',
    offline: true,
  },
];

function PeerPickerDemo() {
  const theme = useTheme();
  const [mode, setMode] = useState<OverlayPeerMode>('ip');
  return (
    <View style={{ paddingHorizontal: theme.metrics.screenInset }}>
      <OverlayPeerPickerBody peers={peers} mode={mode} onModeChange={setMode} onPick={noop} />
    </View>
  );
}

function PeerViewsDemo() {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.metrics.screenInset, gap: theme.spacing.md }}>
      <OverlayPeerViews
        name="build-server"
        online
        address="100.101.102.12"
        reachability="Relayed · 46 ms"
        network="Network home"
      />
      <OverlayPeerViews
        name="media-nas"
        online={false}
        offline
        address="100.101.102.13"
        reachability="Offline"
      />
      <OverlayPeerViews name="unknown" reachability="Direct" />
    </View>
  );
}

function PortDemo({ state }: { state: 'ready' | 'error' | 'opening' | 'paused' }) {
  return (
    <View style={{ height: 420 }}>
      <PortPreview
        title="devbox:5173"
        state={state}
        progress={state === 'ready' ? 0.6 : undefined}
        error={{ title: 'Could not open the port', message: 'Nothing is listening on port 5173.' }}
        canGoBack
        onReload={noop}
        onShare={noop}
        onRetry={noop}
      >
        <Text tone="secondary">Page</Text>
      </PortPreview>
    </View>
  );
}

/** Demos of the UX3 group 'settingsPickers' (owned by its UX3 task): one entry per component, one variant per catalog variant id. */
export const settingsPickersEntries: readonly CatalogEntry[] = [
  { name: 'TerminalThemePicker', variants: [{ id: 'default', render: () => <PickerDemo /> }] },
  { name: 'TerminalThemePreview', variants: [{ id: 'default', render: () => <PreviewDemo /> }] },
  { name: 'AgentListFieldsEditor', variants: [{ id: 'default', render: () => <EditorDemo /> }] },
  {
    name: 'AgentListFieldsPreview',
    variants: [{ id: 'default', render: () => <PreviewOnlyDemo /> }],
  },
  { name: 'OverlayPeerPicker', variants: [{ id: 'default', render: () => <PeerPickerDemo /> }] },
  { name: 'OverlayPeerViews', variants: [{ id: 'default', render: () => <PeerViewsDemo /> }] },
  { name: 'PortPreview', variants: [{ id: 'default', render: () => <PortDemo state="ready" /> }] },
];
