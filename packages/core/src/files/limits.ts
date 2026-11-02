const MIB = 1024 * 1024;

/** The file browser's size caps (parity F6 decision 4). */
export const FILE_LIMITS = {
  /** Tapping a file at most this large downloads it and opens the viewer. */
  previewBytes: 25 * MIB,
  /** Nothing larger is downloaded at all. */
  downloadBytes: 512 * MIB,
  /** Sharing or saving a larger file asks first. */
  confirmBytes: 64 * MIB,
  /** The attachment cap, shared with Chat and the Composer. */
  uploadBytes: 64 * MIB,
  /** One listing shows at most this many rows. */
  listingEntries: 1000,
  /** The read of one directory stops after this many names. */
  listingScanned: 20_000,
  /** An upload's `.part` untouched this long is a leftover (seconds). */
  stalePartAgeSeconds: 60 * 60,
  /** Bytes per SFTP read of a download. */
  downloadChunkBytes: 256 * 1024,
  /** Download progress is reported at most this often (ms). */
  progressIntervalMs: 250,
} as const;
