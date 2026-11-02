import { decodeUtf8Stream, type TerminalHandle } from '@openagentspocket/ui';
import { nativeSsh, type PtyStream, toSshError, utf8Encode } from 'agentico-ssh';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { post } from '../harnessIo';
import type { HarnessParams } from '../sshHarness';
import { type Rig, scenarios } from './spikeScenarios';
import { makeSink } from './spikeStats';
import { xtermStats } from './XtermTerminal';

type Grid = { cols: number; rows: number };

/** Owns the PTY, the scenario run and the reporting for the terminal spike screen. */
export function useSpikeSession(
  params: HarnessParams,
  renderer: 'ghostty' | 'xterm',
  autoRun: boolean,
  term: RefObject<TerminalHandle | null>,
) {
  const pty = useRef<PtyStream | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const gridWaiters = useRef<((grid: Grid) => void)[]>([]);
  const typedRef = useRef({ events: 0, chars: 0 });
  const [shrunk, setShrunk] = useState(false);
  const [status, setStatus] = useState('starting');
  const started = useRef(false);

  const log = useCallback(
    (line: string) => {
      post(params.fixturePort, '/log', `${new Date().toISOString()} [${renderer}] ${line}`).catch(
        () => {},
      );
    },
    [params.fixturePort, renderer],
  );

  const onResize = useCallback(
    (cols: number, rows: number) => {
      const grid = { cols, rows };
      gridRef.current = grid;
      log(`grid ${cols}x${rows}`);
      for (const waiter of gridWaiters.current.splice(0)) waiter(grid);
    },
    [log],
  );

  const onInput = useCallback(
    (data: string) => {
      typedRef.current.events += 1;
      typedRef.current.chars += data.length;
      log(`input ${JSON.stringify(data)}`);
      pty.current?.write(utf8Encode(data)).catch(() => {});
    },
    [log],
  );

  const run = useCallback(async () => {
    const ssh = nativeSsh();
    const report: Record<string, unknown> = { renderer };
    try {
      const { publicKey } = await ssh.generateKey(params.alias);
      await post(params.fixturePort, '/authorize', publicKey);
      const session = await ssh.connect({
        host: params.host,
        port: params.port,
        username: params.user,
        keyAlias: params.alias,
        pinnedHostKey: params.pin,
      });
      for (let i = 0; i < 100 && !gridRef.current; i++)
        await new Promise<void>((r) => setTimeout(r, 100));
      const grid = gridRef.current ?? { cols: 80, rows: 24 };
      const stream = await session.openPty({
        command: "env PS1='$ ' /bin/bash --norc --noprofile -i",
        cols: grid.cols,
        rows: grid.rows,
      });
      pty.current = stream;
      const sink = makeSink(decodeUtf8Stream());
      stream.onData((bytes) => {
        sink.push(bytes);
        term.current?.writeBytes(bytes);
      });
      setStatus('attached');
      log(`attached ${grid.cols}x${grid.rows}`);
      const rig: Rig = {
        renderer,
        sink,
        send: (text) => stream.write(utf8Encode(text)),
        grid: () => gridRef.current,
        shrink: setShrunk,
        resizePty: (cols, rows) => stream.resize(cols, rows),
        nextGrid: (from, timeoutMs = 10_000) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('no new grid')), timeoutMs);
            const waiter = (next: Grid) => {
              if (next.cols === from.cols && next.rows === from.rows) {
                gridWaiters.current.push(waiter);
                return;
              }
              clearTimeout(timer);
              resolve(next);
            };
            gridWaiters.current.push(waiter);
          }),
        show: async (name, dwellMs) => {
          setStatus(name);
          log(`SHOW ${name}`);
          await new Promise<void>((r) => setTimeout(r, dwellMs));
        },
        typed: () => typedRef.current,
        parsed: () => (renderer === 'xterm' ? xtermStats.parsed : null),
        log,
      };
      await new Promise<void>((r) => setTimeout(r, 1500));
      for (const scenario of scenarios()) {
        const started = Date.now();
        setStatus(scenario.name);
        try {
          const result = await scenario.run(rig);
          report[scenario.name] = { ...result, totalMs: Date.now() - started };
        } catch (error) {
          report[scenario.name] = { error: toSshError(error).message };
        }
        log(`RESULT ${scenario.name} ${JSON.stringify(report[scenario.name])}`);
      }
      await stream.close().catch(() => {});
    } catch (error) {
      report.fatal = toSshError(error).message;
    }
    setStatus('done');
    log('DONE');
    await post(params.fixturePort, '/report', JSON.stringify(report, null, 2)).catch(() => {});
  }, [params, renderer, log, term]);

  useEffect(() => {
    if (autoRun && !started.current) {
      started.current = true;
      run();
    }
  }, [autoRun, run]);

  return { status, shrunk, onInput, onResize };
}
