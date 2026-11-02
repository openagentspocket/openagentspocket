import type { FileDelivery } from '@openagentspocket/core';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hands a downloaded copy to the system. A preview opens the system viewer (Quick Look on iOS)
 * when it can render the file; everything else, and Save to Files, goes through the share sheet,
 * which carries "Save to Files" (iOS) and the system save targets (Android).
 */
export async function deliver(delivery: FileDelivery): Promise<void> {
  if (delivery.intent === 'preview') {
    const file = new File(delivery.uri);
    if (await File.canPreview(file)) return File.preview(file);
  }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(delivery.uri);
}
