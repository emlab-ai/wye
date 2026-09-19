// The trailing "(key: value, key: value)" group of a prose node as a map, and back.
// keys follow lib/parse.js: a word, camelCase allowed (a type's `startDate`)
export const EXTRA_KEY = '[A-Za-z][A-Za-z0-9_-]*';
export const EXTRA_GROUP = new RegExp(`\\s*\\((${EXTRA_KEY}:\\s*[^()]*?(?:,\\s*${EXTRA_KEY}:\\s*[^()]*?)*)\\)\\s*$`);
export const EXTRA_SPLIT = new RegExp(`,\\s*(?=${EXTRA_KEY}:)`);
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
export const GOAL_STATUSES = ['proposed', 'on-track', 'at-risk', 'off-track', 'paused', 'complete', 'non-goal'];
// every status the parser knows (lib/parse.js STATUS_TAG), for nodes of any other kind
export const STATUSES = ['', 'proposed', 'approved', 'unverified', 'api-only', 'shipped', 'deprecated', 'question', 'open', 'in-progress', 'blocked', 'done', 'non-goal', 'draft', 'active', 'complete', 'on-track', 'at-risk', 'off-track', 'paused', 'resolved', 'rejected', 'superseded', 'retired'];
export const TASK_STATUSES = ['todo', 'open', 'in-progress', 'blocked', 'done'];
