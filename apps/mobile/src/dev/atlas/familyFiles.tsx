// Atlas entries of Files, Changes and Ports (files.*, changes.*, browser.*). Owned by its UX family task, so parallel tasks never edit the same registry file.
import ChangesRoute from '@/app/changes';
import FileDiffRoute from '@/app/changes/diff';
import FilesRoute from '@/app/files';
import PortsRoute from '@/app/ports';
import type { AtlasEntry } from './entries';

export const filesEntries: Readonly<Record<string, AtlasEntry>> = {
  'files.browser': { render: () => <FilesRoute /> },
  'browser.ports': { render: () => <PortsRoute /> },
  'changes.list': { render: () => <ChangesRoute /> },
  'changes.file-diff': { render: () => <FileDiffRoute /> },
};
