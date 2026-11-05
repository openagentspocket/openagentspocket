// Atlas entries of Files, Changes and Ports (files.*, changes.*, browser.*). Owned by its UX family task, so parallel tasks never edit the same registry file.
import ChangesRoute from '@/app/changes';
import FilesRoute from '@/app/files';
import PortsRoute from '@/app/ports';
import { askCollisionChoice } from '@/files/useFileDialogs';
import type { AtlasEntry } from './entries';
import { FileDiffDemo, PreviewDemo } from './FilesPortsDemos';

export const filesEntries: Readonly<Record<string, AtlasEntry>> = {
  'files.browser': { render: () => <FilesRoute /> },
  'files.quick-look': { script: { press: ['file-notes 2.txt'] }, render: () => <FilesRoute /> },
  'files.share-sheet': {
    script: { longPress: 'file-notes 2.txt', thenPress: ['action-menu-share'] },
    render: () => <FilesRoute />,
  },
  'files.save-to-files': {
    script: { longPress: 'file-notes 2.txt', thenPress: ['action-menu-save'] },
    render: () => <FilesRoute />,
  },
  'files.download-confirm': { script: { press: ['file-.env'] }, render: () => <FilesRoute /> },
  'files.download-confirm--secret': {
    script: { press: ['file-.env'] },
    render: () => <FilesRoute />,
  },
  'files.upload-pickers': { script: { press: ['files-add'] }, render: () => <FilesRoute /> },
  'files.upload-collision': {
    script: {
      run: () =>
        void askCollisionChoice({
          upload: { name: 'notes 2.txt' },
          existingKind: 'file',
          canReplace: true,
        } as Parameters<typeof askCollisionChoice>[0]),
    },
    render: () => <FilesRoute />,
  },
  'files.rename-alert': {
    script: { longPress: 'file-notes 2.txt', thenPress: ['action-menu-rename'] },
    render: () => <FilesRoute />,
  },
  'files.delete-confirm': {
    script: { longPress: 'file-notes 2.txt', thenPress: ['action-menu-delete'] },
    render: () => <FilesRoute />,
  },
  'browser.ports': { render: () => <PortsRoute /> },
  'browser.open-port': { script: { press: ['ports-open-port'] }, render: () => <PortsRoute /> },
  'browser.preview': { render: () => <PreviewDemo /> },
  'browser.leave-confirm': { render: () => <PreviewDemo leaving /> },
  'changes.list': { render: () => <ChangesRoute /> },
  'changes.file-diff': { render: () => <FileDiffDemo /> },
};
