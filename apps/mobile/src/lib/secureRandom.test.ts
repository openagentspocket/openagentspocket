import { secureRandomBytes } from './secureRandom';

const mockGetRandomBytes = jest.fn((length: number) => Uint8Array.from({ length }, (_, i) => i));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (length: number) => mockGetRandomBytes(length),
}));

describe('secureRandomBytes', () => {
  it('asks the OS source for exactly the requested length', () => {
    const bytes = secureRandomBytes(32);
    expect(bytes).toHaveLength(32);
    expect(mockGetRandomBytes).toHaveBeenCalledWith(32);
  });
});
