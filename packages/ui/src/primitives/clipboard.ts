import { AccessibilityInfo } from 'react-native';

interface ClipboardModule {
  setStringAsync(text: string): Promise<boolean>;
}

let cached: ClipboardModule | null | undefined;

/**
 * expo-clipboard, loaded on first use so a dev client built before the module
 * was added still starts (copy then fails quietly instead of crashing the app).
 */
function clipboard(): ClipboardModule | null {
  if (cached === undefined) {
    try {
      cached = require('expo-clipboard') as ClipboardModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/**
 * Puts `value` on the pasteboard and tells screen readers `announcement`
 * ("Copied"): the one confirmation every copy control gives. False when the
 * pasteboard is unavailable.
 */
export async function copyToClipboard(value: string, announcement: string): Promise<boolean> {
  const module = clipboard();
  if (!module) return false;
  try {
    await module.setStringAsync(value);
  } catch {
    return false;
  }
  AccessibilityInfo.announceForAccessibility(announcement);
  return true;
}
