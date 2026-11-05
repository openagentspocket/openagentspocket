import { join } from 'node:path';

const LABEL = 'com.openagentspocket.bridge';
const UNIT = 'openagentspocket-bridge.service';

export interface Autostart {
  /** Where the definition goes. */
  path: string;
  content: string;
  /** What turns it on. */
  enable: readonly string[];
}

const xml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Keeps the bridge running after a restart, as a user service: no root, gone with `disable`. */
export function autostartFor(options: {
  platform: string;
  home: string;
  launcher: string;
  uid: number;
}): Autostart | null {
  const { platform, home, launcher, uid } = options;
  if (platform === 'darwin') {
    const path = join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    return {
      path,
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        `<key>Label</key><string>${LABEL}</string>`,
        `<key>ProgramArguments</key><array><string>${xml(launcher)}</string><string>serve</string></array>`,
        '<key>RunAtLoad</key><true/>',
        '<key>KeepAlive</key><true/>',
        '</dict></plist>',
        '',
      ].join('\n'),
      enable: ['launchctl', 'bootstrap', `gui/${uid}`, path],
    };
  }
  if (platform === 'linux') {
    return {
      path: join(home, '.config', 'systemd', 'user', UNIT),
      content: [
        '[Unit]',
        'Description=OpenAgentsPocket session bridge',
        '',
        '[Service]',
        `ExecStart="${launcher}" serve`,
        'Restart=always',
        '',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
      enable: ['systemctl', '--user', 'enable', '--now', UNIT],
    };
  }
  return null;
}
