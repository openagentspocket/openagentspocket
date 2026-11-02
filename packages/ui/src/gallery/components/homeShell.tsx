import { View } from 'react-native';
import { Fab } from '../../components/Fab';
import { HomeHostCard } from '../../components/HomeHostCard';
import { InboxCard } from '../../components/InboxCard';
import { LargeTitleBar } from '../../components/LargeTitleBar';
import { SessionsStrip, type StripSession } from '../../components/SessionsStrip';
import { UsageRing } from '../../components/UsageRing';
import { metrics } from '../../theme/metrics';
import type { CatalogEntry } from './types';

const noop = () => {};
const inset = { paddingHorizontal: metrics.screenInset };

const sessions: readonly StripSession[] = [
  {
    id: 'a',
    kind: 'agent',
    name: 'claude',
    title: 'Refresh the setup',
    host: 'Studio Mac',
    status: 'working',
  },
  { id: 'b', kind: 'shell', name: 'landing $', title: 'landing', host: 'Studio Mac' },
  { id: 'c', kind: 'shell', name: 'agentico $', title: '3', host: 'Studio Mac' },
];

const newMenu = [
  { key: 'agent', title: 'New Agent', icon: 'sparkles', onPress: noop },
  { key: 'terminal', title: 'New Terminal', icon: 'terminal', onPress: noop },
  { key: 'host', title: 'Add Host', icon: 'server', onPress: noop },
] as const;

const inbox = (section: 'needsYou' | 'working') => (
  <View style={inset}>
    <InboxCard
      presentation={{
        program: 'claude',
        title: 'Checkout review',
        subtitle: 'Run the targeted UI test before commit?',
        age: '4m',
        chips: ['Build Server', 'storefront'],
        section,
      }}
    />
  </View>
);

/** Demos of the UX3 group 'homeShell': one entry per component, one variant per catalog variant id. */
export const homeShellEntries: readonly CatalogEntry[] = [
  {
    name: 'InboxCard',
    variants: [
      { id: 'default', render: () => inbox('needsYou') },
      { id: 'working', render: () => inbox('working') },
    ],
  },
  {
    name: 'SessionsStrip',
    variants: [
      {
        id: 'default',
        render: () => (
          <SessionsStrip
            sessions={sessions}
            title="Sessions"
            seeAllLabel="See all"
            onOpen={noop}
            onSeeAll={noop}
          />
        ),
      },
    ],
  },
  {
    name: 'HomeHostCard',
    variants: [
      {
        id: 'default',
        render: () => (
          <View style={[inset, { gap: 10 }]}>
            <HomeHostCard
              host={{
                name: 'Quiet Mac',
                address: 'developer@quiet-mac.example.invalid:22',
                readiness: 'No Agents',
                tone: 'success',
              }}
            />
            <HomeHostCard
              host={{
                name: 'Mac mini',
                address: 'developer@mini-mac.example.invalid:22',
                readiness: 'Sync issue',
                tone: 'warning',
              }}
            />
          </View>
        ),
      },
    ],
  },
  {
    name: 'UsageRing',
    variants: [
      {
        id: 'default',
        render: () => (
          <View style={[inset, { flexDirection: 'row', gap: 16 }]}>
            <UsageRing percent={48} accessibilityLabel="Usage" />
            <UsageRing percent={86} tone="warn" accessibilityLabel="Usage" />
            <UsageRing percent={97} tone="critical" accessibilityLabel="Usage" />
            <UsageRing percent={null} accessibilityLabel="Usage" />
          </View>
        ),
      },
    ],
  },
  {
    name: 'Fab',
    variants: [
      {
        id: 'default',
        render: () => (
          <View style={[inset, { alignItems: 'flex-end' }]}>
            <Fab items={newMenu} accessibilityLabel="New" menuTitle="New" />
          </View>
        ),
      },
    ],
  },
  {
    name: 'LargeTitleBar',
    variants: [
      {
        id: 'default',
        render: () => (
          <LargeTitleBar
            title="Agentico"
            actions={[
              { node: <UsageRing percent={48} />, label: 'Usage', onPress: noop },
              { icon: 'settings', label: 'Settings', onPress: noop },
            ]}
          />
        ),
      },
    ],
  },
];
