import type { LocalFiles, LocalWriter } from './ports';

/** An in-memory `LocalFiles` for tests and Demo mode. Uris look like `local://<folder>/<name>`. */
export class FakeLocalFiles implements LocalFiles {
  readonly files = new Map<string, Uint8Array>();

  /** Test helper: a file the user picked from a provider. */
  put(uri: string, data: Uint8Array): string {
    this.files.set(uri, data);
    return uri;
  }

  async makeDestination(folder: string, name: string): Promise<string> {
    return `local://${folder}/${name}`;
  }

  async openWriter(uri: string): Promise<LocalWriter> {
    const chunks: Uint8Array[] = [];
    this.files.set(uri, new Uint8Array(0));
    return {
      append: async (chunk) => {
        chunks.push(chunk);
        this.files.set(uri, concat(chunks));
      },
      close: async () => {},
    };
  }

  async readAll(uri: string): Promise<Uint8Array> {
    const data = this.files.get(uri);
    if (!data) throw new Error('missing');
    return data;
  }

  async size(uri: string): Promise<number | null> {
    return this.files.get(uri)?.length ?? null;
  }

  async copyInto(sourceUri: string, folder: string, name: string): Promise<string> {
    const data = this.files.get(sourceUri);
    if (!data) throw new Error('missing');
    return this.put(`local://${folder}/${name}`, data.slice());
  }

  async remove(uri: string): Promise<void> {
    for (const key of [...this.files.keys()]) {
      if (key === uri || key.startsWith(`${uri}/`)) this.files.delete(key);
    }
  }

  async removeFolder(folder: string): Promise<void> {
    return this.remove(`local://${folder}`);
  }

  parentOf(uri: string): string {
    return uri.slice(0, uri.lastIndexOf('/'));
  }
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
