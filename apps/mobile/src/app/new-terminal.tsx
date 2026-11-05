import { useRouter } from 'expo-router';
import { NewTerminalScreen } from '@/features/new-agent/NewTerminalScreen';

/** `/new-terminal`: the New Terminal form; Open replaces it with the shell. */
export default function NewTerminalRoute() {
  const router = useRouter();
  return (
    <NewTerminalScreen
      onCancel={() => router.back()}
      onOpen={({ hostId, workspaceId, cwd, label }) =>
        router.replace({
          pathname: '/terminal',
          params: { host: hostId, workspace: workspaceId, cwd, ...(label ? { label } : {}) },
        })
      }
    />
  );
}
