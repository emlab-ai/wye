'use strict';
// What Wye ships to every product — the base skills (prompts/*.md), the workflows (templates/docs/workflow-*.md) and
// the hooks and templates (templates/shipped-hooks.md) — read from the install, never copied into a vault
// (decision:waterfall.skills-read-from-install-overrides-on-edit). Each build renders them into the product's
// the cache folder's shipped/ (lib/cache-home, out of the vault), so an upgrade reaches every vault on its next build. A product that has its
// own document or card with the same id — the person's edit — keeps it, and the shipped one is left out.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INSTALL = path.resolve(__dirname, '..');

// The base skills: which prompt file each comes from and the card that heads its document.
const BASE_SKILLS = [
  { slug: 'refine', title: 'Refine a request', role: 'librarian', file: 'prompts/librarian-system.md', takes: 'pr', writes: ['req', 'decision', 'constraint', 'question', 'task'] },
  { slug: 'build', title: 'Build a request', role: 'worker', file: 'prompts/agent-system.md', takes: 'pr', writes: ['task', 'decision'] },
  { slug: 'describe-module', title: 'Describe a module from its code', role: 'worker', file: 'prompts/describe-module.md', takes: 'module', writes: ['req', 'lib', 'op'] },
  { slug: 'define-tests', title: 'Define how a requirement is tested', role: 'librarian', file: 'prompts/define-tests.md', takes: 'req', writes: ['test', 'ui-test', 'question'] },
  { slug: 'analyse-request', title: 'Analyse a request — changes, code, risks, contradictions', role: 'librarian', file: 'prompts/analyse-request.md', takes: 'pr', writes: ['constraint', 'question'] },
  { slug: 'revisit-request', title: 'Revisit a request with the current approach', role: 'librarian', file: 'prompts/revisit-request.md', takes: 'pr', writes: ['req', 'decision', 'question', 'test'] },
  { slug: 'remember', title: 'Remember what the person pasted', role: 'librarian', file: 'prompts/remember.md', takes: '*', writes: ['fact', 'decision', 'req', 'question', 'task', 'note'] },
  { slug: 'complete', title: 'Complete this — and what belongs to it', role: 'librarian', file: 'prompts/complete.md', takes: '*', writes: ['task', 'commitment', 'risk', 'question', 'goal', 'project'] },
  { slug: 'import', title: 'Import a document — extract its types, requirements, facts and decisions', role: 'worker', file: 'prompts/import.md', takes: 'module', writes: ['type', 'req', 'decision', 'constraint', 'entity', 'fact', 'task', 'question'] },
  { slug: 'import-setup', title: 'Set up the graph for an import — the types, the recurring entities and a guide, before the pages', role: 'worker', file: 'prompts/import-setup.md', takes: 'module', writes: ['type', 'node'] },
  { slug: 'import-code', title: 'Import a module from its code — requirements, rules, entities, operations, tests', role: 'worker', file: 'prompts/import-code.md', takes: 'module', writes: ['req', 'rule', 'entity', 'state', 'op', 'lib', 'test', 'question'] },
  // the stages of workflow:feature (decision:wf2.workflow-is-a-skill): each one an editable instruction
  { slug: 'research', title: 'Explore an idea', role: 'worker', file: 'prompts/research.md', takes: '*', writes: ['question', 'decision', 'note'] },
  { slug: 'prd', title: 'Write a PRD', role: 'librarian', file: 'prompts/prd.md', takes: 'module', writes: ['req', 'goal', 'question', 'entity'] },
  { slug: 'tech-design', title: 'Write the technical design', role: 'librarian', file: 'prompts/tech-design.md', takes: 'module', writes: ['decision', 'entity', 'op', 'rule', 'state', 'page'] },
  { slug: 'test-design', title: 'Write the test design', role: 'librarian', file: 'prompts/test-design.md', takes: 'module', writes: ['test', 'ui-test', 'question'], skills: ['skill:define-tests'] },
  { slug: 'plan', title: 'Build the implementation plan', role: 'librarian', file: 'prompts/plan.md', takes: 'module', writes: ['task'] },
  // a plan page and its build, run by an agent in a terminal from the folder with the vault (/wye-plan, /wye-build —
  // decision:waterfall.plan-is-a-vault-document): the launchers fetch these, so a person edits them here
  { slug: 'plan-page', title: 'Plan a piece of work as a plan page', role: 'worker', file: 'prompts/plan-page.md', takes: '*', writes: ['plan', 'req', 'task', 'decision', 'question'] },
  { slug: 'build-plan', title: 'Build a plan', role: 'worker', file: 'prompts/build-plan.md', takes: 'plan', writes: ['task', 'decision', 'question', 'req'] },
];
// The workflows shipped beside the skills (decision:wf2.workflow-is-a-skill)
const BASE_WORKFLOWS = ['feature'];
const HOOKS_FILE = 'templates/shipped-hooks.md';

