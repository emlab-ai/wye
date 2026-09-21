'use strict';
// One-off (decision:wf2.pr-numbers): PRs are numbered like pull requests. Per product, every pr document whose slug is
// not a number gets one — one more than the highest number in use, in `started` order (oldest first): the file
// pr-<words>.md → pr-<n>.md, node pr:<words> → pr:<n>, task:pr-<words> → task:pr-<n>, every reference in the
// product's documents, every session's prDoc and refs. Usage: node scripts/prs-number.js --product wye | --all [--dry]
const fs = require('fs'); const path = require('path');

const walk = (dir) => { let out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!['_build', '_sessions', 'node_modules', '.git'].includes(e.name)) out = out.concat(walk(p)); } else out.push(p); } return out; };
const fm = (md) => md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const get = (md, k) => fm(md).match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm'))?.[1].trim();
const set = (md, k, v) => { const f = md.match(/^---\n([\s\S]*?)\n---/); if (!f) return md; const re = new RegExp(`^${k}:.*$`, 'm'); const body = re.test(f[1]) ? f[1].replace(re, `${k}: ${v}`) : `${f[1]}\n${k}: ${v}`; return `---\n${body}\n---${md.slice(f[0].length)}`; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function migrate(productDir, { dry = false } = {}) {
  const files = walk(productDir).filter(f => f.endsWith('.md'));
  const prs = files.map(f => ({ f, md: fs.readFileSync(f, 'utf8') })).filter(x => /^type:\s*pr\s*$/m.test(fm(x.md)) && /^node:\s*pr:/m.test(fm(x.md)));
  let max = 0; for (const x of prs) { const m = get(x.md, 'node').match(/^pr:(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  const todo = prs.filter(x => !/^pr:\d+$/.test(get(x.md, 'node'))).sort((a, b) => (get(a.md, 'started') ?? '').localeCompare(get(b.md, 'started') ?? '') || a.f.localeCompare(b.f));
  const renames = new Map(); const docs = [];
  for (const x of todo) {
    const num = ++max; const slug = path.basename(x.f, '.md'); const node = get(x.md, 'node');
    renames.set(node, `pr:${num}`); renames.set(`task:${slug}`, `task:pr-${num}`); docs.push({ ...x, slug, num });
  }
  const write = (f, md) => { if (!dry) fs.writeFileSync(f, md); };
  const rewrite = (md) => { let out = md; for (const [from, to] of renames) out = out.replace(new RegExp(`(?<![\\w:/-])${esc(from)}(?![\\w-])`, 'g'), to); return out; };
  let refs = 0;
  for (const d of docs) { write(path.join(path.dirname(d.f), `pr-${d.num}.md`), rewrite(d.md)); if (!dry) fs.unlinkSync(d.f); }
  const done = new Set(docs.map(d => d.f));
  for (const f of files) { if (done.has(f)) continue; const md = fs.readFileSync(f, 'utf8'); const out = rewrite(md); if (out !== md) { refs++; write(f, out); } }
  const sessionsDir = path.join(productDir, '_sessions'); let n = 0;
  const slugOf = new Map(docs.map(d => [d.slug, `pr-${d.num}`]));
  for (const name of fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir).filter(x => x.endsWith('.json')) : []) {
    const f = path.join(sessionsDir, name); let s; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    let changed = false;
    for (const key of ['prDoc', 'planDoc']) { const doc = s[key]; if (!doc) continue; const parts = doc.split('/'); const next = slugOf.get(parts[2]); if (next) { s[key] = [parts[0], parts[1], next].join('/'); changed = true; } }
    if (Array.isArray(s.refs)) { const r2 = s.refs.map(r => renames.get(r) ?? r); if (r2.some((r, i) => r !== s.refs[i])) { s.refs = r2; changed = true; } }
    if (changed) { n++; write(f, JSON.stringify(s)); }
  }
  return { docs: docs.map(d => `${d.slug} → pr-${d.num}`), refs, sessions: n };
}
module.exports = { migrate };

if (require.main === module) {
  const args = process.argv.slice(2); const dry = args.includes('--dry');
  const root = path.join(__dirname, '..', 'data', 'products');
  const products = args.includes('--all') ? fs.readdirSync(root).filter(n => !n.startsWith('.') && fs.existsSync(path.join(root, n, '_product.md'))) : [args[args.indexOf('--product') + 1]].filter(Boolean);
  if (!products.length) { console.error('usage: node scripts/prs-number.js --product <slug> | --all [--dry]'); process.exit(1); }
  for (const p of products) { const r = migrate(path.join(root, p), { dry }); console.log(`${p}: ${r.docs.length} PR(s) numbered, ${r.refs} document(s) with references, ${r.sessions} session(s)${dry ? ' (dry run)' : ''}`); for (const d of r.docs) console.log(`  ${d}`); }
}
