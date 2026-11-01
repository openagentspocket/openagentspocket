import { type AgentSource, type ConsoleAgent, FakeTransport } from '@agentico/core';
import { useEffect, useState } from 'react';

const demoSource = new FakeTransport();

/** Agents for Home. Phase 1 swaps the fake source for the SSH transport. */
export function useAgents(source: AgentSource = demoSource): ConsoleAgent[] {
  const [agents, setAgents] = useState<ConsoleAgent[]>([]);
  useEffect(() => {
    let live = true;
    source.listAgents().then((next) => live && setAgents(next));
    return () => {
      live = false;
    };
  }, [source]);
  return agents;
}
