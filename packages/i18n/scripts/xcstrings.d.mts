// Types for xcstrings.mjs (the converter stays plain JS so the CLI runs without a build step).
export const LOCALES: readonly string[];

export interface Specifier {
  index: number;
  kind: 'string' | 'number';
}

export interface StringUnit {
  stringUnit: { value: string };
}

export interface Localization {
  stringUnit?: { state?: string; value: string };
  variations?: Record<string, Record<string, StringUnit>>;
}

export interface CatalogEntry {
  localizations?: Record<string, Localization>;
  shouldTranslate?: boolean;
  extractionState?: string;
}

export interface Catalog {
  sourceLanguage?: string;
  strings?: Record<string, CatalogEntry>;
}

export interface ConvertedEntry {
  en: string;
  es: string;
}

export interface ConvertedCatalog {
  en: Record<string, string>;
  es: Record<string, string>;
  skipped: string[];
}

export function specifiersOf(text: string): Specifier[];
export function convertEntry(key: string, entry: CatalogEntry, where?: string): ConvertedEntry;
export function convertCatalog(catalog: Catalog, name?: string): ConvertedCatalog;
export function convertSwiftCatalogs(
  swiftDir: string,
): Array<ConvertedCatalog & { table: string; path: string }>;
