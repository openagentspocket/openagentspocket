import { useEffect, useState } from 'react';
import FileDiffRoute from '@/app/changes/diff';
import PreviewRoute from '@/app/ports/preview';
import { DEMO_READ } from '@/changes/demo';
import { changesStoreFor } from '@/changes/registry';
import { askLeavePreview } from '@/ports/leaveDialog';
import { portsStoreFor } from '@/ports/registry';

/** changes.file-diff: the demo checkout's first modified file opened, as a tap in the list does. */
export function FileDiffDemo() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const store = changesStoreFor('demo');
    void store.appear().then(() => {
      const file = DEMO_READ.changes.files.find((entry) => entry.kind === 'modified');
      if (file) store.openDiff(file);
      setReady(true);
    });
  }, []);
  return ready ? <FileDiffRoute /> : null;
}

/** browser.preview: the demo Host's dev server opened, as a tap on its row does. */
export function PreviewDemo({ leaving = false }: { leaving?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const store = portsStoreFor({ hostId: 'demo', hostName: 'demo' });
    store.start();
    store.openPort(5173);
    if (leaving) void askLeavePreview('docs.example.com', store.hostName);
    setReady(true);
  }, [leaving]);
  return ready ? <PreviewRoute /> : null;
}
