// Agentico update server (ADR 0028): serves pre-signed Expo Updates from an R2 bucket.
//
// Two routes. GET /manifest answers the Expo Updates protocol v1 request: it picks what is published
// for (expo-platform, expo-runtime-version, channel), where the channel is the `channel` key of the
// Expo-Extra-Params header (absent: production), and returns the STORED body (manifest or
// directive) with the STORED expo-signature, byte for byte, in a multipart/mixed response; with
// nothing published it answers 204, the protocol's no-op. GET /assets/<sha256> serves immutable,
// content-addressed asset bytes.
//
// The Worker holds no secret and never signs: the publish script signs on the owner's machine
// (scripts/publish-update.mjs). It keeps nothing about a request and writes nothing to any log; the
// README lists what a request carries and what is discarded.

import {
  ASSET_CACHE_CONTROL,
  ASSET_ID_PATTERN,
  CHANNEL_PARAM,
  DEFAULT_CHANNEL,
  isChannel,
  isPlatform,
  isRuntimeVersion,
  MANIFEST_CACHE_CONTROL,
  multipartBody,
  PROTOCOL_VERSION,
  parsePointer,
  parseSfvDictionary,
  SFV_VERSION,
  storageKeys,
} from './protocol.js';

const PROTOCOL_HEADERS = {
  'expo-protocol-version': PROTOCOL_VERSION,
  'expo-sfv-version': SFV_VERSION,
  'cache-control': MANIFEST_CACHE_CONTROL,
};

function error(status, code, headers = {}) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

/**
 * Whether an Accept header admits multipart/mixed (the only structure served: it carries the
 * signature as a part header and allows directives). No header admits everything (RFC 9110).
 */
export function acceptsMultipart(accept) {
  if (accept === null || accept.trim() === '') return true;
  return accept.split(',').some((range) => {
    const [type, ...params] = range.split(';').map((s) => s.trim().toLowerCase());
    const q = params.find((p) => p.startsWith('q='));
    if (q && Number(q.slice(2)) === 0) return false;
    return type === 'multipart/mixed' || type === 'multipart/*' || type === '*/*';
  });
}

/** The channel a request asks for, or null when Expo-Extra-Params is malformed or names another. */
export function requestedChannel(extraParams) {
  if (extraParams === null) return DEFAULT_CHANNEL;
  const params = parseSfvDictionary(extraParams);
  if (!params) return null;
  const channel = params[CHANNEL_PARAM];
  if (channel === undefined) return DEFAULT_CHANNEL;
  return isChannel(channel) ? channel : null;
}

async function handleManifest(request, bucket) {
  const headers = request.headers;
  // Only protocol 1 is served; the spec answers an incompatible request with 406.
  if (headers.get('expo-protocol-version') !== PROTOCOL_VERSION)
    return error(406, 'unsupported_protocol_version');
  if (!acceptsMultipart(headers.get('accept'))) return error(406, 'multipart_required');
  const platform = headers.get('expo-platform');
  if (!isPlatform(platform)) return error(400, 'bad_platform');
  const runtimeVersion = headers.get('expo-runtime-version');
  if (!isRuntimeVersion(runtimeVersion)) return error(400, 'bad_runtime_version');
  const channel = requestedChannel(headers.get('expo-extra-params'));
  if (!channel) return error(400, 'bad_channel');

  const noUpdate = () => new Response(null, { status: 204, headers: PROTOCOL_HEADERS });
  const pointerObject = await bucket.get(storageKeys.pointer(platform, runtimeVersion, channel));
  if (!pointerObject) return noUpdate();
  const pointer = parsePointer(await pointerObject.text());
  if (!pointer) return error(500, 'bad_pointer');
  // The device already runs it: nothing to send. The header is read here and nowhere else.
  if (pointer.kind === 'manifest' && headers.get('expo-current-update-id') === pointer.id)
    return noUpdate();

  const [body, signature] = await Promise.all([
    bucket.get(storageKeys.body(pointer.id)),
    bucket.get(storageKeys.signature(pointer.id)),
  ]);
  if (!body || !signature) return error(500, 'incomplete_update');
  const signatureValue = (await signature.text()).trim();
  if (!signatureValue || /[\r\n]/.test(signatureValue)) return error(500, 'bad_signature_object');

  const { boundary, body: multipart } = multipartBody([
    {
      name: pointer.kind,
      contentType: 'application/json',
      headers: { 'expo-signature': signatureValue },
      body: new Uint8Array(await body.arrayBuffer()),
    },
  ]);
  return new Response(multipart, {
    status: 200,
    headers: { ...PROTOCOL_HEADERS, 'content-type': `multipart/mixed; boundary=${boundary}` },
  });
}

async function handleAsset(request, bucket, id) {
  if (!ASSET_ID_PATTERN.test(id)) return error(404, 'not_found');
  const object = await bucket.get(storageKeys.asset(id));
  if (!object) return error(404, 'not_found');
  const headers = {
    'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    'content-length': String(object.size),
    'cache-control': ASSET_CACHE_CONTROL,
    etag: `"${id}"`,
  };
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

export function createUpdatesServer() {
  return {
    /**
     * @param {Request} request
     * @param {{UPDATES?: {get(key: string): Promise<any>}}} env
     */
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      const assetMatch = /^\/assets\/([^/]+)$/.exec(pathname);
      if (pathname !== '/manifest' && !assetMatch) return error(404, 'not_found');
      const allowed = assetMatch ? ['GET', 'HEAD'] : ['GET'];
      if (!allowed.includes(request.method))
        return error(405, 'method_not_allowed', { allow: allowed.join(', ') });
      const bucket = env?.UPDATES;
      if (!bucket) return error(500, 'server_misconfigured');
      return assetMatch
        ? handleAsset(request, bucket, assetMatch[1])
        : handleManifest(request, bucket);
    },
  };
}

export default createUpdatesServer();
