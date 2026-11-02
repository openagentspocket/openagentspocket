import { useLocalSearchParams } from 'expo-router';
import { useComposition } from '@/composition/CompositionProvider';
import { FilesScreen } from '@/files/FilesScreen';

/**
 * Files: browse, download, upload, rename and delete on a Host over SFTP. `/files?host=<id>`
 * opens a live Host (at `path` when given); without a live Host it browses the demo one.
 */
export default function FilesRoute() {
  const { host, path } = useLocalSearchParams<{ host?: string; path?: string }>();
  const composition = useComposition();
  const source = host ? composition?.fileSource(host, path) : undefined;
  return <FilesScreen source={source} />;
}
