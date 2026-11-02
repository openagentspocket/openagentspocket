import type { LocalFiles, LocalWriter } from '@openagentspocket/core';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

/**
 * The phone's sandbox for the file browser, over expo-file-system: downloaded copies and prepared
 * uploads live in the cache directory (the system may clear it, and iOS keeps it out of backups).
 */
export class ExpoLocalFiles implements LocalFiles {
  private readonly root = new Directory(Paths.cache, 'agentico-files');

  private folderFor(folder: string): Directory {
    const directory = new Directory(this.root, folder);
    directory.create({ intermediates: true, idempotent: true });
    return directory;
  }

  async makeDestination(folder: string, name: string): Promise<string> {
    return new File(this.folderFor(folder), name).uri;
  }

  async openWriter(uri: string): Promise<LocalWriter> {
    const file = new File(uri);
    file.create({ overwrite: true });
    const handle = file.open(FileMode.WriteOnly);
    return {
      append: (chunk) => handle.writeBytes(chunk),
      close: async () => handle.close(),
    };
  }

  readAll(uri: string): Promise<Uint8Array> {
    return new File(uri).bytes();
  }

  async size(uri: string): Promise<number | null> {
    const file = new File(uri);
    return file.exists ? file.size : null;
  }

  async copyInto(sourceUri: string, folder: string, name: string): Promise<string> {
    const destination = new File(this.folderFor(folder), name);
    await new File(sourceUri).copy(destination);
    return destination.uri;
  }

  async remove(uri: string): Promise<void> {
    const file = new File(uri);
    if (file.exists) return file.delete();
    const directory = new Directory(uri);
    if (directory.exists) directory.delete();
  }

  async removeFolder(folder: string): Promise<void> {
    const directory = new Directory(this.root, folder);
    if (directory.exists) directory.delete();
  }

  parentOf(uri: string): string {
    return new File(uri).parentDirectory.uri;
  }
}
