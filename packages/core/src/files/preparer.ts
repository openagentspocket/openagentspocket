import { FilePreparationError } from './errors';
import { FILE_LIMITS } from './limits';
import { safeExtension } from './path';
import type { LocalFiles } from './ports';

export interface PreparedFile {
  /** The private copy in app storage. */
  uri: string;
  extension: string;
  byteCount: number;
}

const randomId = () =>
  Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/**
 * Copies a picker result into private app storage under a random local name. The copy keeps
 * retries independent of the provider's grant; the original filename is not kept locally.
 */
export class FilePreparer {
  constructor(
    private readonly local: LocalFiles,
    private readonly options: { maxBytes?: number; folder?: string; newId?: () => string } = {},
  ) {}

  async prepare(sourceUri: string, extension: string): Promise<PreparedFile> {
    const max = this.options.maxBytes ?? FILE_LIMITS.uploadBytes;
    const sourceSize = await this.local.size(sourceUri);
    if (sourceSize === null) throw new FilePreparationError('selectionUnavailable');
    if (sourceSize > max) throw new FilePreparationError('sourceTooLarge');
    const safe = safeExtension(extension);
    const id = (this.options.newId ?? randomId)();
    const name = safe ? `${id}.${safe}` : id;
    let copy: string;
    try {
      copy = await this.local.copyInto(sourceUri, this.options.folder ?? 'prepared', name);
    } catch {
      throw new FilePreparationError('localStorageFailed');
    }
    const size = await this.local.size(copy).catch(() => null);
    if (size === null || size <= 0 || size > max) {
      await this.local.remove(copy).catch(() => {});
      throw new FilePreparationError(
        size !== null && size > max ? 'sourceTooLarge' : 'selectionUnavailable',
      );
    }
    return { uri: copy, extension: safe, byteCount: size };
  }

  /** Removes every prepared copy a crash or a kill left behind (call at launch). */
  cleanupRemnants(): Promise<void> {
    return this.local.removeFolder(this.options.folder ?? 'prepared').catch(() => {});
  }
}
