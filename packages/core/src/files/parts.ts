import { encodeUtf8 } from '../events/utf8';
import { FILE_LIMITS } from './limits';
import { MAX_NAME_UTF8_BYTES } from './path';

const utf8Length = (value: string) => encodeUtf8(value).length;

/** `.<name>.agentico-<8 hex>.part`, or without the name where it would pass the component limit. */
export function partName(name: string, token: string): string {
  const named = `.${name}.agentico-${token}.part`;
  return utf8Length(named) <= MAX_NAME_UTF8_BYTES ? named : `.agentico-${token}.part`;
}

/** The hidden `.part` files an upload writes, and a dropped upload leaves behind. */
export function isPartName(name: string): boolean {
  return /^(\..*)?\.agentico-[0-9a-f]{8}\.part$/.test(name);
}

/**
 * A regular file under a part name that this app abandoned (`abandoned` holds paths whose cleanup
 * failed), or that nobody has written for the stale age. A fresh one may be an upload in flight.
 */
export function isLeftoverPart(
  entry: { name: string; kind: string | null; modifiedAt: number | null },
  path: string,
  nowSeconds: number,
  abandoned: ReadonlySet<string>,
): boolean {
  if (entry.kind !== 'file' || !isPartName(entry.name)) return false;
  if (abandoned.has(path)) return true;
  if (entry.modifiedAt === null || entry.modifiedAt === 0) return false;
  return nowSeconds - entry.modifiedAt > FILE_LIMITS.stalePartAgeSeconds;
}
