import { Redirect, useLocalSearchParams } from 'expo-router';
import { LiveActivityDemoScreen } from '@/dev/LiveActivityDemoScreen';

const STEPS = ['start', 'update', 'end'] as const;

/** Dev-only. Open with `openagentspocket:///__live-activity?step=start` (or update, end). */
export default function LiveActivityDemoRoute() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  if (!__DEV__) return <Redirect href="/" />;
  return <LiveActivityDemoScreen autoStep={STEPS.find((s) => s === step) ?? null} />;
}
