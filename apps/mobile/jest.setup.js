// Screens set their navigator header through `Stack.Screen`, which needs a navigator; component
// tests have none, so the header component is a no-op there.
jest.mock('./src/navigation/NavigatorHeader', () => ({ NavigatorHeader: () => null }));
