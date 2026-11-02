const HEX = '0123456789abcdef';

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
}

function webCrypto(): CryptoLike | undefined {
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  const crypto = webCrypto();
  if (crypto?.getRandomValues) return crypto.getRandomValues(bytes);
  // Last resort for runtimes without Web Crypto: ids need to be unique, not secret.
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** A random RFC 4122 version 4 id, the shape every persisted Host and route id has. */
export function newUuid(): string {
  const crypto = webCrypto();
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = randomBytes();
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  let text = '';
  bytes.forEach((byte, index) => {
    if (index === 4 || index === 6 || index === 8 || index === 10) text += '-';
    text += (HEX[byte >> 4] ?? '0') + (HEX[byte & 15] ?? '0');
  });
  return text;
}
