// Folders become pages (decision:wf2.no-projects): every projects/<p>/ of a product gets one ordinary document — the
// folder's title, icon and description — and the folder's top-level documents become its children (`part-of:`).
// Nothing moves, so no URL changes. Re-running it does nothing new. `node scripts/projects-to-pages.mjs --root
// data/products/<p> [--dry-run]`, then `wye build --root data/products/<p>`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2); const root = args[args.indexOf('--root') + 1]; const dry = args.includes('--dry-run');
if (!root || !existsSync(path.join(root, 'projects'))) { console.error('--root data/products/<product>'); process.exit(1); }
const fm = md => { const m = md.match(/^---\n([\s\S]*?)\n---\n?/); const o = {}; if (m) for (const l of m[1].split('\n')) { const k = l.match(/^([\w-]+):\s*(.*)$/); if (k) o[k[1]] = k[2].trim(); } return { o, end: m ? m[0].length : 0, raw: m?.[1] ?? '' }; };
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
const taken = new Set(); for (const p of readdirSync(path.join(root, 'projects'))) { const d = path.join(root, 'projects', p, 'docs'); if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.md')) { const n = fm(readFileSync(path.join(d, f), 'utf8')).o.node; if (n) taken.add(n); } }

for (const p of readdirSync(path.join(root, 'projects'))) {
  const pf = path.join(root, 'projects', p, '_project.md'); const docs = path.join(root, 'projects', p, 'docs');
  if (!existsSync(pf) || !existsSync(docs)) continue;
  const meta = fm(readFileSync(pf, 'utf8')).o; const title = meta.title || p; const name = slugify(title);
  const pageFile = path.join(docs, `${name}.md`); let node = `module:${name}`;
  if (existsSync(pageFile)) node = fm(readFileSync(pageFile, 'utf8')).o.node || node;
  else {
    let n = 2; while (taken.has(node)) node = `module:${name}-${n++}`; taken.add(node);
    const page = `---\nnode: ${node}\ntype: module\ntitle: ${title}\n${meta.icon ? `icon: ${meta.icon}\n` : ''}---\n\n# ${title}\n\n${meta.description ? `${meta.description}\n` : ''}`;
    console.log(`${dry ? 'would write' : 'write'} ${pageFile}`); if (!dry) writeFileSync(pageFile, page);
  }
  for (const f of readdirSync(docs).filter(f => f.endsWith('.md'))) {
    const file = path.join(docs, f); if (file === pageFile) continue;
    const md = readFileSync(file, 'utf8'); const { o, end, raw } = fm(md);
    if (!end || o['part-of'] || o.node === node) continue;   // already under something, or no frontmatter
    console.log(`${dry ? 'would put' : 'put'} ${f} under ${node}`);
    if (!dry) writeFileSync(file, `---\n${raw}\npart-of: ${node}\n---\n${md.slice(end).replace(/^\n?/, '\n')}`);
  }
}
