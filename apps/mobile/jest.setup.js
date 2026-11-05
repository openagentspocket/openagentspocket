// The device key-value store is native; screens that read it at import time get an empty one.
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: () => null, setItemSync: () => {} },
}));

// Screens set their navigator header through `Stack.Screen`, which needs a navigator; component
// tests have none, so the header component is a no-op there.
jest.mock('./src/navigation/NavigatorHeader', () => ({ NavigatorHeader: () => null }));

// Its deprecated DrawerLayoutAndroid export warns when read, so it is left out of the copy.
jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');
  const copy = { __esModule: true, GestureDetector: ({ children }) => children };
  for (const key of Object.keys(actual)) {
    if (key !== 'DrawerLayoutAndroid' && key !== 'GestureDetector') copy[key] = actual[key];
  }
  return copy;
});
