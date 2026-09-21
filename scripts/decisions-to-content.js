'use strict';
// One-off (decision:wf2.decision-free-text): a decision's ADR keys become its content blocks. For every yaml decision
// card with context / choice / alternatives / consequences: the choice as the first paragraph of the card's content,
// then "**Context** — …", "**Alternatives** — …", "**Consequences** — …" paragraphs (each editable in place), and the
// four keys removed from the card. Goes through the running app (op:node.content, op:node.edit) so the same write
// path, rebuild and change records apply. Usage: node scripts/decisions-to-content.js --product waterfall [--dry]
const fs = require('fs'); const path = require('path');
const WF = process.env.WF_URL || 'http://localhost:3456';
const KEYS = ['choice', 'context', 'alternatives', 'consequences'];
const LABEL = { context: 'Context', alternatives: 'Alternatives', consequences: 'Consequences' };

function valuesOf(body) {
  // the card's keys as the graph keeps them (folded values are one line)
  const out = {}; let key = null;
  for (const l of body.split('\n')) { const m = l.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/); if (m && !/^\s/.test(l)) { key = m[1]; out[key] = (m[2] ?? '').replace(/^[>|]-?\s*$/, '').trim(); continue; } if (key && /^\s+\S/.test(l)) out[key] = (out[key] + ' ' + l.trim()).trim(); }
  return out;
}
async function api(method, url, body) { const r = await fetch(`${WF}${url}`, { method, headers: { 'content-type': 'application/json', 'x-wf-by': 'migration' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${j.message ?? j.error ?? ''}`); return j; }

async function main() {
  const args = process.argv.slice(2); const dry = args.includes('--dry'); const product = args[args.indexOf('--product') + 1];
  if (!product) { console.error('usage: node scripts/decisions-to-content.js --product <slug> [--dry]'); process.exit(1); }
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products', product, '_build', 'graph.json'), 'utf8'));
  const todo = g.nodes.filter(n => n.kind === 'decision' && n.defined && (n.form ?? 'yaml') !== 'prose' && KEYS.some(k => new RegExp(`^${k}:`, 'm').test(n.body)));
  console.log(`${product}: ${todo.length} decision(s) to move`);
  let done = 0;
  for (const n of todo) {
    const v = valuesOf(n.body);
    const paras = [];
    if (v.choice) paras.push(v.choice);
    for (const k of ['context', 'alternatives', 'consequences']) if (v[k]) paras.push(`**${LABEL[k]}** — ${v[k]}`);
    if (!paras.length) continue;
    if (dry) { console.log(`  ${n.id}: ${paras.length} paragraph(s)`); continue; }
    try {
      const cur = await api('GET', `/api/${product}/node/${encodeURIComponent(n.id)}/content`);
      const content = [paras.join('\n\n'), (cur.content ?? '').trim()].filter(Boolean).join('\n\n');
      await api('PUT', `/api/${product}/node/${encodeURIComponent(n.id)}/content`, { content, ifMatch: cur.bodyHash });
      await api('PUT', `/api/${product}/node/${encodeURIComponent(n.id)}`, { props: { choice: null, context: null, alternatives: null, consequences: null } });
      done++; if (done % 10 === 0) console.log(`  ${done}/${todo.length}`);
    } catch (e) { console.log(`  ${n.id}: ${e.message}`); }
  }
  console.log(`${product}: ${done} moved`);
}
main().catch(e => { console.error(e); process.exit(1); });
