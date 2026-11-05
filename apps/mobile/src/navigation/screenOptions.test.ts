import { buildTheme, themeIds } from '@openagentspocket/ui';
import { stackScreenOptions, statusBarStyle } from './screenOptions';

describe('stackScreenOptions', () => {
  it.each(themeIds)(
    'is transparent over the screen background and takes every color from the %s tokens',
    (id) => {
      const theme = buildTheme(id);
      const options = stackScreenOptions(theme);
      expect(options.headerTransparent).toBe(true);
      expect(options.headerBlurEffect).toBe('none');
      expect(options.headerBackButtonDisplayMode).toBe('minimal');
      expect(options.headerTitleStyle).toEqual({ color: theme.colors.textPrimary });
      expect(options.headerTintColor).toBe(theme.colors.accent);
      expect(options.contentStyle).toEqual({ backgroundColor: theme.colors.canvas });
    },
  );
});

describe('statusBarStyle', () => {
  it('is light on Índigo and Noche, dark on Papel', () => {
    expect(statusBarStyle(buildTheme('indigo').appearance)).toBe('light');
    expect(statusBarStyle(buildTheme('noche').appearance)).toBe('light');
    expect(statusBarStyle(buildTheme('papel').appearance)).toBe('dark');
  });
});
