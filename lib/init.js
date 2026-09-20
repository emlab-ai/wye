'use strict';
// `wye init` (req:wf2.cli.init): a product's definition from its code, first iteration — the layered tree
// (decision:wf2.definition-layers) with every module, page, component, library, operation and test the repo
// shows on the surface, shallow on purpose, and one `#ready` task per module to go deeper (`wye deepen`,
// prompts/describe-module.md: the requirements read from the code, each mapped to the file that delivers it).
// Deterministic — no model: a scan of the tree, header comments as purposes. Everything it writes is markdown
// under data/products/<product>/projects/<project>/docs; it never overwrites a page that exists.
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'target', 'vendor', '.turbo', '.cache', '__pycache__', '.venv', 'venv', 'tmp', 'public', 'static', 'assets', 'fixtures', 'data', 'examples', 'docs']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb', '.java', '.kt', '.swift', '.vue', '.svelte', '.cs', '.php']);
const TEST_RE = /(\.|_|\/)(test|spec|tests)(\.|\/|$)|__tests__\//;
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'root';
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ scan
function walk(root, rel = '', out = [], depth = 0) {
  if (depth > 8) return out;
  let ents = [];
  try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, r, out, depth + 1);
    else if (CODE_EXT.has(path.extname(e.name))) out.push(r);
  }
  return out;
}

