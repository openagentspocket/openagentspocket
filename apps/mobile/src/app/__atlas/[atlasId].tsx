import { EmptyState } from '@openagentspocket/ui';
import { useLocalSearchParams } from 'expo-router';
import { AtlasActions } from '@/dev/atlas/AtlasActions';
import { AtlasFrame } from '@/dev/atlas/AtlasFrame';
import { atlasEntries } from '@/dev/atlas/entries';
import { AppScreen } from '@/navigation/AppScreen';

/** `/__atlas/<swift screen id>`: one RN screen in a fixed state with deterministic demo data. */
export default function AtlasRoute() {
  const { atlasId } = useLocalSearchParams<{ atlasId: string }>();
  const entry = atlasEntries[atlasId];
  if (!entry) {
    return (
      <AppScreen>
        <EmptyState icon="info" title={`No RN screen for ${atlasId}`} />
      </AppScreen>
    );
  }
  return (
    <AtlasFrame key={atlasId} data={entry.data ?? {}}>
      <AtlasActions script={entry.script ?? {}}>{entry.render()}</AtlasActions>
    </AtlasFrame>
  );
}
