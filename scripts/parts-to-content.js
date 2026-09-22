'use strict';
// A card's text keys become its content blocks (decision:wf2.parts-are-content): `statement:` / `scope:` /
// `rationale:` / `note:` on a constraint or a rule move under the card as `- statement:<slug> …` part lines — each a
// block the person edits or deletes — and the keys leave the card. A key whose value is ids (a `scope:` link list,
// a `rationale:` that names a decision) is a link and stays. A card with no title gets its statement's first sentence
// as one, so it reads as before. Goes through the running app (op:node.content, op:node.edit) so the same write
// path, rebuild and change records apply. Usage: node scripts/parts-to-content.js --product wye [--kind constraint,rule] [--dry]
const fs = require('fs'); const path = require('path');
const WF = process.env.WYE_URL || process.env.WF_URL || 'http://localhost:3456';
const argv = process.argv.slice(2);
const KINDS = (argv.includes('--kind') ? argv[argv.indexOf('--kind') + 1] : 'constraint,rule').split(',');
const KEYS = { constraint: ['statement', 'scope', 'rationale', 'note'], rule: ['statement', 'note', 'rationale'] };
const ID = /^[a-z][a-z0-9-]*:[A-Za-z0-9_.\/#-]+$/;

function valuesOf(body) {
  const out = {}; let key = null;
  for (const l of body.split('\n')) { const m = l.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/); if (m && !/^\s/.test(l)) { key = m[1]; out[key] = (m[2] ?? '').replace(/^[>|]-?\s*$/, '').trim(); continue; } if (key && /^\s/.test(l)) out[key] = (out[key] ? out[key] + ' ' : '') + l.trim(); }
  return out;
}
const isLinks = v => { const t = v.replace(/^\[|\]$/g, '').trim(); return !!t && t.split(/,\s*/).every(x => ID.test(x.trim())); };
async function api(method, url, body) { const r = await fetch(`${WF}${url}`, { method, headers: { 'content-type': 'application/json', 'x-wf-by': 'migration' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${j.message || j.error || ''}`); return j; }

async function main() {
  const dry = argv.includes('--dry'); const product = argv[argv.indexOf('--product') + 1];
  if (!product) { console.error('usage: node scripts/parts-to-content.js --product <slug> [--kind constraint,rule] [--dry]'); process.exit(1); }
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products', product, '_build', 'graph.json'), 'utf8'));
  const todo = g.nodes.filter(n => KINDS.includes(n.kind) && n.defined && (n.form ?? 'yaml') !== 'prose' && !(n.partKeys ?? []).length && (KEYS[n.kind] ?? []).some(k => new RegExp(`^${k}:`, 'm').test(n.body)));
  console.log(`${product}: ${todo.length} card(s) to move`);
  let done = 0;
  for (const n of todo) {
    const v = valuesOf(n.body); const slug = n.id.slice(n.id.indexOf(':') + 1);
    const lines = []; const drop = {};
    for (const k of KEYS[n.kind]) { if (!v[k] || isLinks(v[k])) continue; lines.push(`- ${k}:${slug} ${v[k]}`); drop[k] = null; }
    if (!lines.length) continue;
    if (!v.title && v.statement && !isLinks(v.statement)) { const first = (v.statement.match(/^(.+?[.;:!?])(\s|$)/) || [null, v.statement])[1]; drop.title = first.length > 110 ? first.slice(0, 110).replace(/\s+\S*$/, '') : first; }   // a long sentence is cut at a word, never inside an id
    if (dry) { console.log(`  ${n.id}: ${lines.map(l => l.split(' ')[1].split(':')[0]).join(', ')}${drop.title ? ' + title' : ''}`); continue; }
    try {
      const cur = await api('GET', `/api/${product}/node/${encodeURIComponent(n.id)}/content`);
      const content = [lines.join('\n\n'), (cur.content ?? '').trim()].filter(Boolean).join('\n\n');
      await api('PUT', `/api/${product}/node/${encodeURIComponent(n.id)}/content`, { content, ifMatch: cur.bodyHash });
      await api('PUT', `/api/${product}/node/${encodeURIComponent(n.id)}`, { props: drop });
      done++; if (done % 10 === 0) console.log(`  ${done}/${todo.length}`);
    } catch (e) { console.error(`  ${n.id}: ${e.message}`); }
  }
  console.log(`moved ${done}`);
}
main().catch(e => { console.error(e); process.exit(1); });
