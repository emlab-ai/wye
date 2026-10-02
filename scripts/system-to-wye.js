'use strict';
// One-off: a project's system pages leave its docs/ for projects/<p>/.wye/ (decision:wf2.system-pages-in-wye), so no
// page a person makes can collide with one. A file moves when its node says it is the app's — never by its name alone:
// the rail views and folders (module:<project>-goals|work|hooks|skills|prs|workflow-runs), the Comments page
// (module:comments), PRs (pr:), skills (skill:), workflows (workflow:) and runs (run:). Nothing inside a file changes:
// links between pages are by node id. Usage: node scripts/system-to-wye.js --product wye | --all [--dry]
const fs = require('fs'); const path = require('path');

const node = (md) => md.match(/^---\n[\s\S]*?^node:[ \t]*(\S+)[\s\S]*?\n---/m)?.[1] ?? '';
const isSystem = (id, project) => /^(pr|skill|workflow|run):/.test(id) || id === 'module:comments'
  || new RegExp(`^module:${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(goals|work|hooks|skills|prs|workflow-runs)$`).test(id);

function migrate(productDir, { dry = false } = {}) {
  const moved = []; const clashes = [];
  const projects = path.join(productDir, 'projects');
  if (!fs.existsSync(projects)) return { moved, clashes };
  for (const project of fs.readdirSync(projects)) {
    const docs = path.join(projects, project, 'docs'); const wye = path.join(projects, project, '.wye');
    if (!fs.existsSync(docs)) continue;
    for (const f of fs.readdirSync(docs)) {
      if (!f.endsWith('.md')) continue;
      const from = path.join(docs, f);
      if (!fs.statSync(from).isFile()) continue;
      const md = fs.readFileSync(from, 'utf8');
      // an empty file under a system page's name (a Workflow runs page emptied when its cards moved to run pages) goes too
      if (!isSystem(node(md), project) && !(md.trim() === '' && /^(goals|work|hooks|skills|prs|comments|workflow-runs)\.md$/.test(f))) continue;
      const to = path.join(wye, f);
      if (fs.existsSync(to)) { clashes.push(path.relative(productDir, from)); continue; }
      if (!dry) { fs.mkdirSync(wye, { recursive: true }); fs.renameSync(from, to); }
      moved.push(path.relative(productDir, to));
    }
  }
  return { moved, clashes };
}

if (require.main === module) {
  const args = process.argv.slice(2); const dry = args.includes('--dry');
  const root = path.join(__dirname, '..', 'data', 'products');
  const at = args.indexOf('--product');
  const products = args.includes('--all') ? fs.readdirSync(root).filter(p => fs.existsSync(path.join(root, p, 'projects'))) : at >= 0 ? [args[at + 1]] : [];
  if (!products.length) { console.error('usage: node scripts/system-to-wye.js --product <p> | --all [--dry]'); process.exit(2); }
  for (const p of products) {
    const r = migrate(path.join(root, p), { dry });
    console.log(`${p}: ${r.moved.length} moved${dry ? ' (dry)' : ''}${r.clashes.length ? ` · already in .wye, left in docs: ${r.clashes.join(', ')}` : ''}`);
  }
}
module.exports = { migrate, isSystem };
