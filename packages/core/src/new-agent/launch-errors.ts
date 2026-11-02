import { HerdrApiError } from '../errors/herdr-api-error';
import { userFacingDescription } from '../errors/presentation';
import { type Message, message } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';

const isKind = (error: unknown, kind: string): boolean =>
  error instanceof TransportFailure && error.error.kind === kind;

/** Why Agent detection failed. */
export function discoveryErrorMessage(error: unknown): Message {
  if (isKind(error, 'sshUnreachable')) return message('The Host is not connected.');
  if (isKind(error, 'timedOut')) return message('Agent detection timed out.');
  return message('Detecting Agents failed: %@', userFacingDescription(error));
}

/** Why the Host's home directory could not be resolved (a name-only New Workspace launch). */
export function homeProbeErrorMessage(error: unknown): Message {
  if (isKind(error, 'sshUnreachable')) {
    return message('The Host is not connected, so its home directory could not be resolved.');
  }
  if (isKind(error, 'timedOut')) return message("Resolving the Host's home directory timed out.");
  return message("Could not determine the Host's home directory: %@", userFacingDescription(error));
}

/** Why a launch failed; `launchedKind` is the kind captured at submit, not the picker's later pick. */
export function launchErrorMessage(error: unknown, launchedKind: string): Message {
  if (isKind(error, 'sshUnreachable')) return message('The Host is not connected.');
  if (isKind(error, 'timedOut')) return message('The Host did not answer in time.');
  if (error instanceof HerdrApiError) {
    if (error.code === 'not_git_worktree') {
      return message(
        'This workspace is not inside a Git repository, so no worktree can be created from it.',
      );
    }
    if (error.code === 'worktree_create_failed') {
      return message('Creating the worktree failed: %@', error.message);
    }
    if (error.code === 'unsupported_agent_kind' && launchedKind === 'muse') {
      return message(
        'herdr rejected the command: %@. Update herdr on this Host to v0.9.0 or later for Muse support, or choose another supported Agent.',
        error.message,
      );
    }
    if (error.isCanonicalModeRefusal) {
      return message(
        "The Host's shell didn't accept a launch command this long within 10 seconds. On a Mac, herdr accepts at most 1,024 bytes until the shell's line editor starts, and some shells, such as dash, never start one. Shorten the arguments and try again.",
      );
    }
    return message('herdr rejected the command: %@', error.message);
  }
  return message('Starting the agent failed: %@', userFacingDescription(error));
}
