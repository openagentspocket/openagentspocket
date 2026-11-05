import { commandKeys, type QuickKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  ActionMenu,
  type ActionMenuItem,
  KeyboardDock,
  type KeyModifiers,
  type KeySpec,
  TerminalView,
  useAttachedTerminal,
} from '@openagentspocket/ui';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useSettings } from '@/settings/SettingsProvider';
import { TerminalZoom } from '@/terminal/TerminalZoom';
import { useDockSlot } from '../detailUi';
import type { AgentTerminalSession } from './AgentTerminalSession';
import { CONTROL_KEYS, FULL_KEYBOARD, type KeyRows, keyLabel } from './keyTables';
import { PasteReviewSheet } from './PasteReviewSheet';
import { StatusOverlay } from './StatusOverlay';
import { TerminalToolbar } from './TerminalToolbar';
import { useAgentTerminalSession } from './useAgentTerminalSession';

/** Which keys sit under the terminal: the system keyboard, or one of the app's docks. */
type Keys = 'system' | 'controls' | 'full';

const DOCKS: Record<Exclude<Keys, 'system'>, KeyRows> = {
  controls: CONTROL_KEYS,
  full: FULL_KEYBOARD,
};

/** The Agent detail's terminal: attach pipeline, keys and paste, over one session. */
export function TerminalSurface({ hostId, paneId }: { hostId: string; paneId: string }) {
  const session = useAgentTerminalSession(hostId, paneId);
  return session ? <LiveTerminal session={session} /> : null;
}

function LiveTerminal({ session }: { session: AgentTerminalSession }) {
  const router = useRouter();
  const settings = useSettings();
  const store = useSyncExternalStore(session.subscribe, session.getStore);
  const terminal = useAttachedTerminal(store);
  const input = useSyncExternalStore(session.input.subscribe, session.input.getSnapshot);
  const [keys, setKeys] = useState<Keys>('system');
  const [menu, setMenu] = useState(false);
  const [dPad, setDPad] = useState(false);
  const { keyboard } = session;
  const configuration = {
    showsEscape: settings.toolbarEscape,
    showsTab: settings.toolbarTab,
    showsDPad: settings.toolbarDPad,
  };

  const sendKey = useCallback((key: QuickKey) => void keyboard.sendQuickKey(key), [keyboard]);
  const showKeys = (next: Keys) => {
    setKeys(next);
    if (next === 'system') terminal.handle.current?.focus();
  };
  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) session.input.requestPaste(text);
  };
  const dockKey = (rows: KeyRows) => (spec: KeySpec, mods: KeyModifiers) => {
    const key = rows.lookup.get(spec.id);
    if (key)
      keyboard.sendQuickKey(key, { control: mods.ctrl, option: mods.alt, shift: mods.shift });
  };

  const items: ActionMenuItem[] = [
    ...commandKeys(configuration).map((key) => ({
      key: `cmd-${keyLabel(key)}`,
      title: keyLabel(key),
      onPress: () => sendKey(key),
    })),
    { key: 'paste', title: t('Paste'), icon: 'copy', onPress: () => void paste() },
    {
      key: 'controls',
      title: t('Control Keys'),
      icon: 'keyboard',
      checked: keys === 'controls',
      onPress: () => showKeys(keys === 'controls' ? 'system' : 'controls'),
    },
    {
      key: 'customize',
      title: t('Customize Toolbar'),
      icon: 'settings',
      onPress: () => router.push({ pathname: '/settings/[page]', params: { page: 'toolbar' } }),
    },
  ];
  const dock = keys === 'system' ? null : DOCKS[keys];

  // The toolbar sits in the detail's dock, under the status line and over the composer.
  useDockSlot(
    settings.terminalToolbarVisible ? (
      <TerminalToolbar
        keyboard={keyboard}
        configuration={configuration}
        onKey={sendKey}
        fullKeyboardShown={keys === 'full'}
        onToggleKeyboard={() => showKeys(keys === 'full' ? 'system' : 'full')}
        onMore={() => setMenu(true)}
        dPadOpen={dPad}
        onToggleDPad={setDPad}
      />
    ) : null,
  );
  return (
    <View style={{ flex: 1 }} testID="terminal-surface">
      <View style={{ flex: 1 }}>
        <TerminalZoom>
          {(fontSize) => (
            <TerminalView
              key={terminal.snapshot.surfaceId}
              {...terminal.viewProps}
              fontSize={fontSize}
              onInput={(data) => void keyboard.typed(data)}
              accessibilityLabel={t('Terminal')}
              testID="terminal-slot"
            />
          )}
        </TerminalZoom>
        <StatusOverlay status={terminal.snapshot.status} onRetry={store.retry.bind(store)} />
      </View>
      {dock ? <KeyboardDock rows={dock.rows} onKey={dockKey(dock)} testID="keys-dock" /> : null}
      <ActionMenu items={items} visible={menu} onClose={() => setMenu(false)} />
      <PasteReviewSheet
        review={input.pendingPaste}
        onConfirm={() => session.input.confirmPaste()}
        onCancel={() => session.input.cancelPaste()}
      />
    </View>
  );
}
