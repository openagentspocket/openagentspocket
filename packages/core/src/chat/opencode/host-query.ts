// The port through which Chat runs OpenCode's read-only store queries on the Host (Swift
// `Transport.queryOpenCode`, ADR 0025). Core never imports the transport: the app adapts its bounded
// script exec to `ChatHostScriptRunner`, and `openCodeQueryRunner` turns it into the
// `queryOpenCode` that `ChatHostFiles` offers. Tests use a fake runner or a fake `queryOpenCode`.

import { makeNonce, type OpenCodeReader, openCodeScript, parseOpenCodeOutput } from './probe';
import type { OpenCodeQuery, OpenCodeQueryResponse } from './query';

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

export interface OpenCodeQueryRunnerOptions {
  reader?: OpenCodeReader;
  /** Overrides the shell line that extends `PATH` (tests). */
  pathExport?: string;
  /** Overrides the nonce source (tests). */
  nonce?: () => string;
}

/** `ChatHostFiles.queryOpenCode` over a script runner: builds the script, runs it, parses its markers. */
export function openCodeQueryRunner(
  run: ChatHostScriptRunner,
  options: OpenCodeQueryRunnerOptions = {},
): (query: OpenCodeQuery) => Promise<OpenCodeQueryResponse> {
  return async (query) => {
    const nonce = (options.nonce ?? makeNonce)();
    const result = await run(
      openCodeScript(query, nonce, { reader: options.reader, pathExport: options.pathExport }),
    );
    return parseOpenCodeOutput(result.stdout, result.stderr, result.exitStatus, nonce, query);
  };
}
