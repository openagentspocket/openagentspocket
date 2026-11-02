import { useLocalSearchParams, useRouter } from 'expo-router';
import { RoutePageScreen } from '@/features/hosts/RoutePageScreen';

/** `/hosts/route?index=<n>` edits a route of the open Host form; `?new=1` adds one. */
export default function HostRouteRoute() {
  const { index } = useLocalSearchParams<{ index?: string }>();
  const router = useRouter();
  return (
    <RoutePageScreen
      index={index === undefined ? 'new' : Number(index)}
      onBack={() => router.back()}
    />
  );
}
