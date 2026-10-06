'use strict';
// A vault (req:wf2.vault-init, decision:wf2.vault-is-a-product-in-wye): a product kept in <folder>/.wye/, beside the
// code it describes — _product.md, projects/<slug>/docs, inbox/, _agent.md, laid out as any product folder
// (decision:wf2.vault-keeps-folders). `wye init` in a folder and Init Wye here in the app both end in initVault:
// the shallow definition of the folder's code (lib/init.js, rule:init-shallow), the vault's own agent instructions,
// a section in the folder's AGENTS.md / CLAUDE.md that sends any agent working there to this knowledge, and the links
// (decision:wf2.vault-links): `parent:` — the nearest vault above — and `vaults:` — the nearest ones below — in
// _product.md, as paths between the folders, kept on both sides. Nothing that exists is overwritten.
const fs = require('fs');
const path = require('path');
const { init, slugify, SKIP_DIRS } = require('./init');

const VAULT = '.wye';
const vaultDir = folder => path.join(folder, VAULT);
// a folder has a vault when its .wye/ holds _product.md (a project's own .wye/ holds the app's pages, never that file)
const hasVault = folder => fs.existsSync(path.join(folder, VAULT, '_product.md'));
const rel = (from, to) => path.relative(from, to).split(path.sep).join('/') || '.';

// the nearest folder with a vault strictly above `folder`, or null
function vaultAbove(folder) {
  for (let d = path.dirname(path.resolve(folder)); ; d = path.dirname(d)) {
    if (hasVault(d)) return d;
    if (path.dirname(d) === d) return null;
  }
}

// the nearest folders with a vault below `folder`: the walk stops at each one it finds, and skips what init skips
function vaultsBelow(folder, depth = 0, out = []) {
  if (depth > 8) return out;
  let ents = [];
  try { ents = fs.readdirSync(folder, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const d = path.join(folder, e.name);
    if (hasVault(d)) out.push(d); else vaultsBelow(d, depth + 1, out);
  }
  return out;
}

// ------------------------------------------------------------------ _product.md keys
const metaFile = folder => path.join(folder, VAULT, '_product.md');
function readMeta(folder) {
  let md = ''; try { md = fs.readFileSync(metaFile(folder), 'utf8'); } catch { /* none */ }
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const get = k => (fm ? (fm[1].match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) || [])[1] || '' : '').trim();
  const vaults = get('vaults').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  return { md, title: get('title'), slug: get('slug'), parent: get('parent'), vaults };
}
// set (or, with an empty value, remove) frontmatter keys, every other line as it was
function setMeta(folder, keys) {
  const { md } = readMeta(folder);
  const fm = md.match(/^---\n([\s\S]*?)\n---/); if (!fm) return false;
  let lines = fm[1].split('\n');
  for (const [k, v] of Object.entries(keys)) {
    lines = lines.filter(l => !new RegExp('^' + k + ':').test(l));
    if (v) lines.push(`${k}: ${v}`);
  }
  const next = `---\n${lines.join('\n')}\n---` + md.slice(fm[0].length);
  if (next === md) return false;
  fs.writeFileSync(metaFile(folder), next); return true;
}
const listValue = paths => paths.length ? `[${[...new Set(paths)].sort().join(', ')}]` : '';

// The vault's links as folders: { parent, vaults } — absolute paths, the ones that no longer hold a vault left out
// and named in `missing` (a Rescan proposes the correction; nothing is rewritten on a read)
function links(folder) {
  const m = readMeta(folder); const missing = [];
  const abs = p => path.resolve(folder, p);
  const ok = p => { if (hasVault(abs(p))) return true; missing.push(p); return false; };
  return { parent: m.parent && ok(m.parent) ? abs(m.parent) : null, vaults: m.vaults.filter(ok).map(abs), missing };
}

