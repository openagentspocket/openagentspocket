import { useLocalSearchParams } from 'expo-router';
import { LicenseNoticeScreen } from '@/settings/LicenseNoticeScreen';

export default function LicenseNotice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LicenseNoticeScreen id={id} />;
}
