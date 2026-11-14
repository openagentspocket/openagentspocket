// Expo Updates protocol v1 pieces shared by the Worker (src/worker.js) and the publish tooling
// (publish/): header names, the Expo SFV subset the protocol uses, the multipart body, the storage
// layout and the asset content types. Spec: https://docs.expo.dev/technical-specs/expo-updates-1/
//
// WebCrypto and plain JS only, so it runs unchanged on Cloudflare Workers and under Node.

export const PROTOCOL_VERSION = '1';
export const SFV_VERSION = '0';
export const PLATFORMS = ['ios', 'android'];
export const CHANNELS = ['beta', 'production'];
export const DEFAULT_CHANNEL = 'production';
// The protocol has no channel; the app sends one through Updates.setExtraParamAsync, which reaches
// the server as this key of the Expo-Extra-Params SFV dictionary (expo-updates FileDownloader).
export const CHANNEL_PARAM = 'channel';
export const SIGNATURE_ALG = 'rsa-v1_5-sha256';
export const DEFAULT_KEY_ID = 'main';

export const MANIFEST_CACHE_CONTROL = 'private, max-age=0';
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Runtime versions are fingerprint hashes (40 hex characters) today; the pattern also allows the
// strings a manual policy would produce, and nothing that could leave its storage prefix.
const RUNTIME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/;

export const isRuntimeVersion = (value) => typeof value === 'string' && RUNTIME_PATTERN.test(value);
export const isUpdateId = (value) => typeof value === 'string' && UUID_PATTERN.test(value);
export const isChannel = (value) => CHANNELS.includes(value);
export const isPlatform = (value) => PLATFORMS.includes(value);

// --- Storage layout (README "Storage layout") ----------------------------------------------------

export const storageKeys = {
  /** Immutable asset bytes, addressed by the lowercase hex SHA-256 of their content. */
  asset: (sha256Hex) => `assets/${sha256Hex}`,
  /** The exact signed bytes of a manifest or directive. */
  body: (id) => `updates/${id}/body`,
  /** The complete expo-signature value for those bytes, as the publish script produced it. */
  signature: (id) => `updates/${id}/signature`,
  /** What a (platform, runtime version, channel) is served now: `{ "kind", "id" }`. Written last. */
  pointer: (platform, runtimeVersion, channel) =>
    `channels/${platform}/${runtimeVersion}/${channel}`,
};

export const POINTER_KINDS = ['manifest', 'directive'];

/** @returns {{kind: 'manifest' | 'directive', id: string} | null} */
export function parsePointer(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || !POINTER_KINDS.includes(value.kind) || !isUpdateId(value.id)) return null;
  return { kind: value.kind, id: value.id };
}

// --- Asset content types -------------------------------------------------------------------------

