import { Text } from '@openagentspocket/ui';
import { Link, Stack } from 'expo-router';
import { atlasEntries } from '@/dev/atlas/entries';
import { AppScreen } from '@/navigation/AppScreen';

/** `/__atlas`: every mapped screen id, one tap each. */
export default function AtlasIndex() {
  return (
    <AppScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Atlas' }} />
      {Object.keys(atlasEntries).map((id) => (
        <Link key={id} href={{ pathname: '/__atlas/[atlasId]', params: { atlasId: id } }}>
          <Text>{id}</Text>
        </Link>
      ))}
    </AppScreen>
  );
}