const textHash = text => crypto.createHash('sha1').update(text.trim()).digest('hex').slice(0, 12);
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
const dayOf = file => { try { return fs.statSync(file).mtime.toISOString().slice(0, 10); } catch { return '2026-01-01'; } };

// The prompt file as a skill document: the card in the frontmatter, the prompt's own body under the title (its first
// heading dropped — the document's title replaces it). `source-hash:` is what an override records it started from.
function skillDoc(prompt, s, parent, date) {
  const body = prompt.replace(/^# .*\n+/, '').trim();
  const fm = [`node: skill:${s.slug}`, 'type: skill', `title: ${s.title}`, 'status: active', 'owner: unassigned', `last-verified: ${date}`, `role: ${s.role}`, ...(s.takes ? [`takes: ${s.takes}`] : []), ...(s.writes ? [`writes: [${s.writes.join(', ')}]`] : []), ...(s.skills ? [`skills: [${s.skills.join(', ')}]`] : []), `source: ${s.file}`, `source-hash: ${textHash(body)}`, ...(parent ? [`part-of: ${parent}`] : [])];
  return `---\n${fm.join('\n')}\n---\n\n# ${s.title}\n\n${body}\n`;
}
function workflowDoc(tpl, slug, parent, date, src) {
  const filled = fill(tpl, { slug, date, parent: parent || '' }).replace(/^part-of: *\n/m, '');
  const m = filled.match(/^---\n([\s\S]*?)\n---\n?/); const fm = m ? m[1] : ''; const body = m ? filled.slice(m[0].length) : filled;
  return `---\n${fm}\nsource: ${src}\nsource-hash: ${textHash(body.replace(/^\s*# .*\n+/, ''))}\n---\n${body}`;
}

// The ids the product's own documents define: a document's `node:` and every card's `id:` — what overrides a shipped one.
function ownIds(files) {
  const ids = new Set();
  for (const f of files) {
    let md = ''; try { md = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const node = md.match(/^---\n[\s\S]*?^node:\s*(\S+)/m); if (node) ids.add(node[1]);
    for (const m of md.matchAll(/^\s*- id:\s*((?:skill|workflow|hook|template|stage):\S+)/gm)) ids.add(m[1]);
  }
  return ids;
}
// The page a shipped document hangs under — the product's Skills / Hooks page (projects/<p>/.wye/skills.md) — and the
// project that holds it, whose pages the shipped ones open among (`/<product>/<project>/d/~skill-x`).
function pageOf(productDir, name) {
  let projects = []; try { projects = fs.readdirSync(path.join(productDir, 'projects')).filter(p => !p.startsWith('.')).sort(); } catch { return { id: null, project: null }; }
  for (const p of projects) {
    try { const m = fs.readFileSync(path.join(productDir, 'projects', p, '.wye', `${name}.md`), 'utf8').match(/^node:\s*(\S+)/m); if (m) return { id: m[1], project: p }; } catch { /* not this project */ }
  }
  return { id: null, project: projects.find(p => fs.existsSync(path.join(productDir, 'projects', p, '_project.md'))) || projects[0] || null };
}

// The shipped documents for a product: [{ name, text }] — what it does not define itself.
function shippedDocs(productDir, files, install = INSTALL) {
  const own = ownIds(files); const out = [];
  const skills = pageOf(productDir, 'skills').id, hooks = pageOf(productDir, 'hooks').id;
  for (const s of BASE_SKILLS) {
    if (own.has(`skill:${s.slug}`)) continue;
    const f = path.join(install, s.file); let prompt; try { prompt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    out.push({ name: `skill-${s.slug}.md`, text: skillDoc(prompt, s, skills, dayOf(f)) });
  }
  for (const slug of BASE_WORKFLOWS) {
    if (own.has(`workflow:${slug}`)) continue;
    const src = `templates/docs/workflow-${slug}.md`; const f = path.join(install, src); let tpl; try { tpl = fs.readFileSync(f, 'utf8'); } catch { continue; }
    out.push({ name: `workflow-${slug}.md`, text: workflowDoc(tpl, slug, skills, dayOf(f), src) });
  }
  // the hooks and templates: one document of cards, the ones the product defines itself left out
  const hf = path.join(install, HOOKS_FILE); let tpl = null; try { tpl = fs.readFileSync(hf, 'utf8'); } catch { /* none shipped */ }
  if (tpl && !own.has('module:shipped-hooks')) {
    const cards = fill(tpl, { date: dayOf(hf), parent: hooks ? `part-of: ${hooks}\n` : '' }).replace(/^(- id: (\S+)\n(?:  .*\n|\n(?=  ))*)/gm, (card, _c, id) => (own.has(id) ? '' : card));
    const body = cards.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\s*# .*\n+/, '');
    out.push({ name: 'shipped-hooks.md', text: cards.replace('{{source}}', `source: ${HOOKS_FILE}\nsource-hash: ${textHash(body)}\n`) });
  }
  return out;
}

// A document's parts: its frontmatter text and its text under the title — what source-hash is taken of.
const splitDoc = md => { const m = md.match(/^---\n([\s\S]*?)\n---\n?/); return { fm: m ? m[1] : '', body: m ? md.slice(m[0].length) : md }; };
const textOf = body => body.replace(/^\s*# .*\n+/, '').trim();
const fmGet = (fm, k) => (fm.match(new RegExp(`^${k}:\\s*(\\S+)`, 'm')) || [])[1] || '';

// The shipped document a product's own copy came from (its `node:` and `source:`), rendered fresh from the install.
function freshFor(productDir, md, install = INSTALL) {
  const { fm } = splitDoc(md); const node = fmGet(fm, 'node'); const src = fmGet(fm, 'source');
  if (!src) return null;
  return shippedDocs(productDir, [], install).find(d => fmGet(splitDoc(d.text).fm, 'node') === node && fmGet(splitDoc(d.text).fm, 'source') === src) || null;
}
// Where a product's own copy of a shipped document stands (req:waterfall.global-skills.override): `edited` when its
// text is no longer the shipped text it started from, `behind` when the install's text has moved on since.
function copyState(productDir, md, install = INSTALL) {
  const fresh = freshFor(productDir, md, install); if (!fresh) return null;
  const { fm, body } = splitDoc(md); const recorded = fmGet(fm, 'source-hash');
  const now = fmGet(splitDoc(fresh.text).fm, 'source-hash');
  return { edited: !recorded || textHash(textOf(body)) !== recorded, behind: !!recorded && recorded !== now, shippedText: textOf(splitDoc(fresh.text).body), name: fresh.name };
}
// A copy whose text nobody edited follows the install (decision:wf2.shipped-copies-follow-source): its text is
// replaced with the shipped one and its frontmatter — the person's status, title, links — kept. Returns the new text or null.
function follow(md, fresh) {
  const cur = splitDoc(md); const nxt = splitDoc(fresh);
  const hash = fmGet(nxt.fm, 'source-hash'); const title = (cur.body.match(/^\s*# .*$/m) || [''])[0].trim();
  return `---\n${cur.fm.replace(/^source-hash:.*$/m, `source-hash: ${hash}`)}\n---\n\n${title ? `${title}\n\n` : ''}${textOf(nxt.body)}\n`;
}

// Hook cards Wye shipped once and no longer does, in their last shipped text — a product's unedited copy goes with them.
const RETIRED_CARDS = [
  '- id: hook:req-approved-tests\n  title: An approved requirement gets a task to define its test cases, and an agent starts on it\n  on: req.status:approved\n  do: task "Define test cases for {{title}}" --worker agent --skill skill:define-tests\n  once: true\n  status: active\n',
];
const cardsOf = text => [...text.matchAll(/^- id: (\S+)\n(?:  .*\n)*/gm)].map(m => ({ id: m[1], text: m[0] }));
const PERSONS = ['status', 'title', 'role', 'takes', 'writes', 'skills'];
const fmLine = (fm, k) => ((fm.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) || [])[1] || '').trim();

// Products made before Wye read its skills from the install hold copies (req:waterfall.global-skills.no-copies): each
// copy nobody changed — its text the shipped one it was made from, its status, title and links as shipped — is removed,
// and so is each unedited shipped or retired hook card on the Hooks page. A changed one stays: it is the product's own.
// Returns the files removed or rewritten.
function migrateCopies(productDir, install = INSTALL) {
  const changed = [];
  let projects = []; try { projects = fs.readdirSync(path.join(productDir, 'projects')); } catch { return changed; }
  const fresh = shippedDocs(productDir, [], install);
  for (const p of projects) {
    const w = path.join(productDir, 'projects', p, '.wye'); let names = []; try { names = fs.readdirSync(w); } catch { continue; }
    for (const n of names.filter(n => /^(skill|workflow)-.*\.md$/.test(n))) {
      const f = path.join(w, n); const md = fs.readFileSync(f, 'utf8'); const st = copyState(productDir, md, install);
      if (!st) continue;
      const { fm: mine, body } = splitDoc(md); const recorded = fmGet(mine, 'source-hash');
      if (recorded ? textHash(textOf(body)) !== recorded : textOf(body) !== st.shippedText) continue;   // its text was edited
      const theirs = splitDoc((fresh.find(d => d.name === st.name) || { text: '' }).text).fm;
      if (PERSONS.some(k => fmLine(mine, k) !== fmLine(theirs, k))) continue;                             // its status, title… were
      fs.rmSync(f); changed.push(f);
    }
    const hf = path.join(w, 'hooks.md'); let hooks; try { hooks = fs.readFileSync(hf, 'utf8'); } catch { continue; }
    const shippedCards = cardsOf((fresh.find(d => d.name === 'shipped-hooks.md') || { text: '' }).text).map(c => c.text).concat(RETIRED_CARDS);
    const next = hooks.replace(/^- id: (\S+)\n(?:  .*\n)*/gm, card => (shippedCards.includes(card) ? '' : card));
    if (next !== hooks) { fs.writeFileSync(hf, next); changed.push(hf); }
  }
  return changed;
}

// Writes the shipped documents into <cache>/shipped/<project>/ (lib/cache-home) (only the ones that changed; the ones no
// longer shipped are removed) and returns their paths, for the build to parse with the product's own.
// `out`: the build's output folder — the vault's cache folder (lib/cache-home), else its own _build/
const shippedDir = (productDir, out = path.join(productDir, '_build')) => { const p = pageOf(productDir, 'skills').project; return p ? path.join(out, 'shipped', p) : null; };
function writeShipped(productDir, files, install = INSTALL, out) {
  const dir = shippedDir(productDir, out); if (!dir) return [];
  // the product's own copies nobody edited follow the install first
  for (const f of files) {
    if (!/\/projects\/[^/]+\/\.wye\/(skill|workflow)-[^/]+\.md$|\/projects\/[^/]+\/\.wye\/shipped-hooks\.md$/.test(f)) continue;
    let md; try { md = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const st = copyState(productDir, md, install);
    if (st && !st.edited && st.behind) { const fresh = freshFor(productDir, md, install); fs.writeFileSync(f, follow(md, fresh.text)); }
  }
  const docs = shippedDocs(productDir, files, install);
  const top = path.dirname(dir); fs.mkdirSync(dir, { recursive: true });
  for (const p of fs.readdirSync(top)) if (path.join(top, p) !== dir) fs.rmSync(path.join(top, p), { recursive: true, force: true });   // another project held the Skills page
  const keep = new Set(docs.map(d => d.name));
  for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });
  for (const d of docs) {
    const f = path.join(dir, d.name); let cur = null; try { cur = fs.readFileSync(f, 'utf8'); } catch { /* new */ }
    if (cur !== d.text) fs.writeFileSync(f, d.text);
  }
  return docs.map(d => path.join(dir, d.name));
}

module.exports = { migrateCopies, BASE_SKILLS, BASE_WORKFLOWS, HOOKS_FILE, INSTALL, textHash, skillDoc, shippedDocs, writeShipped, shippedDir, ownIds, copyState };