// the first comment block at the top of a file, as one line: the purpose the code gives itself
function headerPurpose(file) {
  let text = ''; try { text = fs.readFileSync(file, 'utf8').slice(0, 4000); } catch { return ''; }
  const lines = text.split('\n'); const out = [];
  let i = 0;
  while (i < lines.length && (/^\s*$/.test(lines[i]) || /^['"]use (client|server|strict)['"];?$/.test(lines[i].trim()) || /^#!/.test(lines[i]))) i++;
  if (i < lines.length && /^\s*\/\*/.test(lines[i])) {
    for (; i < lines.length; i++) { out.push(lines[i].replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, '')); if (/\*\//.test(lines[i])) break; }
  } else if (i < lines.length && /^\s*(\/\/|#)/.test(lines[i])) {
    for (; i < lines.length && /^\s*(\/\/|#)/.test(lines[i]); i++) out.push(lines[i].replace(/^\s*(\/\/|#)\s?/, ''));
  } else if (i < lines.length && /^\s*"""/.test(lines[i])) {
    for (; i < lines.length; i++) { out.push(lines[i].replace(/"""/g, '')); if (i > 0 && /"""/.test(lines[i]) && !/^\s*"""[^"]*$/.test(lines[i])) break; }
  }
  const s = out.join(' ').replace(/\s+/g, ' ').trim().replace(/\b([a-z][a-z-]*):(?=[a-z0-9])/g, '$1&#58;');
  if (!s || /^eslint|^@ts-|^prettier|^Copyright|^Licensed|^SPDX/i.test(s)) return '';
  return s.length > 300 ? s.slice(0, 297) + '…' : s;
}

// areas: the repo's workspaces (packages/*, apps/*), else its top-level code folders
function areasOf(root, files) {
  let ws = [];
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); const w = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages ?? []; ws = w.map(g => g.replace(/\/?\*+$/, '')).filter(Boolean); } catch { /* no workspaces */ }
  try { const y = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'); for (const m of y.matchAll(/-\s*['"]?([^'"\s*]+)/g)) ws.push(m[1].replace(/\/?\*+$/, '')); } catch { /* none */ }
  const areas = new Map();
  const put = (dir, title) => { if (!areas.has(dir)) areas.set(dir, { dir, slug: slugify(dir.split('/').pop()), title: title ?? cap(dir.split('/').pop()), files: [] }); return areas.get(dir); };
  const wsDirs = [];
  for (const w of ws) { try { for (const e of fs.readdirSync(path.join(root, w), { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.')) wsDirs.push(`${w}/${e.name}`); } catch { /* none */ } }
  for (const f of files) {
    const w = wsDirs.find(d => f.startsWith(d + '/'));
    if (w) { put(w).files.push(f); continue; }
    const top = f.includes('/') ? f.split('/')[0] : '';
    if (!top) { put('.', 'Root').files.push(f); continue; }
    put(top).files.push(f);
  }
  // an area of one or two files is noise: fold it into Root
  for (const [k, a] of [...areas]) if (a.files.length < 3 && k !== '.') { put('.', 'Root').files.push(...a.files); areas.delete(k); }
  return [...areas.values()].sort((a, b) => b.files.length - a.files.length);
}

function classify(root, files) {
  const pages = [], components = [], ops = [], tests = [], libs = [];
  for (const f of files) {
    const base = path.basename(f).replace(/\.[^.]+$/, '');
    const purpose = () => headerPurpose(path.join(root, f));
    if (TEST_RE.test(f)) { tests.push({ id: `test:${slugify(base.replace(/\.(test|spec)$/, ''))}`, file: f }); continue; }
    let m;
    if ((m = f.match(/(?:^|\/)app\/(.*?)\/?(page|layout)\.(tsx|jsx|js|ts)$/))) {
      const route = '/' + m[1].split('/').filter(s => s && !/^\(.*\)$/.test(s)).join('/');
      if (m[2] === 'page') pages.push({ id: `page:${slugify(route.replace(/^\//, '') || 'home')}`, route, file: f, purpose: purpose() });
      continue;
    }
    if ((m = f.match(/(?:^|\/)app\/api\/(.*)\/route\.(ts|js)$/))) {
      let methods = []; try { methods = [...fs.readFileSync(path.join(root, f), 'utf8').matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(x => x[1]); } catch { /* skip */ }
      ops.push({ id: `op:api.${slugify(m[1].replace(/\[|\]/g, ''))}`, args: `${methods.join(' | ') || 'HTTP'} /api/${m[1]}`, file: f, purpose: purpose() }); continue;
    }
    if ((m = f.match(/(?:^|\/)pages\/(.*)\.(tsx|jsx)$/)) && !/^_|\/_|^api\//.test(m[1])) { const route = '/' + m[1].replace(/\/index$/, ''); pages.push({ id: `page:${slugify(route.replace(/^\//, '') || 'home')}`, route, file: f, purpose: purpose() }); continue; }
    if ((m = f.match(/(?:^|\/)routes\/(.*)\/\+page\.svelte$/))) { pages.push({ id: `page:${slugify(m[1] || 'home')}`, route: '/' + m[1], file: f, purpose: purpose() }); continue; }
    if (/(?:^|\/)components?\/.*\.(tsx|jsx|vue|svelte)$/.test(f)) { components.push({ id: `component:${slugify(base)}`, file: f, purpose: purpose() }); continue; }
    if (/^bin\//.test(f)) { ops.push({ id: `op:cli.${slugify(base)}`, args: `${base} (command line)`, file: f, purpose: purpose() }); continue; }
    if (/\.(d\.ts)$/.test(f) || /\.(json|md)$/.test(f)) continue;
    libs.push({ file: f, purpose: purpose() });
  }
  return { pages, components, ops, tests, libs };
}

// ------------------------------------------------------------------ write
const fm = (node, title, extra = {}) => ['---', `node: ${node}`, 'type: module', `title: ${title}`, `status: ${extra.status ?? 'proposed'}`, `owner: ${extra.owner ?? 'unassigned'}`, `last-verified: ${today()}`, ...(extra.parent ? [`part-of: ${extra.parent}`] : []), ...(extra.order ? [`order: ${extra.order}`] : []), ...(extra.sourceRoots ? [`source-roots: [${extra.sourceRoots.join(', ')}]`] : []), '---', ''].join('\n');
const yamlText = s => (/^[a-z][a-z-]*:[\w.\-/#]+$/.test(s) || /^\[.*\]$/.test(s)) ? s : (s.includes(': ') || s.includes(' #') || s.includes(':') && s.length > 80 || /^[>|&*!%@`'"{}\[\]]/.test(s)) ? `>\n    ${s}` : s;
const card = (id, props) => ['- id: ' + id, ...Object.entries(props).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `  ${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : yamlText(String(v))}`)].join('\n');
const region = (kind, cards) => cards.length ? ['', `<!-- list:${kind} -->`, '', '```yaml', ...cards, '```', '', `<!-- /list:${kind} -->`, ''].join('\n') : `\n<!-- list:${kind} -->\n<!-- /list:${kind} -->\n`;

// ids the product already defines (its built graph, else its documents): a feature embeds them, never redefines
function existingIds(pdir) {
  const ids = new Set();
  try { for (const n of JSON.parse(fs.readFileSync(path.join(pdir, '_build', 'graph.json'), 'utf8')).nodes) if (n.defined) ids.add(n.id); return ids; } catch { /* no build */ }
  const walkDocs = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(d, e.name); if (e.isDirectory()) walkDocs(f); else if (e.name.endsWith('.md')) for (const m of fs.readFileSync(f, 'utf8').matchAll(/^(?:- )?id:\s*([a-z-]+:[\w.\-/#]+)/gm)) ids.add(m[1]); } };
  walkDocs(path.join(pdir, 'projects'));
  return ids;
}
const embeds = list => list.length ? '\n' + list.map(id => `![[${id}]]`).join('\n\n') + '\n' : '';

function writeOnce(file, text, made) {
  if (fs.existsSync(file)) { made.skipped.push(file); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text); made.written.push(file);
}

/**
 * Initialise a product (or a feature project inside one) from a repository.
 * opts: { dataRoot, product, title, project, repo, feature?, icon?, description? }
 */
function init(opts) {
  const { dataRoot, product, repo } = opts;
  const project = opts.project || (opts.feature ? slugify(opts.feature) : 'main');
  const title = opts.title || (opts.feature ? opts.feature : cap(product));
  const root = path.resolve(repo);
  const scanRoot = opts.path ? path.join(root, opts.path) : root;
  const pre = opts.path ? opts.path.replace(/[/]+$/, '') : '';
  const withPre = f => (pre ? pre + '/' + f : f);
  const files = walk(scanRoot).map(withPre);
  const areas = areasOf(scanRoot, files.map(f => (pre ? f.slice(pre.length + 1) : f))).map(a => ({ ...a, dir: pre ? (a.dir === '.' ? pre : pre + '/' + a.dir) : a.dir, files: a.files.map(withPre) }));
  const all = classify(root, files);
  const pdir0 = path.join(dataRoot, 'products', product);
  const known = opts.feature ? existingIds(pdir0) : new Set();
  // what the product already defines is embedded on the feature's pages, not defined again (one home per block)
  const split = list => ({ fresh: list.filter(x => !known.has(x.id)), seen: list.filter(x => known.has(x.id)).map(x => x.id) });
  const sp = { pages: split(all.pages), components: split(all.components), ops: split(all.ops), tests: split(all.tests) };
  const made = { written: [], skipped: [], counts: { files: files.length, areas: areas.length, pages: all.pages.length, components: all.components.length, ops: all.ops.length, tests: all.tests.length, libs: all.libs.length } };
  const pdir = path.join(dataRoot, 'products', product);
  const docs = path.join(pdir, 'projects', project, 'docs');
  const P = slugify(product), J = slugify(project);
  const rootNode = opts.feature ? `module:${J}` : `module:${P}`;
  const ids = { product: `module:${J}-product`, experience: `module:${J}-experience`, domain: `module:${J}-domain`, systems: `module:${J}-systems`, quality: `module:${J}-quality`, decisions: `module:${J}-decisions`, research: `module:${J}-research`, archive: `module:${J}-archive`, backlog: `module:${J}-plan` };
  const goal = `goal:${J}.defined`;

  if (!opts.feature) {
    writeOnce(path.join(pdir, '_product.md'), `---\ntitle: ${title}\nicon: ${opts.icon || '📦'}\nrepo: ${root}\ndescription: ${opts.description || `${title} — its definition, read from ${path.basename(root)} on ${today()} and deepened module by module.`}\n---\n`, made);
  }
  writeOnce(path.join(pdir, 'projects', project, '_project.md'), `---\ntitle: ${opts.feature ? title : 'Definition'}\nkind: ${opts.feature ? 'goal' : 'project'}\nstatus: in-progress\nicon: ${opts.feature ? '🎯' : '📘'}\ndescription: ${opts.feature ? `The ${title} feature — what it must do, what a person sees, how it works.` : `The definition of ${title}: product, experience, domain, systems, quality.`}\n---\n`, made);

  // the root page
  const areaLine = a => `- **${a.title}** (module:${J}-${a.slug}) — \`${a.dir}\`, ${a.files.length} files`;
  writeOnce(path.join(docs, `${opts.feature ? J : P}.md`), fm(rootNode, title, { order: 1, owner: 'unassigned', status: 'in-progress' }) + `# ${title}

${opts.feature ? `The ${title} feature of ${product}` : title}, read from \`${path.basename(root)}\` on ${today()} by \`wye init\` — the first, shallow pass: every module, page, component, library, operation and test the repository shows, so a person and an agent start from the same map. Nothing below says yet *what the product must do*; that is the work of \`wye deepen\` on each module (the tasks on the Backlog), which reads the code, writes the requirements in the person's words and maps each one to the file that delivers it.

\`\`\`yaml
- id: ${rootNode}
  title: ${title}
  purpose: >
    (to be written: what ${title} is for, and for whom — task:${J}.purpose)
  repo: ${root}
  source-roots: [.]
\`\`\`

## How to read this

- **Product** (${ids.product}) — what it must do: users and jobs, requirements by module, the constitution.
- **Experience** (${ids.experience}) — what a person sees: pages, components, interaction rules.
- **Domain** (${ids.domain}) — what it knows: ontology, entities and states, storage.
- **Systems** (${ids.systems}) — how it works: one page per module with its libraries, operations and rules; the API.
- **Quality** (${ids.quality}) — how we know: tests.
- **Decisions** (${ids.decisions}), **Research** (${ids.research}), **Archive** (${ids.archive}).

## Modules found

${areas.map(areaLine).join('\n')}

## Goals

\`\`\`yaml
- id: ${goal}
  title: ${title} is defined — every module described, every requirement mapped to its code
  description: >
    Each module's page holds its requirements (when / then / unless, in the person's words), each requirement is
    satisfied by the library, component or operation cards that deliver it — with the file and a paragraph on what
    that code does — and verified by its tests; the entities and states are named; what the code leaves unclear is a
    question. Progress is the describe tasks under this goal.
  status: proposed
  owner: unassigned
\`\`\`
`, made);

  // Product
  writeOnce(path.join(docs, 'product.md'), fm(ids.product, 'Product — what it must do', { parent: rootNode, order: 10 }) + `# Product — what it must do\n\nWhat ${title} must do, in the person's words: who it is for and the jobs (Users and jobs), the behaviours by module (when / then / unless), the constitution. How it is done is on the Systems pages.\n`, made);
  writeOnce(path.join(docs, 'users-and-jobs.md'), fm(`module:${J}-users`, 'Users and jobs', { parent: ids.product, order: 11 }) + `# Users and jobs\n\nWho uses ${title} and what they come to do — to be written (task:${J}.users).\n${region('goal', [])}`, made);
  writeOnce(path.join(docs, 'constitution.md'), fm(`module:${J}-constitution`, 'Constitution', { parent: ids.product, order: 12 }) + `# Constitution\n\nThe constraints in force — rules about the product and how it is built that no code enforces. Approved ones go into every worker's prompt.\n${region('constraint', [])}`, made);
  areas.forEach((a, i) => writeOnce(path.join(docs, `requirements-${a.slug}.md`), fm(`module:${J}-req-${a.slug}`, a.title, { parent: ids.product, order: 13 + i }) + `# ${a.title}\n\nWhat ${title} must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. Written by \`wye deepen ${a.slug}\` from the code under \`${a.dir}\`; how it is done is on Systems › ${a.title}.\n${region('req', [])}\n## Open questions\n${region('question', [])}`, made));

  // Experience
  writeOnce(path.join(docs, 'experience.md'), fm(ids.experience, 'Experience — what you see', { parent: rootNode, order: 20 }) + `# Experience — what you see\n\nThe pages by route, the components they are made of, the rules of interaction.\n`, made);
  writeOnce(path.join(docs, 'pages.md'), fm(`module:${J}-pages`, 'Pages', { parent: ids.experience, order: 22 }) + `# Pages\n\nEvery page the code declares (${all.pages.length}), by route — what each shows is to be written from the code.\n${region('page', sp.pages.fresh.map(p => card(p.id, { route: p.route, component: p.file, purpose: p.purpose || '(to be written)', 'part-of': `module:${J}-pages` })))}${embeds(sp.pages.seen)}`, made);
  writeOnce(path.join(docs, 'components.md'), fm(`module:${J}-components`, 'Blocks and components', { parent: ids.experience, order: 23 }) + `# Blocks and components\n\nEvery component the code declares (${all.components.length}); the purpose is the file's header comment where it has one.\n${region('component', sp.components.fresh.map(c => card(c.id, { file: c.file, purpose: c.purpose || '(to be written)', 'part-of': `module:${J}-components` })))}${embeds(sp.components.seen)}`, made);
  writeOnce(path.join(docs, 'interaction-rules.md'), fm(`module:${J}-interaction-rules`, 'Interaction rules', { parent: ids.experience, order: 24 }) + `# Interaction rules\n\nWhat the interface guarantees — click, fold, drag, select — as rules with their source.\n${region('rule', [])}`, made);

  // Domain
  writeOnce(path.join(docs, 'domain.md'), fm(ids.domain, 'Domain — what it knows', { parent: rootNode, order: 30 }) + `# Domain — what it knows\n\nThe ontology, the entities and their states, where everything lives.\n`, made);
  writeOnce(path.join(docs, 'ontology.md'), fm(`module:${J}-ontology`, 'Ontology', { parent: ids.domain, order: 31 }) + `# Ontology\n\nThe product's own types, as \`type:\` cards (extends, props with inverses).\n${region('type', [])}`, made);
  writeOnce(path.join(docs, 'entities.md'), fm(`module:${J}-entities`, 'Entities and states', { parent: ids.domain, order: 32 }) + `# Entities and states\n\nThe things ${title} keeps and the states they move through — to be read from the models (task:${J}.entities).\n${region('entity', [])}\n## State machines\n${region('state', [])}`, made);
  writeOnce(path.join(docs, 'stores.md'), fm(`module:${J}-stores`, 'Storage', { parent: ids.domain, order: 33 }) + `# Storage\n\nWhere everything lives — databases, files, caches — as \`store:\` cards.\n${region('store', [])}`, made);

  // Systems: one page per area
  writeOnce(path.join(docs, 'systems.md'), fm(ids.systems, 'Systems — how it works', { parent: rootNode, order: 40 }) + `# Systems — how it works\n\nOne page per module: its libraries and operations as the code declares them, and — after \`wye deepen\` — the rules it enforces and the decisions behind them.\n\n${areas.map(areaLine).join('\n')}\n`, made);
  areas.forEach((a, i) => {
    const inArea = f => f.startsWith(a.dir === '.' ? '' : a.dir + '/') && (a.dir !== '.' || !f.includes('/') || !areas.some(b => b.dir !== '.' && f.startsWith(b.dir + '/')));
    const libs = all.libs.filter(l => inArea(l.file));
    // many files: one card per folder, else one per file
    let libCards;
    if (libs.length > 60) {
      const byDir = new Map(); for (const l of libs) { const d = path.dirname(l.file); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(l); }
      libCards = [...byDir].map(([d, ls]) => card(`lib:${a.slug}.${slugify(d.split('/').slice(-2).join('-'))}`, { file: d, purpose: `${ls.length} files: ${ls.slice(0, 8).map(l => path.basename(l.file)).join(', ')}${ls.length > 8 ? ', …' : ''}`, 'part-of': `module:${J}-${a.slug}` }));
    } else libCards = libs.map(l => card(`lib:${a.slug}.${slugify(path.basename(l.file).replace(/\.[^.]+$/, ''))}`, { file: l.file, purpose: l.purpose || '(to be written)', 'part-of': `module:${J}-${a.slug}` }));
    const ops = sp.ops.fresh.filter(o => inArea(o.file)); const seenOps = sp.ops.seen.filter(id => all.ops.some(o => o.id === id && inArea(o.file)));
    const libFresh = libCards.filter(c => !known.has(c.match(/^- id: (\S+)/)[1])), libSeen = libCards.map(c => c.match(/^- id: (\S+)/)[1]).filter(id => known.has(id));
    writeOnce(path.join(docs, `${a.slug}.md`), fm(`module:${J}-${a.slug}`, a.title, { parent: ids.systems, order: 41 + i, sourceRoots: ['.'] }) + `# ${a.title}\n\n\`\`\`yaml\n- id: module:${J}-${a.slug}\n  purpose: >\n    (to be written by wye deepen ${a.slug}: what this module does and why)\n  folder: ${a.dir}\n\`\`\`\n\n${a.files.length} source files under \`${a.dir}\`. Rules the code enforces, the decisions behind them and the lessons go here as the module is deepened.\n\n## Rules\n${region('rule', [])}\n## Decisions\n${region('decision', [])}\n## Libraries\n${region('lib', libFresh)}${embeds(libSeen)}${ops.length || seenOps.length ? `\n## Operations\n${region('op', ops.map(o => card(o.id, { args: o.args, source: o.file, does: o.purpose || '(to be written)', 'part-of': `module:${J}-${a.slug}` })))}${embeds(seenOps)}` : ''}`, made);
  });
  writeOnce(path.join(docs, 'api.md'), fm(`module:${J}-api`, 'API and CLI', { parent: ids.systems, order: 49 }) + `# API and CLI\n\nEvery operation the code exposes (${all.ops.length}) — HTTP routes and commands — defined on their module's page, listed here.\n\n<!-- view:op scope=project -->\n`, made);

  // Quality, Decisions, Research, Archive
  writeOnce(path.join(docs, 'quality.md'), fm(ids.quality, 'Quality — how we know', { parent: rootNode, order: 50 }) + `# Quality — how we know\n\nThe tests by module, and the evaluation.\n`, made);
  writeOnce(path.join(docs, 'tests.md'), fm(`module:${J}-tests`, 'Tests', { parent: ids.quality, order: 51 }) + `# Tests\n\nEvery test file the code declares (${all.tests.length}); what each verifies is written when its requirement is.\n${region('test', sp.tests.fresh.map(t => card(t.id, { file: t.file, 'part-of': `module:${J}-tests` })))}${embeds(sp.tests.seen)}`, made);
  writeOnce(path.join(docs, 'decisions.md'), fm(ids.decisions, 'Decisions', { parent: rootNode, order: 60 }) + `# Decisions\n\nEvery decision, newest first. A decision lives on the page of its module; this is a view.\n\n<!-- view:decision sort=-date scope=project -->\n`, made);
  writeOnce(path.join(docs, 'research.md'), fm(ids.research, 'Research', { parent: rootNode, order: 70 }) + `# Research\n\nEssays and studies that shaped the product; their blocks live on the definition pages.\n`, made);
  writeOnce(path.join(docs, 'archive.md'), fm(ids.archive, 'Archive', { parent: rootNode, order: 90 }) + `# Archive\n\nWhat was: retired pages and blocks, never deleted.\n`, made);

  // the Backlog: one describe task per module, ready for a runner, plus the product-level ones
  const tasks = [
    ...areas.map(a => `- [ ] task:${J}.describe.${a.slug} Describe ${a.title}: read the code under ${a.dir}, write its requirements on module:${J}-req-${a.slug} in the person's words (when / then / unless), map each to the lib, component and op cards on module:${J}-${a.slug} that deliver it (file + what that code does), the rules the code enforces with their source, the tests that verify, and a question where the code is unclear. Part of ${goal}. #ready`),
    `- [ ] task:${J}.purpose Write what ${title} is for and for whom on ${rootNode}, from the README and the code. Part of ${goal}. #ready`,
    `- [ ] task:${J}.users Users and jobs (module:${J}-users): who uses ${title}, the jobs, the scenarios — as goals. Part of ${goal}.`,
    `- [ ] task:${J}.entities Entities and states (module:${J}-entities): every persisted thing and its state machine, from the models and migrations. Part of ${goal}. #ready`,
  ];
  writeOnce(path.join(docs, 'plan.md'), fm(ids.backlog, 'Backlog', { order: 55 }) + `# Backlog\n\nWork planned but on no plan document yet. The describe tasks below go deeper into each module — assign one, or \`wye deepen <module> --product ${product}\`, or let a runner take the ready ones (\`wye agent listen --take-ready\`).\n\n<!-- tasks -->\n${tasks.join('\n')}\n<!-- /tasks -->\n`, made);
  return { made, areas, project, docs, goal };
}

module.exports = { init, walk, areasOf, classify, headerPurpose, slugify };
