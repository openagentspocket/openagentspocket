import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';

const themed = (ui: React.ReactElement) => <ThemeProvider themeId="indigo">{ui}</ThemeProvider>;

import {
  ClaudeSubagentTranscript,
  ComposerAttachmentStrip,
  ComposerStagingStatusBar,
  SkillContentSheet,
  type SkillItem,
  SkillsKeyboardPane,
  type SubagentRow,
} from './composerExtras';

const skills: SkillItem[] = [
  { id: 'a', command: '/review', name: 'Review', description: 'Check diffs', scope: 'project' },
  { id: 'b', command: '/init', name: 'Init', scope: 'global' },
];

describe('SkillsKeyboardPane', () => {
  it('taps insert, long press opens, refresh re-probes', async () => {
    const onPick = jest.fn();
    const onOpen = jest.fn();
    const onRefresh = jest.fn();
    await renderThemed(
      <SkillsKeyboardPane skills={skills} onPick={onPick} onOpen={onOpen} onRefresh={onRefresh} />,
    );
    const row = screen.getByTestId('skill-row-a');
    await fireEvent.press(row);
    await fireEvent(row, 'longPress');
    await fireEvent.press(screen.getByTestId('skills-pane-refresh'));
    expect(onPick).toHaveBeenCalledWith(skills[0]);
    expect(onOpen).toHaveBeenCalledWith(skills[0]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(row.props.accessibilityLabel).toBe('Review');
    expect(row.props.accessibilityHint).toContain('/review');
  });

  it('groups Project before Global and filters by query', async () => {
    await renderThemed(
      <SkillsKeyboardPane
        skills={skills}
        query="init"
        onPick={jest.fn()}
        onOpen={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('skill-row-a')).toBeNull();
    expect(screen.getByTestId('skill-row-b')).toBeTruthy();
  });

  it('shows empty, loading and failed states and the pane switcher', async () => {
    const props = { onPick: jest.fn(), onOpen: jest.fn(), onRefresh: jest.fn() };
    const view = await renderThemed(<SkillsKeyboardPane skills={[]} {...props} />);
    expect(screen.getByTestId('skills-pane-empty')).toBeTruthy();
    await view.rerender(themed(<SkillsKeyboardPane skills={[]} phase="loading" {...props} />));
    expect(screen.getByTestId('skills-pane-loading')).toBeTruthy();
    const onSelect = jest.fn();
    await view.rerender(
      themed(
        <SkillsKeyboardPane
          skills={[]}
          phase="failed"
          errorMessage="boom"
          panes={[{ key: 'keys', icon: 'grid', label: 'Keys' }]}
          selectedPane="keys"
          onSelectPane={onSelect}
          {...props}
        />,
      ),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRefresh).toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Keys' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('pane-keys'));
    expect(onSelect).toHaveBeenCalledWith('keys');
  });
});

describe('SkillContentSheet', () => {
  it('shows the document and closes with Done', async () => {
    const onClose = jest.fn();
    await renderThemed(
      <SkillContentSheet
        visible
        name="/review"
        state="loaded"
        content="# Body"
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('skill-content-text')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('skill-content-sheet-trailing'));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers Retry on failure and a spinner while loading', async () => {
    const onRetry = jest.fn();
    const view = await renderThemed(
      <SkillContentSheet
        visible
        name="/x"
        state="failed"
        message="nope"
        onClose={jest.fn()}
        onRetry={onRetry}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    await view.rerender(
      themed(<SkillContentSheet visible name="/x" state="loading" onClose={jest.fn()} />),
    );
    expect(screen.getByTestId('skill-content-loading')).toBeTruthy();
  });
});

describe('ComposerAttachmentStrip', () => {
  const removeLabel = (name: string) => `Remove ${name}`;

  it('draws nothing without attachments', async () => {
    await renderThemed(
      <ComposerAttachmentStrip items={[]} onRemove={jest.fn()} removeLabel={removeLabel} />,
    );
    expect(screen.queryByTestId('composer-attachments')).toBeNull();
  });

  it('shows a thumbnail for a picture and a named chip for a file, each removable', async () => {
    const onRemove = jest.fn();
    await renderThemed(
      <ComposerAttachmentStrip
        items={[
          { id: 'a1', name: 'IMG_1.jpg', previewUri: 'file:///cache/IMG_1.jpg' },
          { id: 'a2', name: 'notes.md' },
        ]}
        onRemove={onRemove}
        removeLabel={removeLabel}
      />,
    );
    expect(screen.getByTestId('composer-attachment-a1-preview').props.source).toEqual({
      uri: 'file:///cache/IMG_1.jpg',
    });
    expect(screen.queryByTestId('composer-attachment-a2-preview')).toBeNull();
    expect(screen.getByText('notes.md')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove notes.md'));
    expect(onRemove).toHaveBeenCalledWith('a2');
  });

  it('falls back to the named chip when the picture is gone from the phone', async () => {
    await renderThemed(
      <ComposerAttachmentStrip
        items={[{ id: 'a1', name: 'IMG_1.jpg', previewUri: 'file:///cache/gone.jpg' }]}
        onRemove={jest.fn()}
        removeLabel={removeLabel}
      />,
    );
    await fireEvent(screen.getByTestId('composer-attachment-a1-preview'), 'error');
    expect(screen.queryByTestId('composer-attachment-a1-preview')).toBeNull();
    expect(screen.getByText('IMG_1.jpg')).toBeTruthy();
  });

  it('marks an upload in flight and one that failed', async () => {
    await renderThemed(
      <ComposerAttachmentStrip
        items={[
          { id: 'up', name: 'a.jpg', previewUri: 'file:///a.jpg', state: 'uploading' },
          { id: 'bad', name: 'b.md', state: 'failed' },
        ]}
        onRemove={jest.fn()}
        removeLabel={removeLabel}
      />,
    );
    expect(screen.getByTestId('composer-attachment-up-uploading')).toBeTruthy();
    expect(screen.getByTestId('composer-attachment-bad-failed')).toBeTruthy();
  });
});

describe('ComposerStagingStatusBar', () => {
  it('runs the command that was pressed and speaks the label', async () => {
    const onCommand = jest.fn();
    await renderThemed(
      <ComposerStagingStatusBar
        state="failed"
        label="Failed"
        commands={['retry', 'dismiss']}
        onCommand={onCommand}
      />,
    );
    expect(screen.getByTestId('staging-bar').props.accessibilityLabel).toBe('Failed');
    await fireEvent.press(screen.getByTestId('staging-retry'));
    expect(onCommand).toHaveBeenCalledWith('retry');
    expect(screen.getByTestId('staging-dismiss')).toBeTruthy();
  });

  it('renders nothing without a label', async () => {
    await renderThemed(<ComposerStagingStatusBar state="staging" label="" />);
    expect(screen.queryByTestId('staging-bar')).toBeNull();
  });
});

describe('ClaudeSubagentTranscript', () => {
  const rows: SubagentRow[] = [
    { id: 'u', kind: 'user', text: 'hello' },
    { id: 't', kind: 'tool', summary: 'Ran 2 searches', detail: 'grep x' },
  ];

  it('is read-only with a back button and expandable tool rows', async () => {
    const onBack = jest.fn();
    await renderThemed(
      <ClaudeSubagentTranscript title="Task" kind="Explore" rows={rows} onBack={onBack} />,
    );
    expect(screen.getByTestId('subagent-read-only')).toBeTruthy();
    expect(screen.queryByTestId('composer')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByText('grep x')).toBeNull();
    await fireEvent.press(screen.getByText('Ran 2 searches'));
    expect(screen.getByText('grep x')).toBeTruthy();
  });

  it('shows the empty, missing and failed phases', async () => {
    const onRetry = jest.fn();
    const view = await renderThemed(
      <ClaudeSubagentTranscript title="T" phase="empty" rows={[]} onBack={jest.fn()} />,
    );
    expect(screen.getByTestId('subagent-empty')).toBeTruthy();
    await view.rerender(
      themed(<ClaudeSubagentTranscript title="T" phase="missing" rows={[]} onBack={jest.fn()} />),
    );
    expect(screen.getByTestId('subagent-missing')).toBeTruthy();
    await view.rerender(
      themed(
        <ClaudeSubagentTranscript
          title="T"
          phase="failed"
          rows={[]}
          onBack={jest.fn()}
          onRetry={onRetry}
        />,
      ),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
