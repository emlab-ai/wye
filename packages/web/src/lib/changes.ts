// Change records (decision:exec.change-record, req:exec.change-kept, decision:exec.changes-from-the-rebuild-diff):
// every edit of a typed node keeps its old value beside the document. The write goes through as today — the
// document shows the new value, git has the history — and the app writes a record (store:changes,
// `<product>/_changes/<id>.json`) from the watcher's rebuild diff: the node before and after (text and properties),
// who (the person, or the session), when, and a state — pending (listed in the Inbox under Changes), accepted,
// reverted. Writers do not write records; they claim the write (claimWrite) so the record names them. A change of
// only status and tracking keys is recorded accepted and never listed; a paragraph (block:) has no record.
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { parseBody, type GraphData, type GraphNode } from './graph';
import { docIdOf } from './doc';
import type { BlockChange } from './session-types';
import { withFileLock } from './write';

export type ChangeState = 'pending' | 'accepted' | 'reverted';
export type NodeValue = { text: string; textKey: string; status: string; props: Record<string, string>; body: string; title: string };
export type ChangeRecord = {
  id: string; product: string; node: string; kind: string; doc: string; file: string; line: number;
  before: NodeValue; after: NodeValue; changed: string[];          // the keys that differ (text, status, or a property)
  by: string; session?: string; at: string; updatedAt: string; state: ChangeState;
  also?: string[];                                                 // later writers whose edits folded into this record
  tracking?: boolean;                                              // only status / tracking keys changed: accepted at once, not listed
  own?: boolean;                                                   // a person's edit of a proposed block: accepted at once
  acceptedBy?: string; acceptedAt?: string; revertedBy?: string; revertedAt?: string; revertOf?: string;
  impact?: unknown;                                                // the impact run (E.3, lib/impact-run)
};

// Keys the app moves on its own or a person sets as tracking, not meaning (decision:exec.changes-from-the-rebuild-diff)
export const TRACKING_KEYS = new Set(['status', 'session', 'produced', 'worker', 'owner', 'priority', 'ready', 'last-verified', 'by', 'since', 'until', 'finished', 'started', 'evidence', 'date', 'due', 'agent', 'task', 'role', 'change', 'verified', 'progress']);
// Kinds whose edits are recorded: typed knowledge and work, not generated or structural nodes
export const RECORDED = (n: Pick<GraphNode, 'kind' | 'form' | 'defined'>) => n.defined && n.form !== 'block' && !['field', 'prop', 'block', 'verdict', 'contradiction', 'module', 'pr', 'product', 'type', 'drift'].includes(n.kind);
const TEXT_KEYS = ['text', 'statement', 'description', 'purpose', 'q', 'title'];


// A node's value as the record keeps it: the main text, the status, every other key as a property.
export function nodeValue(n: Pick<GraphNode, 'body' | 'status' | 'title'>): NodeValue {
  const rows = parseBody(n.body);
  const props: Record<string, string> = {};
  let text = '';
  const textKey = rows.some(r => r.key === 'title') ? 'title' : TEXT_KEYS.find(k => rows.some(r => r.key === k));
  for (const r of rows) {
    if (r.key === textKey) { text = r.value; continue; }
    if (r.key === 'status') continue;
    props[r.key] = r.value;
  }
  return { text, textKey: textKey ?? 'text', status: n.status || '', props, body: n.body, title: n.title };
}

// The keys that differ between two values: 'text', 'status', or the property name.
export function changedKeys(a: NodeValue, b: NodeValue): string[] {
  const out: string[] = [];
  if (a.text.trim() !== b.text.trim()) out.push('text');
  if (a.status !== b.status) out.push('status');
  for (const k of new Set([...Object.keys(a.props), ...Object.keys(b.props)])) if ((a.props[k] ?? '').trim() !== (b.props[k] ?? '').trim()) out.push(k);
  return out;
}
export const isTrackingOnly = (keys: string[]) => keys.length > 0 && keys.every(k => TRACKING_KEYS.has(k));
export const valueHash = (v: NodeValue) => createHash('sha1').update(JSON.stringify([v.text, v.status, v.props])).digest('hex').slice(0, 12);

// Who wrote: writers claim a node (or a file) before they write; the watcher's record takes the claim. A claim
// lives a minute. With no claim, exactly one running session is credited as the writer; else "person".
// silent: the write is the app's own record-keeping (a revert, an applied patch) — already recorded, no new record
type Claim = { by: string; session?: string; at: number; silent?: boolean };
const claims = (globalThis as unknown as { __wfWriteClaims?: Map<string, Claim> }).__wfWriteClaims ??= new Map();
export function claimWrite(key: string, who: { by?: string; session?: string; silent?: boolean }): void {
  claims.set(key, { by: who.by || (who.session ? `agent:${who.session}` : 'person'), session: who.session, at: Date.now(), ...(who.silent ? { silent: true } : {}) });
}
export function takeClaim(nodeId: string, file: string): Claim | null {
  for (const k of [nodeId, file]) { const c = claims.get(k); if (c && Date.now() - c.at < 60_000) { if (k === nodeId) claims.delete(k); return c; } }
  return null;
}