// ------------------------------------------------------------------ a workspace: the vaults a folder reaches
const inside = (folder, p) => p === folder || p.startsWith(folder + path.sep);
// The vaults of an opened folder (decision:wf2.workspace-is-the-top), found through the links and never by a walk:
// the folder's own vault and, link by link, every vault below it; a folder without one takes the links of the nearest
// vault above that point inside it. `scanned` — a list a Rescan kept for a folder no vault names — stands in when
// there is no vault at or above the folder. → [{ folder, parent }] parents first, `parent` the vault folder above
// inside the workspace (null for a root).
function reach(folder, scanned) {
  folder = path.resolve(folder);
  const out = []; const seen = new Set();
  const walk = (f, parent) => { if (seen.has(f) || !hasVault(f)) return; seen.add(f); out.push({ folder: f, parent }); for (const c of links(f).vaults) walk(c, f); };
  if (hasVault(folder)) walk(folder, null);
  else {
    const above = vaultAbove(folder);
    // the vault above names its nearest vaults; one of them may sit above the folder too — follow it down
    const down = f => { for (const c of links(f).vaults) { if (inside(folder, c)) walk(c, null); else if (inside(c, folder)) down(c); } };
    if (above) down(above); else for (const f of scanned || []) walk(path.resolve(f), null);
  }
  return out;
}
// Rescan (decision:wf2.vault-links): the one full walk. → { vaults: [folders], roots, fixes: [{ folder, parent, vaults, was }] }
// — every vault under the folder, and for each whose written links differ from what the walk found, the links it
// should carry. Nothing is written: applyFixes does that when the person agrees.
function rescan(folder) {
  folder = path.resolve(folder);
  const found = []; // { folder, parent }
  const walk = (f, parent) => { for (const c of vaultsBelow(f)) { found.push({ folder: c, parent }); walk(c, c); } };
  const top = hasVault(folder) ? folder : null;
  if (top) found.push({ folder: top, parent: vaultAbove(top) });
  walk(folder, top || vaultAbove(folder));
  const fixes = [];
  const want = new Map(found.map(v => [v.folder, { parent: v.parent, vaults: [] }]));
  for (const v of found) if (v.parent && want.has(v.parent)) want.get(v.parent).vaults.push(v.folder);
  for (const [f, w] of want) {
    const m = readMeta(f);
    const parent = w.parent ? rel(f, w.parent) : '', vaults = w.vaults.map(c => rel(f, c)).sort();
    if (parent !== m.parent || vaults.join(',') !== [...m.vaults].sort().join(',')) fixes.push({ folder: f, parent, vaults, was: { parent: m.parent, vaults: m.vaults } });
  }
  // the vault above the folder must name the walk's roots when it is their parent
  const above = top ? vaultAbove(top) : vaultAbove(folder);
  if (above) {
    const m = readMeta(above); const roots = found.filter(v => v.parent === above).map(v => rel(above, v.folder));
    const kept = m.vaults.filter(p => !inside(folder, path.resolve(above, p)));
    const vaults = [...new Set([...kept, ...roots])].sort();
    if (vaults.join(',') !== [...m.vaults].sort().join(',')) fixes.push({ folder: above, parent: m.parent, vaults, was: { parent: m.parent, vaults: m.vaults } });
  }
  // roots: the vaults no other found vault is above — what stands in for the links of a folder no vault names
  return { vaults: found.map(v => v.folder), roots: found.filter(v => !v.parent || !want.has(v.parent)).map(v => v.folder), fixes };
}
function applyFixes(fixes) { const changed = []; for (const f of fixes) if (setMeta(f.folder, { parent: f.parent, vaults: listValue(f.vaults) })) changed.push(f.folder); return changed; }
// the nearest folder with a vault at or above a path (a file or a folder), or null — where an agent working there writes
function vaultOf(p) { p = path.resolve(p); return hasVault(p) ? p : vaultAbove(p); }

// ------------------------------------------------------------------ the folder's note to agents
const NOTE_OPEN = '<!-- wye:vault -->', NOTE_CLOSE = '<!-- /wye:vault -->';
const note = (slug, title) => `${NOTE_OPEN}
## Knowledge of this folder: Wye

What ${title} must do and why — requirements, rules, decisions, open questions, tasks — is kept in \`.wye/\` in this
folder (the Wye vault \`${slug}\`), not only in the code. When you work on files under this folder:

- **Read it first**: run \`wye\` from this folder — it finds this vault on its own. \`wye packet --for "<what you are about to do>"\` (the constraints in force), \`wye context "<text>"\`, \`wye node <id>\`.
- **Write back what you learn**, as proposed blocks a person approves: a decision, a changed requirement or a rule with \`wye propose\`, a question you could not answer the same way, a follow-up with \`wye work add "<text>"\`. Never leave them only in your reply.
- Files outside this folder belong to another vault — the nearest \`.wye/\` above them: run \`wye\` from their folder to write there what concerns them. From anywhere else, name this vault: \`--product ${slug}\`.

The documents are markdown under \`.wye/projects/\`; \`.wye/_agent.md\` holds this folder's own instructions.
${NOTE_CLOSE}
`;
// AGENTS.md always; CLAUDE.md too unless it already takes AGENTS.md in (`@AGENTS.md`). A file that exists gains the
// section at its end; one that already has it is left as it is.
function writeNote(folder, slug, title, made) {
  const text = note(slug, title);
  const put = name => {
    const f = path.join(folder, name);
    let cur = null; try { cur = fs.readFileSync(f, 'utf8'); } catch { /* new */ }
    if (cur !== null && cur.includes(NOTE_OPEN)) { made.skipped.push(f); return; }
    fs.writeFileSync(f, cur === null ? text : cur.replace(/\n*$/, '\n\n') + text);
    made.written.push(f);
  };
  put('AGENTS.md');
  let claude = ''; try { claude = fs.readFileSync(path.join(folder, 'CLAUDE.md'), 'utf8'); } catch { /* none */ }
  if (!/^@AGENTS\.md\s*$/m.test(claude)) put('CLAUDE.md');
}

