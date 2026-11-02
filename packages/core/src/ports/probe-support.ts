import { buildReport } from './probe';
import { parseDockerPorts, type RawListener } from './probe-parse';
import type { ListeningPortReport } from './types';

export const row = (report: ListeningPortReport, port: number) =>
  report.ports.find((candidate) => candidate.port === port);

export function requireRow(report: ListeningPortReport, port: number) {
  const found = row(report, port);
  if (!found) throw new Error(`no row for port ${port}`);
  return found;
}

export const reportOf = (
  listeners: RawListener[],
  docker = parseDockerPorts(''),
  readContainers = false,
) => buildReport({ listeners, docker, readContainers });

export const owned = (
  port: number,
  address: string,
  pid: number | null,
  processName: string | null,
): RawListener => ({ port, address, pid, processName });
