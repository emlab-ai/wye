// What the command box has been asked before (task:palette-recent-commands): the last texts sent from a product,
// newest first, no duplicates — ↑ in the empty box walks back through them like a shell's history. Kept per product
// in localStorage (`wf-recent-<product>`), never sent anywhere; a private window that throws simply has no history.
export const RECENT_MAX = 10;
export const recentKey = (product: string) => `wf-recent-${product}`;

// Pure: the list as it is with the text on top, once.
export function withRecent(list: string[], text: string, max = RECENT_MAX): string[] {
  const t = text.trim();
  if (!t) return list;
  return [t, ...list.filter(x => x !== t)].slice(0, max);
}

export function loadRecent(product: string): string[] {
  try {
    const raw = localStorage.getItem(recentKey(product));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

// Remember one sent text; the new list is returned so the box can walk it without reading storage again.
export function rememberRecent(product: string, text: string): string[] {
  const next = withRecent(loadRecent(product), text);
  try { localStorage.setItem(recentKey(product), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
