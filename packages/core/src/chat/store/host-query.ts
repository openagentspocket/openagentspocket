// The port through which Chat runs a program's read-only store queries on the Host (Swift
// `Transport.queryOpenCode`, ADR 0025). Core never imports the transport: the app adapts its bounded
// script exec to `ChatHostScriptRunner`, and `storeQueryRunner` turns it into the `queryStore` that
// `ChatHostFiles` offers. Tests use a fake runner or a fake `queryStore`.

import { makeNonce, parseStoreOutput } from './output';
import type { ChatStore, StoreQuery, StoreQueryResponse, StoreScriptOptions } from './query';

export interface ChatHostScriptResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  exitStatus: number;
}

/**
 * Runs one POSIX shell script on the Host in one bounded exec and returns what it printed. A run
 * past its deadline rejects with the transport's own timeout failure; scripts of one feature run
 * one at a time.
 */
export type ChatHostScriptRunner = (script: Uint8Array) => Promise<ChatHostScriptResult>;

export interface StoreQueryRunnerOptions extends StoreScriptOptions {
  /**
   * The random source of each query's nonce. The app passes the OS's secure bytes: the default
   * needs Web Crypto, which Hermes lacks ("crypto.getRandomValues must be defined").
   */
  random?: (length: number) => Uint8Array;
  /** Overrides the nonce source (tests). */
  nonce?: () => string;
}

/** `ChatHostFiles.queryStore` over a script runner: builds the script, runs it, parses its markers. */
export function storeQueryRunner(
  run: ChatHostScriptRunner,
  options: StoreQueryRunnerOptions = {},
): (store: ChatStore, query: StoreQuery) => Promise<StoreQueryResponse> {
  return async (store, query) => {
    const nonce = options.nonce ? options.nonce() : makeNonce(options.random);
    const result = await run(
      store.script(query, nonce, { reader: options.reader, pathExport: options.pathExport }),
    );
    return parseStoreOutput(store, result.stdout, result.stderr, result.exitStatus, nonce, query);
  };
}
