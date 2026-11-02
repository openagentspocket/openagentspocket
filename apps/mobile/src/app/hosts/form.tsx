import { useLocalSearchParams, useRouter } from 'expo-router';
import { HostFormScreen } from '@/features/hosts/HostFormScreen';
import { useInitialDraft } from '@/features/hosts/useInitialDraft';

/** `/hosts/form?edit=<id>` or `?duplicate=<id>`: add, edit or duplicate a Host. */
export default function HostFormRoute() {
  const { edit, duplicate } = useLocalSearchParams<{ edit?: string; duplicate?: string }>();
  const router = useRouter();
  const initial = useInitialDraft(edit, duplicate);
  if (!initial) return null;
  return (
    <HostFormScreen
      initial={initial}
      onCancel={() => router.back()}
      onSaved={(hostId, created) =>
        created
          ? router.replace({ pathname: '/hosts/[id]', params: { id: hostId } })
          : router.back()
      }
    />
  );
}
