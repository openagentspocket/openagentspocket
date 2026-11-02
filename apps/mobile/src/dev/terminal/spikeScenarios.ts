import { measureCadence, type Sink } from './spikeStats';

/** What a scenario can do to the terminal under test. */
export interface Rig {
  renderer: string;
  sink: Sink;
  /** Types text to the PTY as the user would. */
  send(text: string): Promise<void>;
  /** The grid the view last reported, or null. */
  grid(): { cols: number; rows: number } | null;
  /** Makes the terminal view shorter (true) or full height (false). */
  shrink(on: boolean): void;
  resizePty(cols: number, rows: number): Promise<void>;
  /** Resolves when the view reports a grid different from `from`. */
  nextGrid(
    from: { cols: number; rows: number },
    timeoutMs?: number,
  ): Promise<{ cols: number; rows: number }>;
  /** Marks a moment the outside script screenshots. */
  show(name: string, dwellMs: number): Promise<void>;
  typed(): { events: number; chars: number };
  /** Bytes the renderer confirmed parsing, when it can tell (xterm). */
  parsed(): number | null;
  log(line: string): void;
}

export type Scenario = { name: string; run: (rig: Rig) => Promise<Record<string, unknown>> };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sentinel = (n: number) => `D$((40+${n}))`;
let counter = 0;
const nextMarker = () => {
  counter += 1;
  return { cmd: `echo ${sentinel(counter)}`, expect: `D${40 + counter}` };
};

/** Runs a command line and waits for its marker, returning the wait in ms. */
async function runLine(rig: Rig, line: string, timeoutMs = 20_000): Promise<number> {
  const marker = nextMarker();
  await rig.send(`${line}; ${marker.cmd}\r`);
  return rig.sink.waitFor(marker.expect, timeoutMs);
}

const COLORS = String.raw`clear; for i in 0 1 2 3 4 5 6 7; do printf "\033[4$i;30m $i \033[0m"; done; echo; for i in $(seq 16 231 | awk 'NR%4==1'); do printf "\033[48;5;%dm \033[0m" $i; done; echo; awk 'BEGIN{for(i=0;i<60;i++){printf "\033[48;2;%d;%d;%dm ",255-i*4,i*4,128}; printf "\033[0m\n"}'; printf '\033[1mbold\033[0m \033[3mitalic\033[0m \033[4munder\033[0m \033[7minverse\033[0m \033[31mred\033[32m green\033[0m\n'; echo 'CJK 日本語 한국어 emoji 🙂 box ─┌┐│└┘ ñé'`;

const ALT = String.raw`clear; printf 'PRIMARY-MARK\n'; printf '\033[?1049h\033[2J\033[1;1HALT-SCREEN-ACTIVE\033[5;5H\033[7minverse in alt\033[0m'; sleep 4; printf '\033[?1049l'`;

const YES = String.raw`yes "$(printf '\033[31mred\033[0m \033[1;32mgreen bold\033[0m lorem ipsum dolor sit amet consectetur adipiscing elit 0123456789')"`;

export const FLOOD_MS = 60_000;

export function scenarios(): Scenario[] {
  return [
    {
      name: 'grid-and-stty',
      async run(rig) {
        const grid = rig.grid();
        const ms = await runLine(rig, 'stty size');
        const ok = grid ? rig.sink.tail().includes(`${grid.rows} ${grid.cols}`) : false;
        return { grid, sttyMatchesGrid: ok, ms };
      },
    },
    {
      name: 'colors-unicode',
      async run(rig) {
        const ms = await runLine(rig, COLORS);
        await rig.show('colors', 2500);
        return { ms };
      },
    },
    {
      name: 'alt-screen',
      async run(rig) {
        await rig.send(`${ALT}; echo A$((40+2))\r`);
        await sleep(1200);
        await rig.show('altscreen', 1500);
        const ms = await rig.sink.waitFor('A42', 15_000);
        await rig.show('after-altscreen', 2000);
        return { ms, note: 'primary screen must be back with PRIMARY-MARK' };
      },
    },
    {
      name: 'tui-vim',
      async run(rig) {
        await runLine(rig, 'printf \'def f(x):\\n    return "s" + 1  # c\\n\' > /tmp/oap-spike.py');
        await rig.send('vim -u NONE -N -c "syntax on" /tmp/oap-spike.py\r');
        await sleep(1500);
        await rig.show('vim', 2500);
        await rig.send(':q!\r');
        const ms = await runLine(rig, 'true');
        return { ms };
      },
    },
    {
      name: 'tui-top',
      async run(rig) {
        await rig.send('top\r');
        await sleep(2500);
        await rig.show('top', 2500);
        await rig.send('q');
        const ms = await runLine(rig, 'true');
        return { ms };
      },
    },
    {
      name: 'resize-round-trip',
      async run(rig) {
        const before = rig.grid();
        if (!before) return { error: 'no grid' };
        const started = Date.now();
        rig.shrink(true);
        const after = await rig.nextGrid(before);
        await rig.resizePty(after.cols, after.rows);
        await runLine(rig, 'stty size');
        const shrinkOk = rig.sink.tail().includes(`${after.rows} ${after.cols}`);
        const shrinkMs = Date.now() - started;
        await rig.show('shrunk', 1500);
        const t2 = Date.now();
        rig.shrink(false);
        const back = await rig.nextGrid(after);
        await rig.resizePty(back.cols, back.rows);
        await runLine(rig, 'stty size');
        const backOk = rig.sink.tail().includes(`${back.rows} ${back.cols}`);
        return { before, after, back, shrinkOk, backOk, shrinkMs, backMs: Date.now() - t2 };
      },
    },
    {
      name: 'typing-window',
      async run(rig) {
        await rig.send('clear\r');
        await rig.show('typing', 12_000);
        return { ...rig.typed(), tail: rig.sink.tail().slice(-60) };
      },
    },
    {
      name: 'flood-yes-60s',
      async run(rig) {
        const bytes0 = rig.sink.bytes();
        const parsed0 = rig.parsed();
        const cadence = measureCadence();
        // The scripted typing may still be arriving; let it finish, then clear the line.
        for (let last = -1; last !== rig.typed().events; await sleep(1500))
          last = rig.typed().events;
        await rig.send('\x15');
        const started = Date.now();
        await rig.send(`${YES}\r`);
        const samples: number[] = [];
        let shown = false;
        while (Date.now() - started < FLOOD_MS) {
          await sleep(5000);
          samples.push(rig.sink.bytes() - bytes0);
          if (!shown && Date.now() - started > 20_000) {
            shown = true;
            await rig.show('flood', 1500);
          }
        }
        const stats = cadence.stop();
        const received = rig.sink.bytes() - bytes0;
        const parsed1 = rig.parsed();
        const stopAt = Date.now();
        await rig.send('\x03');
        await sleep(300);
        const marker = nextMarker();
        await rig.send(`${marker.cmd}\r`);
        const drainMs = await rig.sink.waitFor(marker.expect, 60_000).then(
          () => Date.now() - stopAt,
          () => -1,
        );
        return {
          seconds: (Date.now() - started) / 1000,
          megabytes: Math.round(received / 1e4) / 100,
          mbPerSec: Math.round(received / (FLOOD_MS / 1000) / 1e4) / 100,
          cadence: stats,
          cumulativeBytesEvery5s: samples,
          parsedByRenderer: parsed1 === null || parsed0 === null ? null : parsed1 - parsed0,
          interruptToPromptMs: drainMs,
        };
      },
    },
  ];
}
