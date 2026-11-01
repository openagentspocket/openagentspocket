import { type Locale, locales } from './plural';

const supported = (tag: string): Locale | undefined => {
  const language = tag.toLowerCase().split(/[-_]/)[0];
  return locales.find((locale) => locale === language);
};

/** The first preferred language the catalogs ship, else English (the development language). */
export function resolveLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const locale = supported(tag);
    if (locale) return locale;
  }
  return 'en';
}

/**
 * The device's locale tag from the JS engine (Hermes reports the system locale). The app may
 * replace it with expo-localization's list later; this keeps the package free of native code.
 */
export function deviceLocaleTag(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    return 'en';
  }
}

let current: { locale: Locale; tag: string } | undefined;

/**
 * Sets the language from a BCP 47 tag (`es-AR` → `es`). The full tag is kept for number
 * formatting; an unsupported language falls back to English. Returns the resolved locale.
 */
export function setLocale(tag: string): Locale {
  const locale = resolveLocale([tag]);
  current = { locale, tag };
  return locale;
}

function state() {
  if (!current) setLocale(deviceLocaleTag());
  return current as { locale: Locale; tag: string };
}

/** The language `t()` renders in; follows the device until setLocale is called. */
export function getLocale(): Locale {
  return state().locale;
}

/** The tag numbers are formatted with (the device's region, like Foundation's `%lld`). */
export function getLocaleTag(): string {
  return state().tag;
}
