'use strict';
// One-off (Prompt Requests D1): plan documents become Prompt Requests. Per product: every `type: plan` document is
// renamed plan-<x>.md → pr-<x>.md with node pr:pr-<x>, type pr, the status mapped (proposed | defining | defined →
// refining when a running session holds it, else draft; the rest unchanged), part-of → the PRs page; the Plans page
// plans.md → prs.md (module:<p>-prs, "PRs", view:pr); every reference plan:<x> anywhere in the product's documents →
// pr:<x> (and task:plan-<x> → task:pr-<x>); every session's planDoc → prDoc with the new slug, its refs likewise.
// Usage: node scripts/plans-to-prs.js --product wye | --all [--dry]
const fs = require('fs'); const path = require('path');

const walk = (dir) => { let out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!['_build', '_sessions', 'node_modules', '.git'].includes(e.name)) out = out.concat(walk(p)); } else out.push(p); } return out; };
const fm = (md) => md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const get = (md, k) => fm(md).match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm'))?.[1].trim();
const set = (md, k, v) => { const f = md.match(/^---\n([\s\S]*?)\n---/); if (!f) return md; const re = new RegExp(`^${k}:.*$`, 'm'); const body = re.test(f[1]) ? f[1].replace(re, `${k}: ${v}`) : `${f[1]}\n${k}: ${v}`; return `---\n${body}\n---${md.slice(f[0].length)}`; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function migrate(productDir, { dry = false } = {}) {
  const files = walk(productDir).filter(f => f.endsWith('.md'));
  const sessionsDir = path.join(productDir, '_sessions');
  const sessions = fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir).filter(n => n.endsWith('.json')).map(n => path.join(sessionsDir, n)) : [];
  const running = new Set(sessions.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }).filter(s => s && s.status === 'running').flatMap(s => [s.planDoc, s.prDoc]).filter(Boolean).map(d => d.split('/').slice(1).join('/'))); // project/slug of what a live session holds
  const plans = files.filter(f => /^type:\s*plan\s*$/m.test(fm(fs.readFileSync(f, 'utf8'))));
  const renames = new Map(); // 'plan:plan-x' → 'pr:pr-x', 'task:plan-x' → 'task:pr-x', 'module:p-plans' → 'module:p-prs'
  const docs = [];
  for (const f of plans) {
    const md = fs.readFileSync(f, 'utf8'); const slug = path.basename(f, '.md'); const next = slug.replace(/^plan-/, 'pr-');
    renames.set(`plan:${slug}`, `pr:${next}`); renames.set(`task:${slug}`, `task:${next}`); docs.push({ f, slug, next, md });
  }
  const pages = [];
  for (const f of files) { const md = fs.readFileSync(f, 'utf8'); const node = get(md, 'node'); if (node && /^module:.+-plans$/.test(node)) { renames.set(node, node.replace(/-plans$/, '-prs')); pages.push(f); } }
  const write = (f, md) => { if (!dry) fs.writeFileSync(f, md); };
  const rewrite = (md) => { let out = md; for (const [from, to] of renames) out = out.replace(new RegExp(`(?<![\\w:/-])${esc(from)}(?![\\w-])`, 'g'), to); return out; };
  let refs = 0;
  for (const d of docs) {
    let md = rewrite(d.md);
    md = set(md, 'type', 'pr');
    const st = get(md, 'status') ?? 'draft';
    const ref = `${path.basename(path.dirname(path.dirname(d.f)))}/${d.slug}`;
    if (['proposed', 'defining', 'defined'].includes(st)) md = set(md, 'status', running.has(ref) ? 'refining' : 'draft');
    write(path.join(path.dirname(d.f), `${d.next}.md`), md); if (!dry) fs.unlinkSync(d.f);
  }
  for (const f of pages) {
    let md = rewrite(fs.readFileSync(f, 'utf8'));
    md = set(md, 'title', 'PRs').replace(/^# Plans$/m, '# PRs').replace(/<!-- view:plan -->/g, '<!-- view:pr -->');
    write(path.join(path.dirname(f), 'prs.md'), md); if (!dry && path.basename(f) === 'plans.md') fs.unlinkSync(f);
  }
  for (const f of files) {
    if (plans.includes(f) || pages.includes(f)) continue;
    const md = fs.readFileSync(f, 'utf8'); const out = rewrite(md);
    if (out !== md) { refs += (md.match(/plan:plan-/g) ?? []).length; write(f, out); }
  }
  let n = 0;
  for (const f of sessions) {
    let s; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    let changed = false;
    const doc = s.planDoc ?? s.prDoc;
    if (doc) { const parts = doc.split('/'); const slug = parts[2] ?? ''; const next = slug.replace(/^plan-/, 'pr-'); if (s.planDoc !== undefined || next !== slug) { s.prDoc = [parts[0], parts[1], next].join('/'); delete s.planDoc; changed = true; } }
    if (Array.isArray(s.refs)) { const r2 = s.refs.map(r => renames.get(r) ?? r); if (r2.some((r, i) => r !== s.refs[i])) { s.refs = r2; changed = true; } }
    if (Array.isArray(s.plans)) { s.prs = s.plans; delete s.plans; changed = true; }
    if (changed) { n++; write(f, JSON.stringify(s)); }
  }
  return { docs: docs.map(d => d.next), refs, sessions: n, pages: pages.map(f => path.dirname(f)) };
}
module.exports = { migrate };

if (require.main === module) {
  const args = process.argv.slice(2); const dry = args.includes('--dry');
  const root = path.join(__dirname, '..', 'data', 'products');
  const products = args.includes('--all') ? fs.readdirSync(root).filter(n => !n.startsWith('.') && fs.existsSync(path.join(root, n, '_product.md'))) : [args[args.indexOf('--product') + 1]].filter(Boolean);
  if (!products.length) { console.error('usage: node scripts/plans-to-prs.js --product <slug> | --all [--dry]'); process.exit(1); }
  for (const p of products) { const r = migrate(path.join(root, p), { dry }); console.log(`${p}: ${r.docs.length} document(s) → pr, ${r.pages.length} PRs page(s), ${r.refs} reference(s), ${r.sessions} session(s)${dry ? ' (dry run)' : ''}`); }
}
