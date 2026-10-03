// The clock of the hooks engine (decision:ea.time-based-hooks, task:ea.cadence): a `time.<schedule>` hook fires when
// its last scheduled slot (lib/hooks#lastSlot, in the person's zone) is past the one it last saw — once, however many
// slots went by while the app was down (one catch-up run, not one per missed tick). First sight of a hook — just written,
// just installed — records the current slot and fires nothing: a Friday review installed on Wednesday does not run last
// Friday's. State per product in <product>/_hooks/clock.json { [hook]: { seen, last } }, written before the actions run
// so a crash never runs a slot twice. The firing itself is the engine's (hooks-run#fire, `only` the hook, forced): a
// record in _hooks/<id>.json like any. A ticker every 60 s over every product, armed once per server (instrumentation).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hooksOf, lastSlot, parseSchedule, type HookDef } from './hooks';
import type { Firing } from './hooks-run'; // the engine itself is imported when a tick runs: the core stays light for tests
import { readSettings, timeZoneOf } from './settings';
import { loadScope } from './scope';
import { listProducts } from './products';

export type ClockState = Record<string, { seen: string; last: string | null }>;
// what a tick did with a hook whose slot moved: fired (the firings), or recorded only — and why
export type ClockTick = { hook: string; node: string; slot: string; firings: Firing[]; skipped?: 'first sight' | 'inactive' | 'hooks off' };
export type FireOne = (h: HookDef, node: string, slot: Date) => Promise<Firing[]>;

const clockFile = (productDir: string) => path.join(productDir, '_hooks', 'clock.json');
export async function readClock(productDir: string): Promise<ClockState> {
  try { return JSON.parse(await readFile(clockFile(productDir), 'utf8')) as ClockState; } catch { return {}; }
}
async function writeClock(productDir: string, s: ClockState): Promise<void> {
  const f = clockFile(productDir); await mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}`; await writeFile(tmp, JSON.stringify(s, null, 2) + '\n'); await rename(tmp, f);
}
const inactive = (h: HookDef) => h.status === 'paused' || h.status === 'off' || h.status === 'deprecated';
export const forNode = (h: HookDef) => h.for ?? h.id;

// The clock over one product's hooks: the IO-light core (state file + an injected fire), what tick and the tests run.
// fireOne null = hooks are off: slots are recorded, nothing runs, so switching hooks on does not replay old slots;
// a paused hook likewise moves on without firing. Hooks gone from the graph lose their entry (a reinstall is new).
export async function tickHooks(productDir: string, hooks: HookDef[], now: Date, tz: string, fireOne: FireOne | null, log: (m: string) => void = () => {}): Promise<ClockTick[]> {
  const state = await readClock(productDir); const out: ClockTick[] = [];
  const timed = hooks.filter(h => h.on.kind === 'time');
  let dirty = false;
  for (const id of Object.keys(state)) if (!timed.some(h => h.id === id)) { delete state[id]; dirty = true; }
  for (const h of timed) {
    const s = parseSchedule(h.on.event); if (!s) { log(`clock: ${h.id} — unreadable schedule "${h.on.event}"`); continue; }
    const slot = lastSlot(s, now, tz), e = state[h.id];
    if (!e) { state[h.id] = { seen: now.toISOString(), last: slot?.toISOString() ?? null }; dirty = true; if (slot) out.push({ hook: h.id, node: forNode(h), slot: slot.toISOString(), firings: [], skipped: 'first sight' }); continue; }
    if (!slot || slot.getTime() <= Date.parse(e.last ?? e.seen)) continue;
    e.last = slot.toISOString(); await writeClock(productDir, state); dirty = false; // recorded before it runs
    const t: ClockTick = { hook: h.id, node: forNode(h), slot: e.last, firings: [] };
    if (inactive(h)) t.skipped = 'inactive';
    else if (!fireOne) t.skipped = 'hooks off';
    else { try { t.firings = await fireOne(h, t.node, slot); } catch (err) { log(`clock: ${h.id} — ${err instanceof Error ? err.message : err}`); } }
    out.push(t);
  }
  if (dirty) await writeClock(productDir, state);
  return out;
}

// One tick of a product: its time hooks against now in the person's zone, fired through the engine on the hook's
// `for:` node (its own node by default) with the event `time.<schedule>`.
export async function tick(product: string, now: Date = new Date(), o: { fire?: FireOne; log?: (m: string) => void } = {}): Promise<ClockTick[]> {
  const log = o.log ?? (m => console.log(`[wf] ${m}`));
  const scope = await loadScope(product); if (!scope) return [];
  const hooks = hooksOf(scope.graph);
  const tz = timeZoneOf(await readSettings());
  const { fire, hooksEnabled } = await import('./hooks-run');
  const fireOne: FireOne = o.fire ?? ((h, node, _slot) => fire(product, [{ kind: scope.idx.byId.get(node)?.kind ?? node.split(':')[0], id: node, event: `time.${h.on.event}`, depth: 0 }], log, { only: h.id, force: true }));
  return serial(product, async () => tickHooks(scope.product.dir, hooks, now, tz, (await hooksEnabled()) ? fireOne : null, log));
}

// ---- the ticker: one per server process, on globalThis across dev reloads; the interval calls whatever `run` the
// latest load of this module set, so a reload never leaves old code ticking and never arms a second interval
type Clock = { timer?: ReturnType<typeof setInterval>; run: () => Promise<void>; locks: Map<string, Promise<unknown>> };
const g = globalThis as unknown as { __wfClock?: Clock };
const clock = (): Clock => (g.__wfClock ??= { run: async () => {}, locks: new Map() });
// one tick per product at a time: the ticker and POST …/hooks/tick queue behind each other
function serial<T>(product: string, fn: () => Promise<T>): Promise<T> {
  const c = clock(); const next = (c.locks.get(product) ?? Promise.resolve()).then(fn, fn);
  c.locks.set(product, next.catch(() => {})); return next;
}
export async function tickAll(now: Date = new Date()): Promise<void> {
  if (process.env.WF_HOOKS === '0') return; // hooks-run#hooksOn
  for (const p of await listProducts()) await tick(p.slug, now).catch(e => console.log(`[wf] clock: ${p.slug} — ${e instanceof Error ? e.message : e}`));
}
clock().run = () => tickAll();
export function startClock(everyMs = 60000): void {
  const c = clock(); if (c.timer) return;
  c.timer = setInterval(() => { void clock().run().catch(() => {}); }, everyMs); c.timer.unref?.();
  setTimeout(() => { void clock().run().catch(() => {}); }, 3000).unref?.(); // the catch-up at startup, once the server answers
}
