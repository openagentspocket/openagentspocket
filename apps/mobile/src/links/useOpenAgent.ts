import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { destinationHref } from './destinationHref';

export interface AgentTarget {
  readonly hostId: string;
  readonly paneId: string;
}

/** The route a banner or notification tap opens: the agent, or the Console when none is named. */
export function tapHref(target: AgentTarget | null | undefined) {
  return destinationHref(target ? { kind: 'agent', ...target } : { kind: 'console' });
}

/** Opens an agent's detail from a banner tap; the push-notification tap handler uses it too. */
export function useOpenAgent(): (target: AgentTarget | null) => void {
  const router = useRouter();
  return useCallback((target) => router.push(tapHref(target)), [router]);
}
