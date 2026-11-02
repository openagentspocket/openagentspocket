import { t } from '@openagentspocket/i18n';
import { Stack, useRouter } from 'expo-router';
import { PairingScreen } from '@/features/hosts/PairingScreen';

/** `/hosts/pair`: scan or paste a Pairing Code. */
export default function PairRoute() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: t('Scan to Pair') }} />
      <PairingScreen
        onPaired={(id) => router.replace({ pathname: '/hosts/[id]', params: { id } })}
        onAddManually={() => router.replace('/hosts/form')}
      />
    </>
  );
}
