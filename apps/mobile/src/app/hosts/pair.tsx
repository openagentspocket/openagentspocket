import { useRouter } from 'expo-router';
import { PairingScreen } from '@/features/hosts/PairingScreen';
import { hrefs } from '@/navigation/hrefs';

/** `/hosts/pair`: scan or paste a Pairing Code. */
export default function PairRoute() {
  const router = useRouter();
  return (
    <PairingScreen
      onCancel={() => router.back()}
      onPaired={(id) => router.replace({ pathname: '/hosts/[id]', params: { id } })}
      onAddManually={() => router.replace(hrefs.hostForm())}
      onOpenGuide={() => router.push(hrefs.setupGuide())}
    />
  );
}