export const LAUNCH_ASSET_CONTENT_TYPE = 'application/javascript';
const CONTENT_TYPES = {
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  otf: 'font/otf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  wav: 'audio/wav',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/** The MIME type for an asset extension as `metadata.json` lists it (`png`, no dot). */
export function contentTypeFor(ext) {
  return CONTENT_TYPES[String(ext).toLowerCase()] ?? 'application/octet-stream';
}

// --- Expo SFV (https://docs.expo.dev/technical-specs/expo-sfv-0/) --------------------------------

const KEY = /^[a-z*][a-z0-9_\-.*]*/;
const TOKEN = /^[A-Za-z*][A-Za-z0-9:/!#$%&'*+\-.^_`|~]*/;

/**
 * Parse an SFV dictionary of strings, tokens and booleans (all the protocol sends). A member with
 * no value is `true`. Returns null on anything malformed, so a caller can answer 400.
 *
 * @returns {Record<string, string | boolean> | null}
 */
export function parseSfvDictionary(input) {
  if (typeof input !== 'string') return null;
  const result = {};
  let rest = input.trim();
  if (rest === '') return result;
  while (rest.length) {
    const key = KEY.exec(rest)?.[0];
    if (!key) return null;
    rest = rest.slice(key.length);
    let value = true;
    if (rest.startsWith('=')) {
      rest = rest.slice(1);
      const item = parseItem(rest);
      if (!item) return null;
      value = item.value;
      rest = rest.slice(item.length);
    }
    // Parameters on a member (";a=b") are not used by the protocol: refuse them.
    result[key] = value;
    rest = rest.replace(/^[ \t]*/, '');
    if (!rest.length) break;
    if (!rest.startsWith(',')) return null;
    rest = rest.slice(1).replace(/^[ \t]*/, '');
    if (!rest.length) return null;
  }
  return result;
}

function parseItem(text) {
  if (text.startsWith('"')) {
    let value = '';
    for (let i = 1; i < text.length; i += 1) {
      const c = text[i];
      if (c === '\\') {
        const next = text[i + 1];
        if (next !== '"' && next !== '\\') return null;
        value += next;
        i += 1;
      } else if (c === '"') {
        return { value, length: i + 1 };
      } else {
        const code = c.charCodeAt(0);
        if (code < 0x20 || code > 0x7e) return null;
        value += c;
      }
    }
    return null;
  }
  if (text.startsWith('?1')) return { value: true, length: 2 };
  if (text.startsWith('?0')) return { value: false, length: 2 };
  const token = TOKEN.exec(text)?.[0];
  return token ? { value: token, length: token.length } : null;
}

/** Serialize a string as an SFV string item. */
export function sfvString(value) {
  if (!/^[\x20-\x7e]*$/.test(value)) throw new Error('SFV strings are printable ASCII only');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/** The expo-signature value: `sig="<base64>", keyid="<id>", alg="rsa-v1_5-sha256"`. */
export function signatureHeader(signatureBase64, keyId = DEFAULT_KEY_ID) {
  return `sig=${sfvString(signatureBase64)}, keyid=${sfvString(keyId)}, alg=${sfvString(SIGNATURE_ALG)}`;
}

// --- Multipart body (RFC 2046, the protocol's "Multipart response") ------------------------------

const encoder = new TextEncoder();
const CRLF = '\r\n';

/**
 * A multipart/mixed body with one part per entry. Part bodies are copied byte for byte; the
 * boundary is chosen so that it occurs in none of them.
 *
 * @param {{name: string, contentType: string, headers?: Record<string, string>, body: Uint8Array}[]} parts
 * @returns {{boundary: string, body: Uint8Array}}
 */
export function multipartBody(parts) {
  const boundary = pickBoundary(parts.map((p) => p.body));
  const chunks = [];
  for (const part of parts) {
    const headers = {
      'content-disposition': `form-data; name="${part.name}"`,
      'content-type': part.contentType,
      ...part.headers,
    };
    const head = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}${CRLF}`)
      .join('');
    chunks.push(
      encoder.encode(`--${boundary}${CRLF}${head}${CRLF}`),
      part.body,
      encoder.encode(CRLF),
    );
  }
  chunks.push(encoder.encode(`--${boundary}--${CRLF}`));
  return { boundary, body: concat(chunks) };
}

/**
 * Split a multipart body into parts as a client reads it: lowercase header names, body bytes
 * untouched. Returns null when the framing is broken.
 *
 * @returns {{headers: Record<string, string>, body: Uint8Array}[] | null}
 */
export function parseMultipart(body, boundary) {
  const delimiter = encoder.encode(`--${boundary}`);
  const crlf = encoder.encode(CRLF);
  const parts = [];
  let at = indexOf(body, delimiter);
  if (at === -1) return body.byteLength === 0 ? [] : null;
  for (;;) {
    at += delimiter.length;
    if (body[at] === 0x2d && body[at + 1] === 0x2d) return parts; // closing "--"
    if (indexOf(body, crlf, at) !== at) return null;
    at += crlf.length;
    const headerEnd = indexOf(body, encoder.encode(CRLF + CRLF), at);
    if (headerEnd === -1) return null;
    const headers = {};
    for (const line of new TextDecoder().decode(body.subarray(at, headerEnd)).split(CRLF)) {
      const colon = line.indexOf(':');
      if (colon < 1) return null;
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    const start = headerEnd + 4;
    const next = indexOf(body, encoder.encode(`${CRLF}--${boundary}`), start);
    if (next === -1) return null;
    parts.push({ headers, body: body.slice(start, next) });
    at = next + crlf.length;
  }
}

/** The `name` parameter of a part's content-disposition. */
export function partName(headers) {
  return /;\s*name="?([^";]+)"?/.exec(headers['content-disposition'] ?? '')?.[1] ?? null;
}

function pickBoundary(bodies) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const boundary = `expo-updates-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    const needle = encoder.encode(boundary);
    if (!bodies.some((body) => indexOf(body, needle) !== -1)) return boundary;
  }
}

export function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export function indexOf(haystack, needle, from = 0) {
  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
