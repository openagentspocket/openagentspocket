import { failure } from './failures';
import { Frames } from './frames';
import { asByteString, type RawOutput } from './parse-changes';
import { parsePatchFiles } from './patch-parser';
import { patchByteLimit, SectionName } from './script';
import {
  type ChangedFile,
  ChangesReadError,
  type CheckoutLocation,
  type FilePatch,
  type FilePatchRequest,
  type PatchLimit,
} from './types';

/** A patch request for a status row; null for an untracked directory, which has no file patch. */
export function filePatchRequest(
  file: ChangedFile,
  checkout: CheckoutLocation,
  limit: PatchLimit = 'initial',
): FilePatchRequest | null {
  if (file.kind === 'untracked' && file.path.endsWith('/')) return null;
  return {
    topLevel: checkout.topLevel,
    path: file.path,
    originalPath: file.originalPath,
    isUntracked: file.kind === 'untracked',
    limit,
  };
}

/**
 * Both the framed command status and the final marker are required. `--no-index` uses 1 for
 * differences and failures alike, so only a patch header makes that status a successful
 * untracked-file read.
 */
export function parsePatch(raw: RawOutput, nonce: string, request: FilePatchRequest): FilePatch {
  const frames = new Frames(asByteString(raw.stdout), asByteString(raw.stderr), nonce);
  if (!frames.reachedEnd) throw new ChangesReadError({ kind: 'incomplete' });
  const section = frames.requiredSection(SectionName.patch, patchByteLimit(request.limit));
  const hasPatch = section.body.startsWith('diff --git ');
  const ok =
    section.status === 0 ||
    section.isTruncated ||
    (request.isUntracked && section.status === 1 && hasPatch);
  if (!ok) throw failure(section);
  let body = section.body;
  // Only whole physical lines are displayable. A cap may split a multibyte scalar, a path escape,
  // or the hunk's next source line.
  if (section.isTruncated && !body.endsWith('\n')) {
    const end = body.lastIndexOf('\n');
    body = end >= 0 ? body.slice(0, end + 1) : '';
  }
  return {
    files: parsePatchFiles(body, section.isTruncated),
    isTruncated: section.isTruncated,
  };
}
