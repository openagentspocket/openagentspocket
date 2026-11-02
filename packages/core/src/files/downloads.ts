import type { LocalFiles } from './ports';

/**
 * The phone-side copies of one browser's downloads: one folder per browser, one sub-folder per
 * download so two files of the same name stay apart, all removed when the browser closes. The name
 * keeps its extension so the system viewer picks a renderer.
 */
export class FileBrowserDownloads {
  private counter = 0;

  constructor(
    private readonly local: LocalFiles,
    readonly folder: string,
  ) {}

  makeDestination(name: string): Promise<string> {
    this.counter += 1;
    return this.local.makeDestination(`${this.folder}/${this.counter}`, name);
  }

  /** Removes one download's folder once it is no longer shown or shared. */
  remove(uri: string): Promise<void> {
    return this.local.remove(this.local.parentOf(uri)).catch(() => {});
  }

  removeAll(): Promise<void> {
    return this.local.removeFolder(this.folder).catch(() => {});
  }
}
