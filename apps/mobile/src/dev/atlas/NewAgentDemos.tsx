import { Screen } from '@openagentspocket/ui';
import { DirectoryBrowserSheet } from '@/features/new-agent/DirectoryBrowserSheet';
import { useNewAgentServices } from '@/features/new-agent/services';

const noop = () => {};

/** The directory browser open over an empty canvas, as the Swift atlas shows it. */
export function DirectoryBrowserDemo() {
  const services = useNewAgentServices();
  return (
    <Screen testID="directory-browser-demo">
      <DirectoryBrowserSheet
        visible
        lister={services.directoryLister('demo')}
        onSelect={noop}
        onClose={noop}
      />
    </Screen>
  );
}
