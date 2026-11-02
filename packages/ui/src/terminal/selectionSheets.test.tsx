import { act, fireEvent, screen } from '@testing-library/react-native';
import { OverlayHost } from '../overlay/OverlayHost';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';
import { AttachLinksSheet } from './AttachLinksSheet';
import { openAttachLink } from './openAttachLink';
import { ReviewPasteSheet } from './ReviewPasteSheet';
import { SelectTextSheet } from './SelectTextSheet';

const labels = { title: 'Review Paste', summary: '3 lines', paste: 'Paste', cancel: 'Cancel' };

describe('ReviewPasteSheet', () => {
  it('shows the preview and confirms or cancels', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderThemed(
      <ReviewPasteSheet
        preview={'one\ntwo'}
        labels={labels}
        canConfirm
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByTestId('review-paste-preview')).toHaveTextContent('one\ntwo');
    await fireEvent.press(screen.getByTestId('review-paste-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('review-paste-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables Paste while nothing can take it, and hides without a preview', async () => {
    const onConfirm = jest.fn();
    const view = await renderThemed(
      <ReviewPasteSheet
        preview="a\nb"
        labels={labels}
        canConfirm={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await fireEvent.press(screen.getByTestId('review-paste-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
    await view.rerender(
      <ThemeProvider themeId="indigo">
        <ReviewPasteSheet
          preview={null}
          labels={labels}
          canConfirm
          onConfirm={onConfirm}
          onCancel={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('review-paste-sheet')).toBeNull();
  });
});

describe('SelectTextSheet', () => {
  it('shows selectable text only when given text', async () => {
    const view = await renderThemed(
      <SelectTextSheet text="grid text" title="Select Text" onClose={() => {}} />,
    );
    expect(screen.getByTestId('select-text-body').props.selectable).toBe(true);
    expect(screen.getByTestId('select-text-body')).toHaveTextContent('grid text');
    await view.rerender(
      <ThemeProvider themeId="indigo">
        <SelectTextSheet text={null} title="Select Text" onClose={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('select-text-sheet')).toBeNull();
  });
});

describe('AttachLinksSheet', () => {
  it('lists links and reports the tapped one', async () => {
    const onOpen = jest.fn();
    const links = [{ target: 'https://a.dev/x', host: 'a.dev' }];
    await renderThemed(
      <AttachLinksSheet
        visible
        links={links}
        title="Attach Links"
        emptyTitle="None"
        onOpen={onOpen}
        onClose={() => {}}
      />,
    );
    await fireEvent.press(screen.getByTestId('attach-link-https://a.dev/x'));
    expect(onOpen).toHaveBeenCalledWith(links[0]);
  });

  it('shows the empty state without links', async () => {
    await renderThemed(
      <AttachLinksSheet
        visible
        links={[]}
        title="Attach Links"
        emptyTitle="None"
        onOpen={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('None')).toBeTruthy();
  });
});

describe('openAttachLink', () => {
  const texts = {
    failedTitle: 'Failed',
    failedMessage: 'Copy it?',
    copy: 'Copy Link',
    cancel: 'Cancel',
  };

  it('does not ask anything when the link opens', async () => {
    const copy = jest.fn();
    await expect(
      openAttachLink('https://a.dev', { open: async () => true, copy, labels: texts }),
    ).resolves.toBe(true);
    expect(copy).not.toHaveBeenCalled();
  });

  it('offers to copy the link when the system refuses it', async () => {
    await renderThemed(<OverlayHost />);
    const copy = jest.fn();
    const box: { done?: Promise<boolean> } = {};
    await act(async () => {
      box.done = openAttachLink('https://a.dev', {
        open: async () => {
          throw new Error('refused');
        },
        copy,
        labels: texts,
      });
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Copy Link' }));
    await expect(box.done).resolves.toBe(false);
    expect(copy).toHaveBeenCalledWith('https://a.dev');
  });
});
