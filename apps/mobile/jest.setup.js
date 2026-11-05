// The device key-value store is native; screens that read it at import time get an empty one.
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: () => null, setItemSync: () => {} },
}));

// Screens set their navigator header through `Stack.Screen`, which needs a navigator; component
// tests have none, so the header component is a no-op there.
jest.mock('./src/navigation/NavigatorHeader', () => ({ NavigatorHeader: () => null }));

// A gesture detector needs a GestureHandlerRootView, which component tests don't mount.
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }) => children,
}));
