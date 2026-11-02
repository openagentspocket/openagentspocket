import { Screen, Text } from '@openagentspocket/ui';
import { Link, Stack } from 'expo-router';
import { atlasEntries } from '@/dev/atlas/entries';

/** `/__atlas`: every mapped screen id, one tap each. */
export default function AtlasIndex() {
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Atlas' }} />
      {Object.keys(atlasEntries).map((id) => (
        <Link key={id} href={{ pathname: '/__atlas/[atlasId]', params: { atlasId: id } }}>
          <Text>{id}</Text>
        </Link>
      ))}
    </Screen>
  );
}
