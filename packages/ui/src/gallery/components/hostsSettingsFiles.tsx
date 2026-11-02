import { FileRow } from '../../components/FileRow';
import { HostRow } from '../../components/HostRow';
import { HostStatusCard } from '../../components/HostStatusCard';
import { PortRow } from '../../components/PortRow';
import { SettingsGroup } from '../../components/SettingsGroup';
import { PaletteDots, ThemeChoiceCard, ThemeChoicePreview } from '../../components/ThemeChoiceCard';
import { Section } from '../../primitives/Section';
import type { CatalogEntry } from './types';

const noop = () => {};

/** Demos of the UX3 group 'hostsSettingsFiles' (owned by its UX3 task): one entry per component, one variant per catalog variant id. */
export const hostsSettingsFilesEntries: readonly CatalogEntry[] = [
  {
    name: 'HostRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <Section>
            <HostRow
              host={{
                name: 'Studio Mac',
                subtitle: 'developer@studio.demo.invalid',
                connection: 'connected',
                latencyLabel: '<1 ms',
              }}
              onPress={noop}
            />
            <HostRow
              host={{
                name: 'Build Server',
                subtitle: 'builder@build.demo.invalid',
                connection: 'connected',
                latencyLabel: '<1 ms',
              }}
              onPress={noop}
            />
            <HostRow
              host={{
                name: 'Old Laptop',
                subtitle: 'me@laptop.demo.invalid',
                connection: 'failed',
              }}
              onPress={noop}
              onRetry={noop}
              retryLabel="Retry"
            />
          </Section>
        ),
      },
    ],
  },
  {
    name: 'HostStatusCard',
    variants: [
      {
        id: 'default',
        render: () => (
          <>
            <HostStatusCard
              tone="success"
              title="Connected"
              subtitle="studio.demo.invalid · Direct"
              onReconnect={noop}
              reconnectLabel="Reconnect"
            />
            <HostStatusCard
              tone="warning"
              title="Reconnecting"
              subtitle="studio.demo.invalid · Relay"
              onReconnect={noop}
              reconnectLabel="Reconnect"
            />
            <HostStatusCard
              tone="danger"
              title="Unreachable"
              subtitle="studio.demo.invalid · Direct"
              onReconnect={noop}
              reconnectLabel="Reconnect"
            />
          </>
        ),
      },
    ],
  },
  {
    name: 'SettingsGroup',
    variants: [
      {
        id: 'default',
        render: () => (
          <SettingsGroup
            title="Appearance"
            rows={[
              {
                key: 'theme',
                icon: 'sparkles',
                title: 'Theme',
                value: 'Índigo',
                valueAccessory: <PaletteDots themeId="indigo" />,
                onPress: noop,
              },
              {
                key: 'fonts',
                icon: 'keyboard',
                title: 'Fonts & Size',
                value: 'JetBrains Mono 8',
                onPress: noop,
              },
            ]}
          />
        ),
      },
      {
        id: 'subtitle',
        render: () => (
          <SettingsGroup
            rows={[
              { key: 'n', icon: 'bell', title: 'Notifications', value: 'Off', onPress: noop },
              {
                key: 'c',
                icon: 'info',
                title: 'Chat',
                subtitle: 'Finished turns, cache',
                onPress: noop,
              },
              {
                key: 'a',
                icon: 'terminal',
                title: 'Agent Rows',
                subtitle: 'Fields, order, preview',
                onPress: noop,
              },
            ]}
          />
        ),
      },
      {
        id: 'toggle',
        render: () => (
          <SettingsGroup
            rows={[
              { key: 'follow', title: 'Follow System', toggle: { value: false, onChange: noop } },
            ]}
          />
        ),
      },
    ],
  },
  {
    name: 'ThemeChoiceCard',
    variants: [
      {
        id: 'selected',
        render: () => (
          <ThemeChoiceCard themeId="indigo" subtitle="Dark · Default" selected onPress={noop} />
        ),
      },
      {
        id: 'unselected',
        render: () => (
          <ThemeChoiceCard themeId="papel" subtitle="Light" selected={false} onPress={noop} />
        ),
      },
      {
        id: 'preview',
        render: () => (
          <ThemeChoicePreview
            themeId="indigo"
            agentName="codex"
            statusLabel="Blocked"
            prompt="Run make test?"
            chips={['devbox', 'agentico']}
            terminalPath="~/agentico $"
            terminalCommand="make test"
          />
        ),
      },
    ],
  },
  {
    name: 'FileRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <Section>
            <FileRow
              item={{ name: 'Downloads', kind: 'directory', detail: '21 Oct 2026 at 13:00' }}
              onPress={noop}
            />
            <FileRow
              item={{ name: 'Documents', kind: 'directory', detail: '02 Oct 2026 at 08:30' }}
              onPress={noop}
            />
          </Section>
        ),
      },
      {
        id: 'file',
        render: () => (
          <Section>
            <FileRow
              item={{ name: '.zshrc', kind: 'file', detail: '40 bytes · 22 Sep 2026 at 09:00' }}
              secretLabel="May contain secrets"
              onPress={noop}
            />
            <FileRow
              item={{ name: 'notes.txt', kind: 'file', detail: '1 KB · 20 Sep 2026 at 18:12' }}
              onPress={noop}
            />
          </Section>
        ),
      },
    ],
  },
  {
    name: 'PortRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <Section>
            <PortRow
              port={{
                number: 3000,
                name: 'web-app',
                addressLabel: 'Localhost',
                detail: 'node:22',
                container: true,
                reachable: true,
              }}
              onOpen={noop}
            />
            <PortRow
              port={{
                number: 5432,
                name: 'postgres',
                addressLabel: 'All interfaces',
                detail: 'pid 812',
                reachable: false,
              }}
              unreachableLabel="Not reachable through SSH safely"
              onOpen={noop}
            />
          </Section>
        ),
      },
    ],
  },
];
