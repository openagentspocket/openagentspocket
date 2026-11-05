import { DirectoryBrowserSheet } from '@/features/new-agent/DirectoryBrowserSheet';
import { useNewAgentServices } from '@/features/new-agent/services';
import { AppScreen } from '@/navigation/AppScreen';

const noop = () => {};

/** The directory browser open over an empty canvas, as the Swift atlas shows it. */
export function DirectoryBrowserDemo() {
  const services = useNewAgentServices();
  return (
    <AppScreen testID="directory-browser-demo">
      <DirectoryBrowserSheet
        visible
        lister={services.directoryLister('demo')}
        onSelect={noop}
        onClose={noop}
      />
    </AppScreen>
  );
}
