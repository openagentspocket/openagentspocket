// The files an Oh My Pi free-form edit patch names, in order (Swift PiFileChanges.patchPaths); shared by Pi, Oh My Pi and OpenCode:
// hashline sections open with `[path#HASH]`, and the patch form with `*** Add File:`,
// `*** Update File:` or `*** Delete File:`. Headers start at the line's first column; a body line
// starts with its operation or sign, a context line with a space, so neither reads as a header.

// Swift's `isNewline`: LF, CR, CRLF, VT, FF, NEL, LS and PS.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are the point
const NEWLINES = /\r\n|[\n\r\u2028\u2029\u000b\u000c\u0085]/;
const HEADERS = ['*** Add File:', '*** Update File:', '*** Delete File:'];

export function patchPaths(input: string): string[] {
  const paths: string[] = [];
  for (const raw of input.split(NEWLINES)) {
    const text = raw.trimEnd();
    let path: string | null = null;
    for (const header of HEADERS) {
      if (text.startsWith(header)) path = text.slice(header.length).trim();
    }
    if (path === null && text.startsWith('[') && text.endsWith(']')) {
      const hash = text.lastIndexOf('#');
      if (hash > 0) {
        const anchor = text.slice(hash + 1, -1);
        if (anchor.length > 0 && /^[A-Za-z0-9]+$/.test(anchor)) path = text.slice(1, hash);
      }
    }
    if (path && !paths.includes(path)) paths.push(path);
  }
  return paths;
}
