import { REPOSITORY_URL } from '@/settings/pagesRoot';
import { type CrashRecord, crashReportText } from './crashRecorder';

/** Which app and system a report comes from: nothing that names the user, a Host or a key. */
export interface AppBuild {
  version: string;
  build: string;
  /** "ios 26.1": the platform and its version. */
  system: string;
}

/** Where a problem is reported: a new issue on the project's GitHub (the owner's support channel). */
export const NEW_ISSUE_URL = `${REPOSITORY_URL}/issues/new`;

/**
 * The crash text kept in a report. A link carries the body, and GitHub refuses links much longer
 * than 8 KB once escaped, so a long stack keeps its first part.
 */
export const MAX_CRASH_CHARS = 2000;

/**
 * The issue's prefilled body. It is written for the project's maintainers, so it stays in English
 * whatever the app's language; the person sees it before it leaves and edits it on GitHub.
 */
export function problemReportBody(build: AppBuild, crash?: CrashRecord): string {
  const lines = [
    '### What happened',
    '',
    '<!-- What you did, what you expected and what happened instead. -->',
    '',
    '### App',
    '',
    `- Version: ${build.version || 'unknown'} (build ${build.build || 'unknown'})`,
    `- System: ${build.system}`,
  ];
  if (crash) {
    const text = crashReportText(crash);
    const kept =
      text.length > MAX_CRASH_CHARS ? `${text.slice(0, MAX_CRASH_CHARS)}\n[truncated]` : text;
    lines.push('', '### Last crash', '', '```', kept, '```');
  }
  return lines.join('\n');
}

/** The link that opens GitHub's new-issue form with the body filled in. */
export function problemReportUrl(body: string): string {
  return `${NEW_ISSUE_URL}?body=${encodeURIComponent(body)}`;
}
