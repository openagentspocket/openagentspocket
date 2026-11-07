export interface NetworkPath {
  readonly type?: string;
  readonly isConnected?: boolean;
}

/** Tells a move to another network from the repeats the system also reports. */
export class NetworkPathWatch {
  private last: string | undefined;

  /** True when the phone just reached a network its connections did not start on. */
  didMove(path: NetworkPath): boolean {
    const now = path.isConnected ? (path.type ?? 'UNKNOWN') : 'NONE';
    const before = this.last;
    this.last = now;
    return before !== undefined && now !== 'NONE' && now !== before;
  }
}

type ExpoNetwork = typeof import('expo-network');

/** Calls `onMove` on every move; a build without the module just never does. */
export function watchNetworkPath(onMove: () => void): () => void {
  let network: ExpoNetwork;
  try {
    network = require('expo-network') as ExpoNetwork;
  } catch {
    return () => {};
  }
  const watch = new NetworkPathWatch();
  void network.getNetworkStateAsync().then((path) => watch.didMove(path));
  const subscription = network.addNetworkStateListener((path) => {
    if (watch.didMove(path)) onMove();
  });
  return () => subscription.remove();
}
