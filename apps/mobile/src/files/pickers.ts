import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/** What a picker returns: a readable local file, its display name and extension. */
export interface Picked {
  uri: string;
  name: string;
  extension: string;
}

const extensionOf = (name: string) => (name.includes('.') ? (name.split('.').pop() ?? '') : '');

/** The system document picker; null when the user cancels. The file is copied into the cache. */
export async function pickDocument(): Promise<Picked | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, name: asset.name, extension: extensionOf(asset.name) } : null;
}

/**
 * The photo library; null on cancel. The picker re-encodes the photo without its metadata (EXIF,
 * location) at 0.8 quality, which keeps an upload small and private.
 */
export async function pickPhoto(): Promise<Picked | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    exif: false,
    quality: 0.8,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const name = asset.fileName ?? 'photo.jpg';
  return { uri: asset.uri, name, extension: extensionOf(asset.uri) || extensionOf(name) || 'jpg' };
}
