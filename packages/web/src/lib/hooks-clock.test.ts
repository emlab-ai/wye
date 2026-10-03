import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSchedule, lastSlot, parseHook, matchHooks, describeHookOn, zonedTime, type HookDef } from './hooks';
import { tickHooks, readClock, type FireOne } from './hooks-clock';
import { timeZoneOf } from './settings';
import type { GraphNode } from './graph';

// time hooks (decision:ea.time-based-hooks, task:ea.cadence): a schedule is a cron underneath; the last slot is in the
// person's zone, DST included; the clock fires once per slot moved, never on first sight, never for a paused hook
const iso = (d: Date | null) => d?.toISOString() ?? null;
const slot = (sched: string, now: string, tz: string) => iso(lastSlot(parseSchedule(sched)!, new Date(now), tz));

describe('parseSchedule', () => {
  it('reads the four forms, normalised', () => {
    expect(parseSchedule('daily 8:00')).toMatchObject({ text: 'daily 08:00', kind: 'daily', hour: [8], minute: [0] });
    expect(parseSchedule(' Weekdays  08:00 ')).toMatchObject({ text: 'weekdays 08:00', dow: [1, 2, 3, 4, 5], dowAny: false });
    expect(parseSchedule('fri 16:00')).toMatchObject({ kind: 'days', dow: [5], hour: [16] });
    expect(parseSchedule('mon,thu 09:30')).toMatchObject({ kind: 'days', dow: [1, 4], minute: [30] });
    expect(parseSchedule('sun 23:59')!.dow).toEqual([0]);
    const c = parseSchedule('cron */15 9-17 * * 1-5')!;
    expect(c.minute).toEqual([0, 15, 30, 45]); expect(c.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]); expect(c.dow).toEqual([1, 2, 3, 4, 5]);
    expect(parseSchedule('cron 0 9 1,15 * 7')).toMatchObject({ dom: [1, 15], dow: [0], domAny: false, dowAny: false });
    expect(parseSchedule('cron 0 0 * * 0,7')!.dow).toEqual([0]);
  });
  it('refuses what it cannot read', () => {
    for (const s of ['', 'daily', 'daily 24:00', 'daily 8:60', 'weekday 08:00', 'fri,xyz 10:00', 'cron 60 * * * *', 'cron * * * *', 'cron * * 0 * *', 'cron * * * 13 *', 'cron * * * * 8', 'cron 5-1 * * * *', 'cron */0 * * * *', 'hourly'])
      expect(parseSchedule(s), s).toBeNull();
  });
});

