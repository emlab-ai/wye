// The trailing "(key: value, key: value)" group of a prose node as a map, and back.
export function parseExtra(extra: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of extra.split(/,\s*(?=[a-z-]+:)/)) { const m = kv.match(/^\s*([a-z-]+):\s*(.*?)\s*$/); if (m && m[2]) out[m[1]] = m[2]; }
  return out;
}
export function withExtra(extra: string, key: string, value: string): string {
  const m = parseExtra(extra);
  if (value.trim()) m[key] = value.trim(); else delete m[key];
  return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(', ');
}
export const GOAL_STATUSES = ['proposed', 'on-track', 'at-risk', 'off-track', 'paused', 'complete', 'non-goal'];
export const TASK_STATUSES = ['todo', 'open', 'in-progress', 'blocked', 'done'];
