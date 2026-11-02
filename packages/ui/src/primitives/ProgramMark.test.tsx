import { PROGRAM_KINDS } from '@openagentspocket/core';
import { screen } from '@testing-library/react-native';
import { ProgramMark } from '../index';
import { renderThemed, setFontScale } from '../test-utils';
import { badgeGeometry } from './ProgramLogo';

const hidden = { includeHiddenElements: true };

describe('ProgramMark logos', () => {
  it('draws a logo for every kind that has a brand and a monogram for the rest', async () => {
    setFontScale(1);
    for (const info of PROGRAM_KINDS) {
      await renderThemed(<ProgramMark program={info.kind} />);
      expect(screen.getByTestId(`program-mark-${info.kind}`, hidden)).toBeTruthy();
      expect(screen.queryAllByTestId(/^logo-/, hidden)).toHaveLength(info.brand ? 1 : 0);
      await screen.unmount();
    }
  });

  it('resolves spellings to the same logo', async () => {
    setFontScale(1);
    await renderThemed(<ProgramMark program="Claude Code" />);
    expect(screen.getByTestId('logo-claude', hidden)).toBeTruthy();
  });

  it('puts the status dot on a logo without a ring, at the corner', async () => {
    setFontScale(1);
    await renderThemed(<ProgramMark program="claude" status="blocked" size={24} />);
    const dot = screen.getByTestId('program-mark-status-blocked', hidden);
    const { diameter, center } = badgeGeometry(24);
    expect(dot).toHaveStyle({
      width: diameter,
      height: diameter,
      borderWidth: 0,
      left: center - diameter / 2,
    });
  });

  it('keeps the dot beside the logo at accessibility sizes, uncut', async () => {
    setFontScale(2.143);
    await renderThemed(<ProgramMark program="claude" status="working" />);
    expect(screen.getByTestId('status-dot-working', hidden)).toBeTruthy();
    expect(screen.queryByTestId('program-mark-status-working', hidden)).toBeNull();
  });

  it('places the dot a quarter of itself past the corner', () => {
    const { diameter, center } = badgeGeometry(24);
    expect(center + diameter / 2).toBeCloseTo(24 + diameter / 4);
  });
});
