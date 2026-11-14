// An in-memory stand-in for the slice of the R2 bucket binding the Worker and the uploader use
// (get, put, head), for tests. Same shapes as R2: get resolves to null or an object with body,
// size, httpMetadata, text() and arrayBuffer().

export function createMemoryBucket() {
  /** @type {Map<string, {bytes: Uint8Array, httpMetadata: {contentType?: string}}>} */
  const objects = new Map();
  const view = (key) => {
    const entry = objects.get(key);
    if (!entry) return null;
    const { bytes, httpMetadata } = entry;
    return {
      key,
      size: bytes.byteLength,
      httpMetadata: { ...httpMetadata },
      get body() {
        return new Blob([bytes]).stream();
      },
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer,
    };
  };
  return {
    objects,
    async get(key) {
      return view(key);
    },
    async head(key) {
      return view(key);
    },
    async put(key, value, options = {}) {
      const bytes =
        typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      objects.set(key, { bytes: bytes.slice(), httpMetadata: { ...options.httpMetadata } });
      return view(key);
    },
  };
}
