// Port of Swift `TerminalLinkPolicy`. Remote terminal output is untrusted: only ordinary web links
// cross from the terminal into the system URL opener; local files and executable schemes do not.

const WEB_LINK = /^(https?):\/\/([^/?#]*)/i;

/** The host of an http(s) link, or null when the text is not an openable web link. */
export function webLinkHost(link: string): string | null {
  const match = WEB_LINK.exec(link);
  if (!match || /[\s\\]/.test(link)) return null;
  let authority = match[2] ?? '';
  authority = authority.slice(authority.lastIndexOf('@') + 1);
  const host = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : (authority.split(':')[0] ?? '');
  return host === '' || host === '[' ? null : host;
}

/** True only for http(s) links that have a host. */
export function isOpenableLink(link: string): boolean {
  return webLinkHost(link) !== null;
}
