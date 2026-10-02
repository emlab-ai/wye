// The trailing "(key: value, key: value)" group of a prose node as a map, and back.
// keys follow lib/parse.js: a word, camelCase allowed (a type's `startDate`)
export const EXTRA_KEY = '[A-Za-z][A-Za-z0-9_-]*';
export const EXTRA_GROUP = new RegExp(`\\s*\\((${EXTRA_KEY}:\\s*[^()]*?(?:,\\s*${EXTRA_KEY}:\\s*[^()]*?)*)\\)\\s*$`);
// a comma inside [] separates list items, never keys — an id like rule:x looks like a key otherwise (as lib/parse.js)
export const EXTRA_SPLIT = new RegExp(`,\\s*(?![^[\\]]*\\])(?=${EXTRA_KEY}:)`);
export function parseExtra(extra: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of extra.split(EXTRA_SPLIT)) { const m = kv.match(new RegExp(`^\\s*(${EXTRA_KEY}):\\s*(.*?)\\s*$`)); if (m && m[2]) out[m[1]] = m[2]; }
  return out;
}
export function withExtra(extra: string, key: string, value: string): string {
  const m = parseExtra(extra);
  if (value.trim()) m[key] = value.trim(); else delete m[key];
  return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(', ');
}
// Each type's statuses (decision:wf2.statuses-per-type): its own list — the product's override for a base kind, set in
// _product.md, already applied by the parser — else the nearest ancestor's. A picker offers these and nothing else.
export function statusesByKind(types: { slug: string; chain?: string[]; statuses?: string[] }[]): Record<string, string[]> {
  const bySlug = new Map(types.map(t => [t.slug, t]));
  const out: Record<string, string[]> = {};
  for (const t of types) {
    for (const id of [...(t.chain ?? [`type:${t.slug}`])].reverse()) { const s = bySlug.get(id.replace(/^type:/, ''))?.statuses; if (s?.length) { out[t.slug] = s; break; } }
  }
  return out;
}
// the picker's options for a node: its type's statuses, plus the one it has when that is not among them
export function statusOptions(byKind: Record<string, string[]>, kind: string, current = ''): string[] {
  const list = byKind[kind] ?? byKind.node ?? STATUSES.filter(Boolean);
  return ['', ...(current && !list.includes(current) ? [current] : []), ...list];
}
export const GOAL_STATUSES = ['proposed', 'on-track', 'at-risk', 'off-track', 'paused', 'complete', 'non-goal'];
// every status the parser knows (lib/parse.js STATUS_TAG), for nodes of any other kind
export const STATUSES = ['', 'proposed', 'approved', 'unverified', 'api-only', 'shipped', 'deprecated', 'question', 'open', 'in-progress', 'blocked', 'done', 'non-goal', 'draft', 'active', 'complete', 'on-track', 'at-risk', 'off-track', 'paused', 'resolved', 'rejected', 'superseded', 'retired', 'dismissed', 'review', 'refining', 'building', 'running', 'waiting', 'todo', 'ready', 'skipped', 'cancelled', 'failed'];
// review: an agent finished and a person checks (decision:exec.task-is-the-unit)
export const TASK_STATUSES = ['todo', 'open', 'in-progress', 'blocked', 'review', 'done'];
// a PR's life (decision:wf2.pr-lifecycle): draft, refining while a librarian is on it, approved by the person, building while a worker holds its request task
export const PR_STATUSES = ['draft', 'refining', 'approved', 'building', 'done', 'failed', 'cancelled'];
