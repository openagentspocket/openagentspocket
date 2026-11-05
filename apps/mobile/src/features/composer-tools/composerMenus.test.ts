import { composerAddItems, composerMoreItems } from './composerMenus';

const noop = () => {};

describe('composer menus', () => {
  it('lists the attachments the actions offer, disabled while one is in flight', () => {
    expect(composerAddItems({}).map((item) => item.key)).toEqual([]);
    const items = composerAddItems({ addImage: noop, addFile: noop, canBegin: false });
    expect(items.map((item) => item.key)).toEqual(['add-image', 'add-file']);
    expect(items.every((item) => item.disabled)).toBe(true);
    expect(composerAddItems({ addImage: noop, canBegin: true })[0]?.disabled).toBe(false);
  });

  it('hides an item whose action is absent and keeps Swift order across three sections', () => {
    const items = composerMoreItems({
      backToConsole: noop,
      showAgentTerminal: noop,
      showChanges: noop,
      newAgent: noop,
      showSkills: noop,
      manageSnippets: noop,
      renameAgent: noop,
      closeAgent: noop,
    });
    expect(items.map((item) => item.key)).toEqual([
      'back',
      'show-terminal',
      'changes',
      'new-agent',
      'skills',
      'snippets',
      'rename-agent',
      'close',
    ]);
    // Later sections start with an untitled marker; the first has none.
    expect(items.map((item) => item.section)).toEqual([
      undefined,
      '',
      undefined,
      undefined,
      undefined,
      undefined,
      '',
      undefined,
    ]);
    expect(items.at(-1)?.destructive).toBe(true);
  });

  it('is empty when no action exists, so the button is not drawn', () => {
    expect(composerMoreItems({})).toEqual([]);
  });

  it('disables Open Terminal while one opens', () => {
    const open = composerMoreItems({ openTerminal: noop, isOpeningTerminal: true }).find(
      (item) => item.key === 'open-terminal',
    );
    expect(open?.disabled).toBe(true);
  });
});
