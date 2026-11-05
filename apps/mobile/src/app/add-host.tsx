import { useRouter } from 'expo-router';
import { AddHostSheet } from '@/features/hosts/AddHostSheet';
import { hrefs } from '@/navigation/hrefs';

/** `/add-host`: the choice sheet over whatever screen asked to add a Host. */
export default function AddHostRoute() {
  const router = useRouter();
  return (
    <AddHostSheet
      onClose={() => router.back()}
      onEasyPair={() => router.replace(hrefs.easyPair())}
      onAddManually={() => router.replace(hrefs.hostForm())}
    />
  );
}
