export function requireNativeModule(name: string): never {
  throw new Error(`native module ${name} is not available in unit tests`);
}