// The records a rebuild diff produces (pure): one per changed recorded node, `before` from the graph the watcher
// last saw, `after` from the new one. `who` resolves attribution per node.
export function recordsFromDiff(before: GraphData, after: GraphData, changes: BlockChange[], who: (id: string, file: string) => { by: string; session?: string; silent?: boolean }, at: string, product: string): Omit<ChangeRecord, 'id' | 'updatedAt'>[] {
  const old = new Map(before.nodes.map(n => [n.id, n]));
  const cur = new Map(after.nodes.map(n => [n.id, n]));
  const out: Omit<ChangeRecord, 'id' | 'updatedAt'>[] = [];
  for (const c of changes) {
    if (c.change !== 'changed') continue;
    const o = old.get(c.id), n = cur.get(c.id); if (!o || !n || !RECORDED(n) || !RECORDED(o)) continue;
    const a = nodeValue(o), b = nodeValue(n);
    const changed = changedKeys(a, b); if (!changed.length) continue;
    const w = who(c.id, n.file); if (w.silent) continue;
    const tracking = isTrackingOnly(changed);
    const own = !tracking && !w.session && !w.by.startsWith('agent:') && ['proposed', 'draft', 'open', ''].includes(b.status);
    out.push({ product, node: c.id, kind: n.kind, doc: docIdOf(after, n.file) ?? '', file: n.file, line: n.line, before: a, after: b, changed, by: w.by, session: w.session, at, state: tracking || own ? 'accepted' : 'pending', ...(tracking ? { tracking: true } : {}), ...(own ? { own: true } : {}) });
  }
  return out;
}

// ---- the store
const dir = (productDir: string) => path.join(productDir, '_changes');
const file = (productDir: string, id: string) => path.join(dir(productDir), `${id}.json`);
export async function listChanges(productDir: string, f: { state?: ChangeState; node?: string; listed?: boolean } = {}): Promise<ChangeRecord[]> {
  let names: string[] = []; try { names = (await readdir(dir(productDir))).filter(n => n.endsWith('.json')); } catch { return []; }
  const out: ChangeRecord[] = [];
  for (const n of names) { try { const r = JSON.parse(await readFile(path.join(dir(productDir), n), 'utf8')) as ChangeRecord; if ((!f.state || r.state === f.state) && (!f.node || r.node === f.node) && (!f.listed || !r.tracking)) out.push(r); } catch { /* skip */ } }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getChange(productDir: string, id: string): Promise<ChangeRecord | null> {
  if (!/^[a-z0-9]{6,20}$/.test(id)) return null;
  try { return JSON.parse(await readFile(file(productDir, id), 'utf8')); } catch { return null; }
}
export async function saveChange(productDir: string, r: ChangeRecord): Promise<void> {
  await mkdir(dir(productDir), { recursive: true });
  const f = file(productDir, r.id); const tmp = `${f}.tmp-${process.pid}-${randomBytes(3).toString('hex')}`;
  await writeFile(tmp, JSON.stringify(r, null, 2)); await rename(tmp, f);
}
export async function mutateChange<T>(productDir: string, id: string, fn: (r: ChangeRecord) => T | Promise<T>): Promise<T | null> {
  return withFileLock(file(productDir, id), async () => { const r = await getChange(productDir, id); if (!r) return null; const v = await fn(r); r.updatedAt = new Date().toISOString(); await saveChange(productDir, r); return v; });
}

// Write the records of a rebuild: a pending record on the same node takes a later edit — one record per node
// (decision:exec.impact-trigger); otherwise a new record. Returns the records touched.
export async function recordChanges(productDir: string, product: string, before: GraphData, after: GraphData, changes: BlockChange[], who: (id: string, file: string) => { by: string; session?: string; silent?: boolean }): Promise<ChangeRecord[]> {
  const now = new Date().toISOString();
  const fresh = recordsFromDiff(before, after, changes, who, now, product);
  if (!fresh.length) return [];
  const open = await listChanges(productDir, { state: 'pending' });
  const out: ChangeRecord[] = [];
  for (const r of fresh) {
    // one pending record per node (decision:exec.change-record): a later edit — whoever made it, whenever — folds into
    // the open record, which keeps its original `before`, takes the new `after` and names every writer; an edit that
    // brings the node back to where the record started leaves nothing to review and closes it
    const prev = open.find(o => o.node === r.node);
    if (prev && !r.tracking) {
      await mutateChange(productDir, prev.id, o => {
        o.after = r.after; o.changed = changedKeys(o.before, r.after); o.line = r.line;
        if (o.by !== r.by) { o.also = [...new Set([...(o.also ?? []), r.by])]; if (r.session && !o.session) o.session = r.session; }
        if (!o.changed.length) o.state = 'accepted';
        return o;
      });
      const cur = await getChange(productDir, prev.id); if (cur && cur.state === 'pending') out.push(cur);
      continue;
    }
    const rec: ChangeRecord = { id: randomBytes(5).toString('hex'), updatedAt: now, ...r };
    await saveChange(productDir, rec); out.push(rec);
  }
  return out;
}

// Whether the node moved on since the record's `after` (req:exec.change-review "changed since"): the current value's
// hash differs from the record's.
export function changedSince(r: ChangeRecord, current: GraphNode | undefined): boolean {
  if (!current) return true;
  return valueHash(nodeValue(current)) !== valueHash(r.after);
}

// The patch that puts `before` back (req:exec.change-review Revert): text, status and every property; a property
// only `after` has is removed (null).
export function revertPatch(r: ChangeRecord): { status?: string; text?: string; props: Record<string, string | null> } {
  const props: Record<string, string | null> = {};
  for (const k of r.changed) { if (k === 'text' || k === 'status') continue; props[k] = r.before.props[k] ?? null; }
  // a card's title is patched as a property; a text key (text, statement, q…) through `text`
  if (r.changed.includes('text')) { if (r.before.textKey === 'title') props.title = r.before.text; }
  return { ...(r.changed.includes('status') ? { status: r.before.status } : {}), ...(r.changed.includes('text') && r.before.textKey !== 'title' ? { text: r.before.text } : {}), props };
}
