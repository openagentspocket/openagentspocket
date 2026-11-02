import type { ChatFont } from '@openagentspocket/core';
import { monoFamily } from '@openagentspocket/ui';
import { Platform } from 'react-native';

/** The default (system Large) body size the offset steps from. */
export const CHAT_BODY_POINTS = 17;

/** Chat body text size for an offset of dynamic-type steps (about one point each). */
export const chatBodyPoints = (offset: number): number => CHAT_BODY_POINTS + offset;

/** The font family Chat text is set in; undefined keeps the system face. Code stays monospaced. */
export function chatFontFamily(font: ChatFont): string | undefined {
  switch (font) {
    case 'monospaced':
      return monoFamily;
    case 'serif':
      return Platform.select({ ios: 'Georgia', default: 'serif' });
    case 'rounded':
      return Platform.select({ ios: 'Avenir Next', default: 'sans-serif-rounded' });
    case 'system':
      return undefined;
  }
}
