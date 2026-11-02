import {
  failWith,
  type HerdrEndpoint,
  type PluginStep,
  renderHerdrCommand,
} from '@openagentspocket/core';
import {
  NODE_PROBE_SCRIPT,
  type NodeToolchainProblem,
  nodeToolchainProblem,
  wrappingBareHerdrWithNode,
} from './node-toolchain';
import { launcherCommand, missingBinaryError, wrappingBareHerdr } from './shell';

/** herdr failed or refused one plugin step it ran through its CLI. */
export class PluginStepError extends Error {
  override readonly name = 'PluginStepError';
  /** What herdr printed, stderr first: the CLI reports failures there. */
  readonly output: string;

  constructor(
    readonly step: PluginStep,
    readonly exitCode: number,
    stderr: string,
    stdout: string,
  ) {
    super(`PluginStepError.${step.kind}`);
    this.output = stderr.trim() === '' ? stdout : stderr;
  }

  /** The build step (`npm ci`) failed, typically because SSH commands do not find Node.js. */
  get isBuildFailure(): boolean {
    return this.output.includes('plugin build failed');
  }

  /** git could not fetch the plugin branch. */
  get isDownloadFailure(): boolean {
    return this.output.includes('git failed');
  }

  /** The CLI is newer than the session's running server, which herdr asks to restart first. */
  get needsServerRestart(): boolean {
    return this.output.includes('restart the Herdr server');
  }

  /** The install stopped before herdr ran because the Host has no usable Node.js. */
  get nodeProblem(): NodeToolchainProblem | null {
    return nodeToolchainProblem(this.exitCode, this.output);
  }

  /**
   * herdr's own words without the install preview it prints first, or what the Host's shell setup
   * printed before them: from herdr's first `error` line when there is one, then the last
   * `lineLimit` non-empty lines, at most `characterLimit` long.
   */
  detail(lineLimit = 10, characterLimit = 800): string | null {
    let lines: string[] = [];
    let inPreview = false;
    for (const line of this.output.split('\n')) {
      if (line.startsWith('Plugin ') && line.endsWith('preview:')) {
        inPreview = true;
        continue;
      }
      if (inPreview && /^\s/.test(line)) continue;
      inPreview = false;
      if (line.trim() !== '') lines.push(line);
    }
    const firstError = lines.findIndex((line) => line.startsWith('error'));
    if (firstError >= 0) lines = lines.slice(firstError);
    const text = lines.slice(-lineLimit).join('\n');
    if (text === '') return null;
    return text.length > characterLimit ? `…${text.slice(-(characterLimit - 1))}` : text;
  }
}

export interface PluginCommandOptions {
  /** The Host's herdr session; blank is the default one. */
  readonly session: string;
  readonly endpoint: HerdrEndpoint | null;
  /** Puts the Host's Node.js on `PATH` first, for the plugin's `npm ci` build. */
  readonly findsNode: boolean;
}

/**
 * `herdr <arguments>` as a plugin step runs it: through an endpoint's launcher, else the bare
 * `herdr` with the PATH prefixes, naming the Host's session. `arguments` are literal words the
 * app chose.
 */
export function pluginStepCommand(args: readonly string[], options: PluginCommandOptions): string {
  const { session, endpoint, findsNode } = options;
  const launched = endpoint
    ? launcherCommand(endpoint, args.join(' '), findsNode ? NODE_PROBE_SCRIPT : '')
    : null;
  if (launched) return launched;
  const command = renderHerdrCommand(session, null, args);
  return findsNode ? wrappingBareHerdrWithNode(command) : wrappingBareHerdr(command);
}

/** The bare command the missing-binary check looks at (before the PATH wrap). */
export function bareStepCommand(args: readonly string[], session: string): string {
  return renderHerdrCommand(session, null, args);
}

/** Throws unless `result` is a plugin step herdr finished with exit 0. */
export function checkPluginStep(
  step: PluginStep,
  result: { exitCode: number; stdout: string; stderr: string },
  bareCommand: string,
  endpoint: HerdrEndpoint | null,
): void {
  const missing = missingBinaryError(result.exitCode, bareCommand, endpoint);
  if (missing) throw failWith(missing);
  if (result.exitCode !== 0) {
    throw new PluginStepError(step, result.exitCode, result.stderr, result.stdout);
  }
}
