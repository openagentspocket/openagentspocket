import { formatMessage, getLocale, getLocaleTag, type Locale } from '@openagentspocket/i18n';

/**
 * Strings the converted Swift catalogs do not have: the QR scanner's labels and the
 * validation lines of the Host form (SwiftUI drew those with system controls). Both
 * languages live here until the converter owns an extras table; `{0}` marks an argument.
 */
const EN = {
  'Turn on the light': 'Turn on the light',
  'Turn off the light': 'Turn off the light',
  'Allow Camera': 'Allow Camera',
  'Use Code': 'Use Code',
  Camera: 'Camera',
  'Pairing Code': 'Pairing Code',
  'Changed host key': 'Changed host key',
  'Remote environment': 'Remote environment',
  'Protocol compatible': 'Protocol compatible',
  'Run the checks to see whether this Host is ready.':
    'Run the checks to see whether this Host is ready.',
  'Leave blank to keep the saved password.': 'Leave blank to keep the saved password.',
  'herdr answered but rejected the check: {0} ({1})':
    'herdr answered but rejected the check: {0} ({1})',
  'Enter a port from 1 to 65535.': 'Enter a port from 1 to 65535.',
  'Use letters, digits, dots, dashes and underscores (up to 64).':
    'Use letters, digits, dots, dashes and underscores (up to 64).',
  'The saved Host catalog could not be read. Its original data was preserved; reinstalling or adding a Host would risk losing it.':
    'The saved Host catalog could not be read. Its original data was preserved; reinstalling or adding a Host would risk losing it.',
} as const;

export type ExtraKey = keyof typeof EN;

const ES: Record<ExtraKey, string> = {
  'Turn on the light': 'Encender la luz',
  'Turn off the light': 'Apagar la luz',
  'Allow Camera': 'Permitir la cámara',
  'Use Code': 'Usar código',
  Camera: 'Cámara',
  'Pairing Code': 'Código de vinculación',
  'Changed host key': 'Clave del Host cambiada',
  'Remote environment': 'Entorno remoto',
  'Protocol compatible': 'Protocolo compatible',
  'Run the checks to see whether this Host is ready.':
    'Corré las verificaciones para ver si este Host está listo.',
  'Leave blank to keep the saved password.': 'Dejalo vacío para conservar la contraseña guardada.',
  'herdr answered but rejected the check: {0} ({1})':
    'herdr respondió pero rechazó la verificación: {0} ({1})',
  'Enter a port from 1 to 65535.': 'Ingresá un puerto de 1 a 65535.',
  'Use letters, digits, dots, dashes and underscores (up to 64).':
    'Usá letras, números, puntos, guiones y guiones bajos (hasta 64).',
  'The saved Host catalog could not be read. Its original data was preserved; reinstalling or adding a Host would risk losing it.':
    'No se pudo leer el catálogo de Hosts guardado. Sus datos originales se conservaron; reinstalar o agregar un Host arriesgaría perderlos.',
};

const TABLES: Record<Locale, Record<ExtraKey, string>> = { en: EN, es: ES };

/** A string of the extras table in the current locale. */
export function extra(key: ExtraKey, ...args: readonly (string | number)[]): string {
  const locale = getLocale();
  return formatMessage(TABLES[locale][key], args, locale, getLocaleTag());
}

export const extraKeys = Object.keys(EN) as ExtraKey[];
export const extraTables = TABLES;
