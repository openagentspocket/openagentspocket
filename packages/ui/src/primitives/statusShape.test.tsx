import { screen } from '@testing-library/react-native';
import { Card, ProgramMark, StatusDot, statusColorKey, themes } from '../index';
import { renderThemed, setFontScale } from '../test-utils';

// iOS reports 1.353 at its largest standard size (xxxLarge), 1.786 at AX1, 2.143 at AX2.
const hidden = { includeHiddenElements: true };

describe('StatusDot', () => {
  it('is a dot at standard text sizes, the largest included', async () => {
    setFontScale(1.353);
    await renderThemed(<StatusDot status="blocked" />);
    expect(screen.getByTestId('status-dot-blocked', hidden)).toHaveStyle({
      backgroundColor: themes.indigo.colors.statusBlocked,
    });
    expect(screen.queryByTestId('icon-statusBlocked', hidden)).toBeNull();
  });

  it.each([
    ['blocked', 'exclamationmark.circle.fill'],
    ['done', 'checkmark.circle.fill'],
    ['working', 'circle.fill'],
    ['idle', 'circle'],
  ] as const)('draws %s as its own shape at accessibility sizes', async (status, symbol) => {
    setFontScale(1.786);
    await renderThemed(<StatusDot status={status} />);
    const glyph = screen.getByTestId(`status-dot-${status}`, hidden);
    expect(glyph.props.name).toBe(symbol);
    expect(glyph.props.tintColor).toBe(themes.indigo.colors[statusColorKey[status]]);
  });
});

describe('ProgramMark', () => {
  it('cuts the status dot into the corner at standard sizes', async () => {
    setFontScale(1);
    await renderThemed(<ProgramMark program="codex" status="done" />);
    expect(screen.getByTestId('program-mark-status-done', hidden)).toBeTruthy();
    expect(screen.queryByTestId('status-dot-done', hidden)).toBeNull();
  });

  it('moves the status beside the mark as a shaped glyph at accessibility sizes', async () => {
    setFontScale(2.143);
    await renderThemed(<ProgramMark program="codex" status="blocked" />);
    expect(screen.queryByTestId('program-mark-status-blocked', hidden)).toBeNull();
    expect(screen.getByTestId('status-dot-blocked', hidden).props.name).toBe(
      'exclamationmark.circle.fill',
    );
  });

  it('rings the corner dot in the fill of the card that holds it', async () => {
    setFontScale(1);
    await renderThemed(
      <Card level="overlay">
        <ProgramMark program="codex" status="working" />
      </Card>,
      'papel',
    );
    expect(screen.getByTestId('program-mark-status-working', hidden)).toHaveStyle({
      borderColor: themes.papel.colors.surfaceOverlay,
    });
  });
});
