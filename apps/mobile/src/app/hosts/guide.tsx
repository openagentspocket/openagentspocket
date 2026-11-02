import { useRouter } from 'expo-router';
import { SetupGuideScreen } from '@/features/hosts/SetupGuideScreen';

/** `/hosts/guide`: the Setup Guide, pushed inside the Hosts sheet. */
export default function SetupGuideRoute() {
  const router = useRouter();
  return <SetupGuideScreen onBack={() => router.back()} />;
}