describe('lastSlot', () => {
  it('daily: today when past, else yesterday', () => {
    expect(slot('daily 08:00', '2026-10-07T09:00:00Z', 'UTC')).toBe('2026-10-07T08:00:00.000Z');
    expect(slot('daily 08:00', '2026-10-07T08:00:00Z', 'UTC')).toBe('2026-10-07T08:00:00.000Z'); // ≤ now
    expect(slot('daily 08:00', '2026-10-07T07:59:00Z', 'UTC')).toBe('2026-10-06T08:00:00.000Z');
    // London is BST in October: 08:00 local is 07:00Z
    expect(slot('daily 08:00', '2026-10-07T07:30:00Z', 'Europe/London')).toBe('2026-10-07T07:00:00.000Z');
    // a zone ahead of UTC whose local date is already tomorrow
    expect(slot('daily 08:00', '2026-10-07T23:30:00Z', 'Asia/Tokyo')).toBe('2026-10-07T23:00:00.000Z');
  });
  it('weekdays and day lists skip the other days', () => {
    // 2026-10-10 is a Saturday, 2026-10-12 a Monday
    expect(slot('weekdays 08:00', '2026-10-10T12:00:00Z', 'UTC')).toBe('2026-10-09T08:00:00.000Z');
    expect(slot('weekdays 08:00', '2026-10-12T07:00:00Z', 'UTC')).toBe('2026-10-09T08:00:00.000Z');
    expect(slot('weekdays 08:00', '2026-10-12T08:01:00Z', 'UTC')).toBe('2026-10-12T08:00:00.000Z');
    expect(slot('fri 16:00', '2026-10-14T10:00:00Z', 'UTC')).toBe('2026-10-09T16:00:00.000Z'); // Wednesday → last Friday
    expect(slot('mon,thu 09:30', '2026-10-14T10:00:00Z', 'UTC')).toBe('2026-10-12T09:30:00.000Z');
    expect(slot('mon,thu 09:30', '2026-10-15T10:00:00Z', 'UTC')).toBe('2026-10-15T09:30:00.000Z');
  });
  it('cron: steps, ranges, dom-or-dow, and nothing within 8 days', () => {
    expect(slot('cron */15 * * * *', '2026-10-07T10:44:59Z', 'UTC')).toBe('2026-10-07T10:30:00.000Z');
    expect(slot('cron 0 9-17 * * 1-5', '2026-10-07T18:30:00Z', 'UTC')).toBe('2026-10-07T17:00:00.000Z');
    expect(slot('cron 0 9-17 * * 1-5', '2026-10-07T08:30:00Z', 'UTC')).toBe('2026-10-06T17:00:00.000Z');
    // dom 1 or a Sunday (standard cron: both restricted → either): Sun 2026-10-04
    expect(slot('cron 0 12 1 * 0', '2026-10-06T00:00:00Z', 'UTC')).toBe('2026-10-04T12:00:00.000Z');
    expect(slot('cron 0 12 1 * *', '2026-10-20T00:00:00Z', 'UTC')).toBeNull();
    expect(slot('cron 0 12 1 * *', '2026-10-05T00:00:00Z', 'UTC')).toBe('2026-10-01T12:00:00.000Z');
    expect(slot('cron * * * * *', '2026-10-07T10:44:59Z', 'UTC')).toBe('2026-10-07T10:44:00.000Z');
  });
  it('DST in Europe/London: 08:00 is 08:00 on both sides, the skipped hour runs after the jump', () => {
    // spring forward Sun 2026-03-29 01:00Z (01:00 GMT → 02:00 BST)
    expect(slot('daily 08:00', '2026-03-28T12:00:00Z', 'Europe/London')).toBe('2026-03-28T08:00:00.000Z');
    expect(slot('daily 08:00', '2026-03-29T12:00:00Z', 'Europe/London')).toBe('2026-03-29T07:00:00.000Z');
    expect(slot('daily 01:30', '2026-03-29T12:00:00Z', 'Europe/London')).toBe('2026-03-29T01:30:00.000Z'); // = 02:30 BST
    // fall back Sun 2026-10-25 01:00Z (02:00 BST → 01:00 GMT)
    expect(slot('daily 08:00', '2026-10-24T12:00:00Z', 'Europe/London')).toBe('2026-10-24T07:00:00.000Z');
    expect(slot('daily 08:00', '2026-10-25T12:00:00Z', 'Europe/London')).toBe('2026-10-25T08:00:00.000Z');
    expect(slot('daily 08:00', '2026-10-25T07:30:00Z', 'Europe/London')).toBe('2026-10-24T07:00:00.000Z'); // 07:30 GMT: not yet
  });
  it('DST in America/New_York', () => {
    // spring forward Sun 2026-03-08 07:00Z (02:00 EST → 03:00 EDT)
    expect(slot('weekdays 09:00', '2026-03-06T15:00:00Z', 'America/New_York')).toBe('2026-03-06T14:00:00.000Z'); // EST
    expect(slot('weekdays 09:00', '2026-03-09T15:00:00Z', 'America/New_York')).toBe('2026-03-09T13:00:00.000Z'); // EDT
    expect(slot('weekdays 09:00', '2026-03-09T13:30:00Z', 'America/New_York')).toBe('2026-03-09T13:00:00.000Z');
    expect(slot('daily 02:30', '2026-03-08T12:00:00Z', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z'); // = 03:30 EDT
    // fall back Sun 2026-11-01 06:00Z
    expect(slot('daily 09:00', '2026-11-01T15:00:00Z', 'America/New_York')).toBe('2026-11-01T14:00:00.000Z');
    expect(slot('daily 09:00', '2026-10-31T15:00:00Z', 'America/New_York')).toBe('2026-10-31T13:00:00.000Z');
    expect(zonedTime(2026, 11, 1, 1, 30, 'America/New_York')).toBe(Date.parse('2026-11-01T05:30:00Z')); // the doubled hour: the first (EDT)
    expect(zonedTime(2026, 10, 25, 1, 30, 'Europe/London')).toBe(Date.parse('2026-10-25T00:30:00Z')); // BST, the first
  });
});

const hookNode = (id: string, body: string, status = 'active'): GraphNode => ({ id, kind: 'hook', title: id, status, section: '', subsection: '', file: 'data/products/p/projects/x/docs/hooks.md', line: 1, body: `id: ${id}\ntitle: ${id}\n${body}`, defined: true });

describe('time hook cards', () => {
  it('parse with for:, match only the clock event, ignore once', () => {
    const h = parseHook(hookNode('hook:brief', 'on: time.weekdays  8:00\nfor: goal:ea\ndo: notify "brief"'))!;
    expect(h.on).toEqual({ kind: 'time', event: 'weekdays 08:00' });
    expect(h.for).toBe('goal:ea');
    expect(parseHook(hookNode('hook:own', 'on: time.daily 08:00\ndo: notify "x"'))!.for).toBeUndefined();
    const ev = { kind: 'goal', id: 'goal:ea', event: 'time.weekdays 08:00' };
    expect(matchHooks([h], ev, undefined, new Set(['hook:brief|goal:ea']))).toEqual([h]);
    expect(matchHooks([h], { ...ev, event: 'created' }, undefined, new Set())).toEqual([]);
    expect(matchHooks([{ ...h, status: 'paused' }], ev, undefined, new Set())).toEqual([]);
    expect(describeHookOn(h, 'Europe/London')).toBe('weekdays at 08:00 (Europe/London)');
    expect(describeHookOn(parseHook(hookNode('hook:r', 'on: time.mon,fri 16:00\ndo: notify "x"'))!)).toBe('Mon, Fri at 16:00');
    expect(describeHookOn({ on: { kind: 'req', event: 'created' } })).toBe('req.created');
  });
  it('the zone: WYE_TZ, else the setting, else the machine', () => {
    const was = process.env.WYE_TZ;
    try {
      delete process.env.WYE_TZ;
      expect(timeZoneOf({ timezone: 'Europe/London' })).toBe('Europe/London');
      expect(timeZoneOf({ timezone: 'Not/AZone' })).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      process.env.WYE_TZ = 'America/New_York';
      expect(timeZoneOf({ timezone: 'Europe/London' })).toBe('America/New_York');
    } finally { if (was === undefined) delete process.env.WYE_TZ; else process.env.WYE_TZ = was; }
  });
});

describe('tick', () => {
  const brief = parseHook(hookNode('hook:brief', 'on: time.weekdays 08:00\nfor: goal:ea\ndo: notify "brief"'))!;
  const setup = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-clock-'));
    const calls: { hook: string; node: string; slot: string }[] = [];
    const fireOne: FireOne = async (h, node, s) => { calls.push({ hook: h.id, node, slot: s.toISOString() }); return []; };
    const at = (hooks: HookDef[], now: string) => tickHooks(dir, hooks, new Date(now), 'Europe/London', fireOne);
    return { dir, calls, at };
  };
  it('first sight records the slot without firing; the next slot fires once; state survives', async () => {
    const { dir, calls, at } = await setup();
    // Wed 2026-10-07 10:00 BST — the 08:00 slot already passed today: recorded, not run
    const first = await at([brief], '2026-10-07T09:00:00Z');
    expect(first).toEqual([{ hook: 'hook:brief', node: 'goal:ea', slot: '2026-10-07T07:00:00.000Z', firings: [], skipped: 'first sight' }]);
    expect(calls).toEqual([]);
    expect((await readClock(dir))['hook:brief']).toEqual({ seen: '2026-10-07T09:00:00.000Z', last: '2026-10-07T07:00:00.000Z' });
    expect(await at([brief], '2026-10-07T15:00:00Z')).toEqual([]); // same slot: nothing
    const next = await at([brief], '2026-10-08T07:00:30Z'); // Thursday 08:00:30 BST
    expect(calls).toEqual([{ hook: 'hook:brief', node: 'goal:ea', slot: '2026-10-08T07:00:00.000Z' }]);
    expect(next[0]).toMatchObject({ slot: '2026-10-08T07:00:00.000Z', firings: [] });
    expect(next[0].skipped).toBeUndefined();
    expect(await at([brief], '2026-10-08T07:01:30Z')).toEqual([]); // the next minute's tick: already run
    expect(calls.length).toBe(1);
    expect((await readClock(dir))['hook:brief'].last).toBe('2026-10-08T07:00:00.000Z');
  });
  it('two missed mornings (app down) fire once, for the latest slot', async () => {
    const { calls, at } = await setup();
    await at([brief], '2026-10-05T12:00:00Z'); // Monday
    await at([brief], '2026-10-08T12:00:00Z'); // Thursday: Tue, Wed, Thu slots all passed while down
    expect(calls).toEqual([{ hook: 'hook:brief', node: 'goal:ea', slot: '2026-10-08T07:00:00.000Z' }]);
  });
  it('a weekly hook installed on Wednesday does not run last Friday', async () => {
    const { calls, at } = await setup();
    const review = parseHook(hookNode('hook:review', 'on: time.fri 16:00\ndo: notify "review"'))!;
    await at([review], '2026-10-07T09:00:00Z');
    await at([review], '2026-10-08T09:00:00Z');
    expect(calls).toEqual([]);
    await at([review], '2026-10-09T15:00:00Z'); // Fri 16:00 BST
    expect(calls).toEqual([{ hook: 'hook:review', node: 'hook:review', slot: '2026-10-09T15:00:00.000Z' }]);
  });
  it('a paused hook never fires, and resuming does not replay its slots; hooks off records only', async () => {
    const { dir, calls, at } = await setup();
    const paused = { ...brief, status: 'paused' };
    await at([paused], '2026-10-07T09:00:00Z');
    expect((await at([paused], '2026-10-08T09:00:00Z'))[0]).toMatchObject({ skipped: 'inactive' });
    await at([paused], '2026-10-09T09:00:00Z');
    expect(calls).toEqual([]);
    expect(await at([brief], '2026-10-09T10:00:00Z')).toEqual([]); // resumed: Friday's slot was already recorded
    expect((await tickHooks(dir, [brief], new Date('2026-10-12T09:00:00Z'), 'Europe/London', null))[0]).toMatchObject({ skipped: 'hooks off' });
    expect(calls).toEqual([]);
  });
  it('a hook gone from the graph loses its state; reappearing is a first sight', async () => {
    const { dir, calls, at } = await setup();
    await at([brief], '2026-10-07T09:00:00Z');
    await at([], '2026-10-08T09:00:00Z');
    expect(await readClock(dir)).toEqual({});
    expect((await at([brief], '2026-10-09T09:00:00Z'))[0]).toMatchObject({ skipped: 'first sight' });
    expect(calls).toEqual([]);
  });
});
