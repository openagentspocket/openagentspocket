// herdr's key names (`agent.send_keys`) as tmux `send-keys` arguments.

const NAMED: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  'shift+tab': 'BTab',
  backspace: 'BSpace',
  delete: 'DC',
  space: 'Space',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PPage',
  pagedown: 'NPage',
};

const MODIFIED = /^(ctrl|alt)\+(.)$/u;

/** One key's `send-keys` arguments: a tmux key for a herdr name, the text typed literally otherwise. */
export function tmuxKeyArgs(name: string): string[] {
  const named = NAMED[name.toLowerCase()];
  if (named) return [named];
  const modified = MODIFIED.exec(name.toLowerCase());
  if (modified) return [`${modified[1] === 'ctrl' ? 'C' : 'M'}-${modified[2]}`];
  return ['-l', '--', name];
}
