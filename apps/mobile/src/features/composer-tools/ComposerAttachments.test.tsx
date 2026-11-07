import {
  AttachmentError,
  type AttachmentSource,
  ComposerStagingStore,
  ComposerStore,
  FakeClock,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';
import { ComposerAttachments } from './ComposerAttachments';

afterEach(cleanup);

function Harness({ store, staging }: { store: ComposerStore; staging: ComposerStagingStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <ComposerAttachments store={store} attachments={snapshot.attachments} staging={staging} />;
}

const source = (remove = () => {}): AttachmentSource => ({
  medium: 'image',
  label: { name: 'a.jpg', previewUri: 'file:///a.jpg' },
  prepare: async () => ({ medium: 'image', byteCount: 1, remove }),
});

function rig(stage: () => Promise<string>) {
  const store = new ComposerStore({
    target: 'p1',
    clock: new FakeClock(),
    prompt: async () => {},
  });
  const staging = new ComposerStagingStore({
    stage: { image: stage, file: stage },
    composer: store,
  });
  return { store, staging };
}

const show = (r: ReturnType<typeof rig>) =>
  render(
    <ThemeProvider themeId="indigo">
      <Harness {...r} />
    </ThemeProvider>,
  );

describe('ComposerAttachments', () => {
  it('shows the picture from the pick on, and Remove takes it out of the message', async () => {
    let finish: (path: string) => void = () => {};
    const r = rig(() => new Promise((resolve) => (finish = resolve)));
    await show(r);
    await act(async () => {
      r.staging.begin(source());
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('composer-attachment-pending-uploading')).toBeTruthy();
    expect(screen.getByTestId('composer-attachment-pending-preview')).toBeTruthy();
    await act(async () => {
      finish('/tmp/a/image.jpg');
      await r.staging.settled();
    });
    expect(screen.queryByTestId('composer-attachment-pending-uploading')).toBeNull();
    expect(r.store.getSnapshot().draft).toBe('');
    const [attachment] = r.store.getSnapshot().attachments;
    expect(screen.getByTestId(`composer-attachment-${attachment?.id}-preview`)).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText(t('Remove %@', 'a.jpg')));
    });
    expect(r.store.getSnapshot().attachments).toEqual([]);
    expect(screen.queryByTestId('composer-attachments')).toBeNull();
  });

  it('keeps standing attachments beside a failed one, whose Remove dismisses it', async () => {
    let attempts = 0;
    const r = rig(async () => {
      attempts += 1;
      if (attempts === 2) throw new AttachmentError('transferFailed');
      return '/tmp/a/image.jpg';
    });
    await show(r);
    for (const _ of [1, 2]) {
      await act(async () => {
        r.staging.begin(source());
        await r.staging.settled();
      });
    }
    expect(r.store.getSnapshot().attachments).toHaveLength(1);
    expect(screen.getByTestId('composer-attachment-pending-failed')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('composer-attachment-pending-remove'));
    });
    expect(r.staging.state.kind).toBe('idle');
    expect(r.store.getSnapshot().attachments).toHaveLength(1);
    expect(screen.queryByTestId('composer-attachment-pending-failed')).toBeNull();
  });
});
