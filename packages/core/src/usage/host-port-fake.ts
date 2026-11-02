import { type PluginInstallation, pluginInstallation } from '../hosts/plugin-installation';
import type { UsageHostPort, UsageQueryArgs } from './host-port';
import { decodeUsageReport, type UsageReport } from './report';

/** What the fake's next query does: answer with a report or fail. */
export type FakeQueryStep = UsageReport | Error;

/** A scripted Host for tests and previews: the last step repeats once the script runs out. */
export class FakeUsageHostPort implements UsageHostPort {
  plugin: PluginInstallation | null = pluginInstallation({
    version: '0.12.0',
    pluginRoot: '/plugins/agentico',
  });
  readonly queries: UsageQueryArgs[] = [];
  readonly replaced: string[] = [];
  accountFile: string | null = null;
  replaceError: Error | null = null;
  private readonly steps: FakeQueryStep[];

  constructor(steps: FakeQueryStep[] = [fakeReport()]) {
    this.steps = [...steps];
  }

  script(...steps: FakeQueryStep[]): void {
    this.steps.splice(0, this.steps.length, ...steps);
  }

  async readPlugin(): Promise<PluginInstallation | null> {
    return this.plugin;
  }

  async query(args: UsageQueryArgs): Promise<UsageReport> {
    this.queries.push(args);
    const step = this.steps.length > 1 ? this.steps.shift() : this.steps[0];
    if (step === undefined) throw new Error('no scripted step');
    if (step instanceof Error) throw step;
    return step;
  }

  async readAccountFile(): Promise<string | null> {
    return this.accountFile;
  }

  async replaceAccountFile(text: string): Promise<void> {
    if (this.replaceError) throw this.replaceError;
    this.replaced.push(text);
    this.accountFile = text;
  }
}

/** A tiny decoded report; `refreshing` keeps the store polling. */
export function fakeReport(
  options: { refreshing?: boolean; accounts?: boolean } = {},
): UsageReport {
  const empty = { state: 'noData' };
  return decodeUsageReport(
    JSON.stringify({
      version: 1,
      runtime: 'recorded',
      generatedAt: '2026-10-31T12:00:00.000Z',
      timeZone: 'UTC',
      refreshing: options.refreshing ?? false,
      scan: { state: 'complete', skippedArchives: 0 },
      programs: [
        {
          program: 'claude',
          tokenUsage: empty,
          usageLimits: {
            state: 'ok',
            source: 'service',
            observedAt: '2026-10-31T12:00:00.000Z',
            plan: 'max',
            windows: [{ id: 'fiveHour', usedPercent: 40, expired: false }],
          },
          ...(options.accounts
            ? {
                accounts: [
                  {
                    id: 'default',
                    isDefault: true,
                    directory: '/home/user/.claude',
                    state: 'ok',
                  },
                ],
              }
            : {}),
        },
      ],
    }),
  );
}
