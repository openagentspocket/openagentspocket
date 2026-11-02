import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useHosts } from '@/features/hosts/useHosts';
import { parseAppLink } from '@/links/appLink';
import { destinationHref } from '@/links/destinationHref';
import { resolveLink } from '@/links/resolveLink';

/**
 * `/agent?host=&session=&pane=`: a link from another app that names its Host by address or name.
 * Resolves it among the saved Hosts and replaces itself with the agent, or Home when none answers.
 */
export default function AgentLookup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ host?: string; session?: string; pane?: string }>();
  const { hosts } = useHosts();
  useEffect(() => {
    const query = Object.entries(params)
      .filter(([, value]) => typeof value === 'string')
      .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
      .join('&');
    const link = parseAppLink(`/agent?${query}`);
    const destination = link ? resolveLink(link, hosts) : ({ kind: 'console' } as const);
    router.replace(destinationHref(destination));
  }, [router, params, hosts]);
  return null;
}
