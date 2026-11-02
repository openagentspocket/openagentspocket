import {
  type HostReading,
  WIDGET_SNAPSHOT_FILE,
  WidgetPublisher,
  type WidgetSnapshotPort,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';
import { type AppGroupStore, appGroup } from 'agentico-app-group';

/** Core's widget port over the App Group store. */
export function appGroupPort(store: AppGroupStore): WidgetSnapshotPort {
  return {
    writeSnapshot: (json) => store.writeFile(WIDGET_SNAPSHOT_FILE, json),
    reloadWidgets: (kinds) => store.reloadWidgets(kinds),
  };
}

let publisher: WidgetPublisher | undefined;

const translateNow = (key: string, args: readonly string[]) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

/** Pushes the Hosts' Usage readings to the widgets. A no-op where there are no widgets. */
export async function publishUsageWidgets(readings: readonly HostReading[]): Promise<void> {
  try {
    const store = appGroup();
    if (!store.available) return;
    publisher ??= new WidgetPublisher(appGroupPort(store), translateNow);
    await publisher.publish(readings);
  } catch {
    // The widgets keep their last snapshot (or the native module is absent, as in tests).
  }
}