const agentFile = (slug, title) => `# ${title} — instructions for agents

What an agent working on ${title} must know that the code does not say: how to run and test it, what never to touch,
the conventions of this folder. Every session Wye starts on \`${slug}\` receives this page after the Wye contract.

(to be written — keep it short; a rule about the product belongs in the Constitution as a \`constraint:\` block)
`;
// what a vault keeps out of git: the built graph and this machine's history (sessions, change records, hook logs) —
// the same line `wye export` draws (decision:wf2.product-transfer)
const GITIGNORE = '_build/\n_sessions/\n_changes/\n_hooks/\n_impact/\n';

/**
 * A vault for `folder`. opts: { folder, slug?, title?, icon?, description? }
 * → { existing, folder, dir, slug, title, parent, children, made: { written, skipped, counts }, areas, linked }
 * `linked` names every other vault whose _product.md was changed to know this one.
 */
function initVault(opts) {
  const folder = path.resolve(opts.folder);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error(`invalid: ${folder} is not a folder`);
  const dir = vaultDir(folder);
  if (hasVault(folder) || fs.existsSync(path.join(dir, 'projects'))) {
    const m = readMeta(folder);
    return { existing: true, folder, dir, slug: m.slug || slugify(path.basename(folder)), title: m.title || path.basename(folder) };
  }
  const slug = slugify(opts.slug || path.basename(folder));
  const title = (opts.title || '').trim() || path.basename(folder).replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
  const parent = vaultAbove(folder);
  const children = vaultsBelow(folder);
  // a slug is the vault's id prefix, so the vaults it is linked to cannot share it
  const near = [...(parent ? [parent, ...links(parent).vaults] : []), ...children];
  const clash = near.find(f => (readMeta(f).slug || slugify(path.basename(f))) === slug);
  if (clash) throw new Error(`conflict: the vault of ${clash} is already called ${slug} — pass another name (wye init --slug <name>)`);

  const r = init({ productDir: dir, product: slug, project: slug, title, repo: folder, vault: true, skip: children, icon: opts.icon, description: opts.description });
  const made = r.made;
  const once = (file, text) => { if (fs.existsSync(file)) { made.skipped.push(file); return; } fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); made.written.push(file); };
  once(path.join(dir, '_agent.md'), agentFile(slug, title));
  once(path.join(dir, '.gitignore'), GITIGNORE);
  fs.mkdirSync(path.join(dir, 'inbox'), { recursive: true });
  writeNote(folder, slug, title, made);

  // the links, both ways: this vault names its parent and the vaults below it; the parent names this one in place of
  // the children it hands over; each child names this one as its parent
  const linked = [];
  setMeta(folder, { parent: parent ? rel(folder, parent) : '', vaults: listValue(children.map(c => rel(folder, c))) });
  if (parent) {
    const kept = readMeta(parent).vaults.filter(p => { const abs = path.resolve(parent, p); return abs !== folder && !children.includes(abs); });
    if (setMeta(parent, { vaults: listValue([...kept, rel(parent, folder)]) })) linked.push(parent);
  }
  for (const c of children) if (setMeta(c, { parent: rel(c, folder) })) linked.push(c);
  return { existing: false, folder, dir, slug, title, parent, children, made, areas: r.areas, linked };
}

module.exports = { initVault, vaultAbove, vaultsBelow, vaultOf, links, reach, rescan, applyFixes, readMeta, setMeta, hasVault, vaultDir, VAULT };
