// Suggested actions (decision:ea.suggested-actions): what the assistant suggests the director does now — follow up on a
// project gone quiet, answer a thread, check a commitment due soon — each a suggestion: card (type of the package) in the
// project's Suggestions page, about one item, with why. The Digest lists the open ones at the top as a live table; the
// director ticks one done or dismisses it there. skill:ea.suggest-actions writes them with `wye ea suggest`; a second
// suggestion of the same action about the same item renews the one that is open instead of adding another.
import { loadScope, mainProject } from '../scope';
import { addInstance } from '../instance-add';
import { editNode } from '../node-edit';
import { claimWrite } from '../changes';
import { rebuild } from '../write';
import { cardValue } from '../hooks';
import { typeBySlug } from '../types';
import { today } from './model';
import { idPrefix } from './read';

export type Suggestion = { id: string; title: string; status: string; about: string; why: string; suggested: string; source: string };
const CLOSED = new Set(['done', 'dismissed', 'shipped', 'complete', 'cancelled']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 3);
// the same action: about the same item and mostly the same words (renewed, not repeated)
export function sameAction(a: { about: string; title: string }, b: { about: string; title: string }): boolean {
  if (a.about !== b.about) return false;
  const x = new Set(words(a.title)), y = words(b.title);
  if (!x.size || !y.length) return a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
  return y.filter(w => x.has(w)).length / Math.max(x.size, y.length) >= 0.5;
}

export async function listSuggestions(product: string, all = false): Promise<Suggestion[]> {
  const scope = await loadScope(product); if (!scope) return [];
  return scope.graph.nodes.filter(n => n.kind === 'suggestion' && n.defined && (all || !CLOSED.has(n.status)))
    .map(n => ({ id: n.id, title: n.title, status: n.status, about: cardValue(n.body, 'about').trim(), why: cardValue(n.body, 'why').trim(), suggested: cardValue(n.body, 'suggested').trim(), source: cardValue(n.body, 'source').trim() }));
}

export async function addSuggestion(product: string, s: { title: string; about?: string; why: string; source?: string; date?: string }, by = 'agent:ea'): Promise<{ ok: true; id: string; renewed: boolean } | { ok: false; status: number; message: string }> {
  const title = s.title.replace(/\s+/g, ' ').trim(); const why = s.why.replace(/\s+/g, ' ').trim();
  if (!title || !why) return { ok: false, status: 422, message: 'a suggestion needs the action and why' };
  const scope = await loadScope(product); if (!scope) return { ok: false, status: 404, message: `no product ${product}` };
  if (!typeBySlug(scope.graph, 'suggestion')) return { ok: false, status: 422, message: `${product} does not declare type:suggestion — open its packages listing so the executive-assistant package declares its new types` };
  if (s.about && !scope.idx.byId.get(s.about)?.defined) return { ok: false, status: 422, message: `${s.about} is not an item of ${product}` };
  const about = s.about ?? '';
  const date = s.date ?? today();
  const open = (await listSuggestions(product)).find(o => sameAction(o, { about, title }));
  const safe = (v: string) => v.replace(/[()]/g, '').replace(/,/g, ';');
  if (open) {
    claimWrite(open.id, { by });
    const r = await editNode(scope, open.id, { props: { why: safe(why), suggested: date } });
    return r.ok ? { ok: true, id: open.id, renewed: true } : { ok: false, status: 422, message: r.message };
  }
  const project = mainProject(scope); if (!project) return { ok: false, status: 422, message: `${product} has no project` };
  const base = `${idPrefix(scope)}.${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44)}`;
  let slug = base; let n = 2; while (scope.idx.byId.get(`suggestion:${slug}`)) slug = `${base}-${n++}`;
  const r = await addInstance(scope, 'suggestion', { slug, title, status: 'open', props: { ...(about ? { about } : {}), why: safe(why), suggested: date, source: s.source ?? 'daily' }, home: `${project.slug}/suggestions`, rebuild: true });
  if (!r.ok) return { ok: false, status: r.status ?? 422, message: r.message };
  claimWrite(`suggestion:${slug}`, { by });
  return { ok: true, id: `suggestion:${slug}`, renewed: false };
}

export async function closeSuggestion(product: string, id: string, how: 'done' | 'dismissed', reason?: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const scope = await loadScope(product); if (!scope) return { ok: false, status: 404, message: `no product ${product}` };
  if (!scope.idx.byId.get(id)?.defined || !id.startsWith('suggestion:')) return { ok: false, status: 404, message: `${id} is not a suggestion` };
  claimWrite(id, { by: 'agent:ea' });
  const r = await editNode(scope, id, { status: how, ...(reason ? { props: { reason: reason.replace(/[()]/g, '').replace(/,/g, ';') } } : {}) });
  if (r.ok) await rebuild(scope.product.dir);
  return r.ok ? { ok: true } : { ok: false, status: 422, message: r.message };
}
