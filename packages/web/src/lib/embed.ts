// An embedded node (component:embed-block): the node as the API returns it → the card props the shared card
// components render, and a card edit → the patch op:node.edit takes. Pure; the component does the fetching.
import { parseBody } from './graph';
import { nodePropsFromChunk } from './import';
import { parseExtra } from './props';
import type { NodePatch } from './node-edit';
import type { CardP } from '@/components/NodeCards';

export type ApiNode = { id: string; kind: string; status: string; body: string; form?: string; file?: string; title?: string };

export function cardFromNode(n: ApiNode): CardP {
  const [kind, ...rest] = n.id.split(':'); const slug = rest.join(':');
  if (n.form === 'prose') {
    const rows = parseBody(n.body);
    const extra = rows.filter(r => !['id', 'text', 'status'].includes(r.key)).map(r => `${r.key}: ${r.value}`).join(', ');
    const status = n.status || rows.find(r => r.key === 'status')?.value || '';
    return { kind, slug, status, form: 'prose', textKey: 'text', body: n.body, extra, check: kind === 'task' ? (status === 'done' ? 'done' : 'todo') : '', row: '' };
  }
  const y = nodePropsFromChunk({ id: n.id, body: n.body });
  return { kind, slug, status: y?.props.status ?? n.status ?? '', form: 'yaml', textKey: y?.props.textKey ?? 'title', body: n.body, extra: '', check: '', row: '' };
}

// The text a card shows in its text slot: the text key of the body.
export function cardText(p: CardP): string { return parseBody(p.body).find(r => r.key === p.textKey)?.value ?? ''; }

export function cardPatchToNodePatch(p: CardP, patch: Partial<CardP>): NodePatch {
  const out: NodePatch = {}; const props: Record<string, string | null> = {};
  if (patch.status !== undefined && patch.status !== p.status) out.status = patch.status;
  if (patch.body !== undefined && patch.body !== p.body) {
    const was = new Map(parseBody(p.body).map(r => [r.key, r.value])), now = new Map(parseBody(patch.body).map(r => [r.key, r.value]));
    for (const [k, v] of now) { if (k === 'id' || was.get(k) === v) continue; if (k === 'status') out.status = v.split(/\s+#/)[0].trim(); else if (p.form === 'prose' && k === 'text') out.text = v; else props[k] = v; }
    for (const k of was.keys()) if (!now.has(k) && k !== 'id') { if (k === 'status') out.status = ''; else props[k] = null; }
  }
  if (patch.extra !== undefined && patch.extra !== p.extra) {
    const was = parseExtra(p.extra), now = parseExtra(patch.extra);
    for (const [k, v] of Object.entries(now)) if (was[k] !== v) props[k] = v;
    for (const k of Object.keys(was)) if (!(k in now)) props[k] = null;
  }
  if (Object.keys(props).length) out.props = props;
  return out;
}
