import { EmptyState, Screen } from '@openagentspocket/ui';
import { useLocalSearchParams } from 'expo-router';
import { AtlasFrame } from '@/dev/atlas/AtlasFrame';
import { atlasEntries } from '@/dev/atlas/entries';

/** `/__atlas/<swift screen id>`: one RN screen in a fixed state with deterministic demo data. */
export default function AtlasRoute() {
  const { atlasId } = useLocalSearchParams<{ atlasId: string }>();
  const entry = atlasEntries[atlasId];
  if (!entry) {
    return (
      <Screen>
        <EmptyState icon="info" title={`No RN screen for ${atlasId}`} />
      </Screen>
    );
  }
  return (
    <AtlasFrame key={atlasId} data={entry.data ?? {}}>
      {entry.render()}
    </AtlasFrame>
  );
}
