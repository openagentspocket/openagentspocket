import { redirectLink } from '@/links/nativeIntent';

/** Maps links opened from outside the app (openagentspocket:// and legacy agentico://) to routes. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectLink(path);
}
