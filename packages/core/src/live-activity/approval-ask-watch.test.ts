import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { ASK_REFRESH_MS, approvalAsksSource } from '../notifications/approval-script';
import { ApprovalAskWatch, FIRST_ASK_READ_MS } from './approval-ask-watch';
import { flush, makeWorld, PANE, row, started } from './coordinator-world.testkit';
import { openActivity } from './envelope';

const BID = 'abcdefghijk';
const reading = (pane = PANE, bid = BID) =>
  JSON.stringify({
    v: 1,
    result: 'ok',
    asks: [{ pane, bid, ts: 1000, act: 1, q: 'Run ls?', opts: ['Yes', 'No'] }],
  });
const EMPTY = '{"v":1,"result":"ok","asks":[]}';

function makeWatch(output = () => reading(), isWatched: (hostId: string) => boolean = () => true) {
  const clock = new FakeClock(flush);
  const run = vi.fn(async (_hostId: string, _script: string) => output());
  const onChange = vi.fn();
  const source = vi.fn(async () => approvalAsksSource('/plugin', null));
  const watch = new ApprovalAskWatch({ clock, isWatched, source, run, onChange });
  return { clock, run, onChange, source, watch };
}

describe('ApprovalAskWatch', () => {
  it('reads nothing while no Agent is Blocked', async () => {
    const { clock, run, watch } = makeWatch();
    watch.rowsDidChange([row(PANE, 'working')]);
    await clock.advance(FIRST_ASK_READ_MS + ASK_REFRESH_MS * 3);
    expect(run).not.toHaveBeenCalled();
  });

  it('skips a Host this device does not answer for', async () => {
    const { clock, run, watch } = makeWatch(undefined, () => false);
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS + 1);
    expect(run).not.toHaveBeenCalled();
    expect(watch.asks('h1').size).toBe(0);
  });

  it('gives the hook time to write, then reads and repeats only while Blocked', async () => {
    const { clock, run, onChange, watch } = makeWatch();
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS - 1);
    expect(run).not.toHaveBeenCalled();
    await clock.advance(1);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(watch.asks('h1').get(PANE)?.episodeId).toBe(BID);
    expect(onChange).toHaveBeenCalledWith('h1');

    await clock.advance(ASK_REFRESH_MS);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);

    watch.rowsDidChange([row(PANE, 'working')]);
    expect(watch.asks('h1').size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);
    await clock.advance(ASK_REFRESH_MS * 3);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a later Blocked row keeps one watch running', async () => {
    const { clock, run, watch } = makeWatch();
    watch.rowsDidChange([row(PANE, 'blocked')]);
    watch.rowsDidChange([row(PANE, 'blocked'), row('wV:p2', 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('notices an ask that went away', async () => {
    let output = reading();
    const { clock, onChange, watch } = makeWatch(() => output);
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    output = EMPTY;
    await clock.advance(ASK_REFRESH_MS);
    await flush();
    expect(watch.asks('h1').size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('stays quiet without a plugin, and tries again on the next Blocked turn', async () => {
    const { clock, run, source, watch } = makeWatch();
    source.mockResolvedValueOnce(null as never);
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    expect(run).not.toHaveBeenCalled();
    watch.rowsDidChange([row(PANE, 'working')]);
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a plugin that could not answer retries with the next row change', async () => {
    const { clock, run, source, watch } = makeWatch();
    source.mockResolvedValueOnce(null as never);
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a failed plugin read retries with the next row change', async () => {
    const { clock, run, source, watch } = makeWatch();
    source.mockRejectedValueOnce(new Error('offline'));
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stop ends every read', async () => {
    const { clock, run, watch } = makeWatch();
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    watch.stop();
    await clock.advance(ASK_REFRESH_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
    expect(watch.asks('h1').size).toBe(0);
  });

  it('feeds the coordinator: a read ask reaches the sealed activity', async () => {
    const w = await makeWorld();
    const clock = new FakeClock(flush);
    const watch = new ApprovalAskWatch({
      clock,
      isWatched: () => true,
      source: async () => approvalAsksSource('/plugin', null),
      run: async () => reading(),
      onChange: (hostId) => {
        w.state.asks = new Map(watch.asks(hostId));
        w.coordinator.approvalAsksDidChange(hostId);
      },
    });
    await started(w, [row(PANE, 'blocked')]);
    watch.rowsDidChange([row(PANE, 'blocked')]);
    await clock.advance(FIRST_ASK_READ_MS);
    await flush();
    await w.settle();
    const content = w.controller.updates.at(-1)?.content;
    const key = w.keys.record('h1')?.key ?? new Uint8Array();
    const details = openActivity({ ...content?.envelope } as never, key);
    expect(details.agents[0]?.ask?.episodeId).toBe(BID);
  });
});
