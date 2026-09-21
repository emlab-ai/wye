#!/usr/bin/env node
'use strict';
// lib:cards — keeps the component, lib, op and page cards of Wye's own definition in step with the files under
// packages/web/src (decision:app.cards-generator, decision:app.cards-file-kinds). `--check` lists the files no card
// names and the cards whose file is gone (exit 1 when either); `--write` adds a proposed card per uncovered file with
// the file's header comment as its purpose, re-points a card whose file moved (same basename, unique), retires a card
// whose file was deleted, and tightens an op card's `source:` to its route file. It never rewrites an existing card's
// purpose, side or part-of, and never deletes a block. `--json` prints the check as JSON.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = 'packages/web/src';
const DOCS = 'data/products/wye/projects/v2/docs';
const KINDS = ['component', 'lib', 'op', 'page'];
const HOME = { component: 'components.md', op: 'api.md', page: 'pages.md', libFallback: 'app-storage.md' };

// --- the source tree
function sourceFiles(root = ROOT) {
  const out = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel(p));
    }
  };
  walk(path.join(root, SRC));
  return out.sort();
}

// The header comment: the first run of comment lines before the code, after 'use client' and the imports; block
// comments too. Joined with spaces. `{ withId: true }` splits off a leading `kind:slug` token (decision:memory.code-source).
function headerOf(file, opts = {}) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const out = [];
  let i = 0, inBlock = false, inImport = false;
  for (; i < lines.length; i++) {
    const l = lines[i], t = l.trim();
    if (inBlock) { const end = t.indexOf('*/'); out.push((end === -1 ? t : t.slice(0, end)).replace(/^\*\s?/, '')); if (end !== -1) { inBlock = false; break; } continue; }
    if (inImport) { if (/from\s+['"][^'"]+['"];?\s*$/.test(t) || /['"];?\s*$/.test(t)) inImport = false; continue; }
    if (t === '' || /^['"]use (client|server)['"];?$/.test(t)) { if (out.length) break; continue; }
    if (/^(import|export)\s.*\bfrom\s+['"]/.test(t) || /^import\s+['"]/.test(t)) { if (out.length) break; continue; }
    if (/^import\s/.test(t)) { if (out.length) break; inImport = true; continue; }
    if (t.startsWith('//')) { out.push(t.replace(/^\/\/\s?/, '')); continue; }
    if (t.startsWith('/*')) { const body = t.replace(/^\/\*+\s?/, ''); const end = body.indexOf('*/'); if (end === -1) { inBlock = true; if (body) out.push(body); } else { out.push(body.slice(0, end)); break; } continue; }
    break; // code
  }
  const text = out.map((s) => s.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!opts.withId) return text;
  const m = text.match(/^((?:component|lib|op|page|rule|entity):[a-z0-9][a-z0-9./-]*)\s*(?:—|-|:)?\s*(.*)$/s);
  return m ? { id: m[1], text: m[2].trim() } : { id: null, text };
}

// --- kind and id by path
function kindOf(file) {
  const f = file.replace(/^packages\/web\/src\//, '');
  if (/^app\/api\/.*\/route\.ts$/.test(f)) return 'op';
  if (/^app\/(.*\/)?page\.tsx$/.test(f)) return 'page';
  if (/^app\//.test(f)) return 'component'; // layout.tsx, route.ts outside api, loading.tsx …
  if (/^components\//.test(f)) return 'component';
  if (/^lib\//.test(f)) return 'lib';
  return 'lib';
}
const kebab = (s) => s.replace(/\.[jt]sx?$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
const param = (s) => s.replace(/^\[(\.\.\.)?|\]$/g, '');
// `taken` (a Set of existing ids) makes the id unique: an op whose dotted path collides gets its parameter name
// appended; anything else `-2`, `-3`. Without it the plain form is returned.
function idFor(file, taken) {
  const f = file.replace(/^packages\/web\/src\//, '');
  const segs = f.split('/');
  const base = segs[segs.length - 1];
  let id;
  const kind = kindOf(file);
  if (kind === 'op') {
    const parts = segs.slice(2, -1).filter((s) => s !== '[product]');
    const plain = 'op:api.' + parts.filter((s) => !s.startsWith('[')).join('.');
    const withParams = 'op:api.' + parts.map(param).join('.');
    id = plain.replace(/\.$/, '');
    if (id === 'op:api.' || id === 'op:api') id = withParams;
    if (taken === undefined) return parts.some((s) => s.startsWith('[')) && plain !== withParams ? withParams : id;
    if (taken.has(id) && withParams !== id) id = withParams;
  } else if (kind === 'page') {
    const parts = segs.slice(1, -1).filter((s) => s !== '[product]').map(param);
    id = 'page:web/' + (parts.length ? parts.join('-') : segs[1] === '[product]' ? 'product' : 'home');
  } else if (/^app\//.test(f)) {
    const dir = segs.length > 2 ? param(segs[segs.length - 2]) : 'root';
    id = `component:${kebab(dir)}-${kebab(base)}`;
  } else id = `${kind}:${kebab(base)}`;
  if (taken) for (let n = 2; taken.has(id); n++) id = id.replace(/-\d+$/, '') + '-' + n;
  return id;
}

// --- a route (op `args:` or page `route:`) → the files among `files` it maps to; `<x>` matches any dynamic
// segment, `[/<x>]` is optional, trailing prose after the route is ignored
function routeToFiles(route, files) {
  const found = new Set();
  const cands = [];
  for (const tok of String(route).split(/\s+/)) { if (tok.startsWith('/')) cands.push(tok.replace(/[?#].*$/, '').replace(/[),;.]+$/, '')); }
  const expand = (r) => { const m = r.match(/^(.*)\[(\/[^\]]+)\](.*)$/); return m ? [...expand(m[1] + m[3]), ...expand(m[1] + m[2] + m[3])] : [r]; };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  for (const c of cands.flatMap(expand)) {
    const api = c.startsWith('/api/');
    const segs = c.split('/').filter(Boolean).slice(api ? 1 : 0);
    const re = new RegExp('^' + esc(SRC) + '/app/' + (api ? 'api/' : '') +
      segs.map((s) => (/^<[^>]+>$/.test(s) ? '\\[[^\\]/]+\\]' : esc(s)) + '/').join('') + (api ? 'route\\.ts' : 'page\\.tsx') + '$');
    for (const f of files) if (re.test(f)) found.add(f);
  }
  return [...found];
}

// A `file:` / `source:` / `component:` value → one repo path under packages/web/src, or null when it is not a file
// there. A relative `app/…`, `components/…` or `lib/….ts` is under src; `lib/….js` and `bin/…` are the repo's own.
function normalizeFile(v) {
  let s = String(v).trim().replace(/#.*$/, '').trim();
  if (!s || s.startsWith('(')) return null;
  if (/^(app|components)\//.test(s) || /^lib\/.*\.tsx?$/.test(s)) s = SRC + '/' + s;
  if (!s.startsWith(SRC + '/')) return null;
  return s;
}
const splitFiles = (v) => String(v).split(/[;,]\s*/).map((s) => s.trim()).filter(Boolean);

// --- the cards, scanned from the yaml fences of the v2 documents (id row + two-space props; folded text kept as lines)
function readCards(root = ROOT) {
  const dir = path.join(root, DOCS);
  const cards = [], docs = {};
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split('\n');
    docs[name] = lines;
    let fence = false, cur = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^```/.test(l)) { fence = !fence; cur = null; continue; }
      if (!fence) continue;
      const m = l.match(/^- id: ((component|lib|op|page):[^\s]+)\s*$/);
      if (m) { cur = { id: m[1], kind: m[2], doc: name, line: i, end: i, props: {}, propLine: {} }; cards.push(cur); continue; }
      if (/^- /.test(l)) { cur = null; continue; }
      if (!cur) continue;
      cur.end = i;
      const p = l.match(/^  ([a-z-]+):\s?(.*)$/);
      if (p) { cur.props[p[1]] = p[2].trim(); cur.propLine[p[1]] = i; }
    }
  }
  return { cards, docs };
}

// --- the check: files no card names, cards whose file is gone
function check(root = ROOT) {
  const files = sourceFiles(root);
  const fileSet = new Set(files);
  const { cards } = readCards(root);
  const covered = new Map();
  const cover = (f, id) => { if (!covered.has(f)) covered.set(f, []); covered.get(f).push(id); };
  const missing = [];
  for (const c of cards) {
    if (c.props.status === 'retired') continue;
    for (const k of ['file', 'source', 'component']) {
      if (!c.props[k]) continue;
      for (const raw of splitFiles(c.props[k])) {
        const f = normalizeFile(raw);
        if (!f) continue;
        if (fileSet.has(f)) cover(f, c.id);
        else if (!fs.existsSync(path.join(root, f))) missing.push({ id: c.id, doc: c.doc, key: k, file: f, raw });
      }
    }
    for (const k of ['args', 'route']) if (c.props[k]) for (const f of routeToFiles(c.props[k], files)) cover(f, c.id);
  }
  const uncovered = files.filter((f) => !covered.has(f));
  return { files: files.length, cards: cards.length, uncovered, missing, covered, all: cards };
}

// --- write mode
const wrap = (text, width = 112, indent = '    ') => {
  const words = text.split(' '); const out = []; let line = '';
  for (const w of words) { if ((line + ' ' + w).trim().length > width && line) { out.push(indent + line); line = w; } else line = (line ? line + ' ' : '') + w; }
  if (line) out.push(indent + line);
  return out;
};
const yamlText = (s) => /[:#'"{}[\]]|^\s|\s$/.test(s) || s === '' ? JSON.stringify(s) : s;

// Ids the header names that no document defines are escaped (`kind&#58;slug`, as the definition does) so the card
// does not reference an undescribed node; the person restores the colon when the node is written.
function definedIds(root) {
  try { return new Set(require(path.join(root, 'data/products/wye/_build/graph.json')).nodes.filter((n) => n.defined !== false).map((n) => n.id)); }
  catch { return null; }
}
function escapeUnknown(text, defined) {
  if (!defined) return text;
  return text.replace(/\b([a-z][a-z0-9-]*):([A-Za-z0-9][A-Za-z0-9./_-]*[A-Za-z0-9])/g, (m, kind, slug) => defined.has(m) || !/^(req|rule|decision|goal|task|question|constraint|entity|component|lib|op|page|module|type|test|ui-test|gate|flag|field|value|state|action)$/.test(kind) ? m : `${kind}&#58;${slug}`);
}
function newCard(file, kind, id, docNode, root, defined) {
  const h = headerOf(path.join(root, file), { withId: true });
  const purpose = escapeUnknown(h.text || '(no header comment)', defined);
  const rows = [`- id: ${id}`];
  const f = file.replace(/^packages\/web\/src\//, '');
  if (kind === 'op') {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const methods = [...src.matchAll(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm)].map((m) => m[1]);
    const route = '/' + f.replace(/^app\//, '').replace(/\/route\.ts$/, '').split('/').map((s) => s.startsWith('[') ? '<' + param(s) + '>' : s).join('/');
    rows.push(`  args: ${(methods.length ? methods.join(' | ') + ' ' : '') + route}`, `  does: >`, ...wrap(purpose), `  gate: none (local app)`, `  source: ${file}`, `  status: proposed`, `  part-of: ${docNode}`);
  } else if (kind === 'page') {
    const route = '/' + f.replace(/^app\//, '').replace(/\/?page\.tsx$/, '').split('/').filter(Boolean).map((s) => s.startsWith('[') ? '<' + param(s) + '>' : s).join('/');
    rows.push(`  route: ${route || '/'}`, `  component: ${file}`, `  purpose: >`, ...wrap(purpose), `  status: proposed`, `  part-of: ${docNode}`);
  } else {
    const side = kind === 'lib' ? (/^packages\/web\/src\/lib\//.test(file) && !/^'use client'/.test(fs.readFileSync(path.join(root, file), 'utf8')) ? 'server' : 'client') : (/^'use client'/.test(fs.readFileSync(path.join(root, file), 'utf8')) ? 'client' : 'server');
    rows.push(`  file: ${file}`, `  side: ${side}`, `  purpose: >`, ...wrap(purpose), `  status: proposed`, `  part-of: ${docNode}`);
  }
  return rows;
}

// Which module page a new lib card goes to: the page holding the most lib cards among the file's `@/lib/…` imports
function libHome(file, cards, root) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const imports = [...src.matchAll(/from\s+['"]@\/lib\/([^'"]+)['"]/g)].map((m) => SRC + '/lib/' + m[1] + '.ts');
  const byFile = new Map();
  for (const c of cards) if (c.kind === 'lib' && c.props.file) for (const raw of splitFiles(c.props.file)) { const f = normalizeFile(raw); if (f) byFile.set(f, c.doc); }
  const count = {};
  for (const i of imports) { const d = byFile.get(i); if (d) count[d] = (count[d] || 0) + 1; }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : HOME.libFallback;
}

const docNodeOf = (lines) => { for (let i = 1; i < lines.length && lines[i] !== '---'; i++) { const m = lines[i].match(/^node:\s*(\S+)/); if (m) return m[1]; } return null; };

// Insert rows into the last `<!-- list:<kind> -->` region of a document (its closing fence), making a "## Unsorted"
// section with a region when the document has none for that kind or `unsorted` is asked.
function insertCard(lines, kind, rows, unsorted) {
  let close = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim() === `<!-- /list:${kind} -->`) { close = i; break; }
  if (unsorted || close === -1) {
    let head = lines.findIndex((l) => l.trim() === '## Unsorted');
    if (head === -1) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push('', '## Unsorted', '', `<!-- list:${kind} -->`, '', '```yaml', '```', '', `<!-- /list:${kind} -->`, '');
      head = lines.indexOf('## Unsorted');
    }
    close = -1;
    for (let i = head; i < lines.length; i++) if (lines[i].trim() === `<!-- /list:${kind} -->`) { close = i; break; }
    if (close === -1) { // an Unsorted section of another kind: add a region for this one before the next heading
      let next = lines.length; for (let i = head + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { next = i; break; }
      lines.splice(next, 0, `<!-- list:${kind} -->`, '', '```yaml', '```', '', `<!-- /list:${kind} -->`, '');
      close = next + 5;
    }
  }
  let fence = -1;
  for (let i = close - 1; i >= 0; i--) if (lines[i].trim() === '```') { fence = i; break; }
  if (fence === -1) throw new Error(`no yaml fence before the list:${kind} close`);
  lines.splice(fence, 0, ...rows);
}

function write(root = ROOT, log = console.log) {
  const res = check(root);
  const { cards, docs } = readCards(root);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const taken = new Set(cards.map((c) => c.id));
  const files = sourceFiles(root);
  const edits = {}; // doc → [{ line, text }] replacements, applied bottom-up
  const edit = (doc, line, text) => { (edits[doc] = edits[doc] || []).push({ line, text }); };
  const insertAfter = (doc, line, rows) => { (edits[doc] = edits[doc] || []).push({ line, insert: rows }); };
  const changed = { added: [], moved: [], retired: [], tightened: [] };

  // 1. cards whose file is gone: a path moved (same basename, then the same parent folder name, one candidate) is
  // re-pointed; a gone path among others is dropped from the value; a card with no file left is retired
  const moveTarget = (file) => {
    const base = path.basename(file), parent = path.basename(path.dirname(file));
    let cands = files.filter((f) => path.basename(f) === base);
    if (cands.length > 1) cands = cands.filter((f) => path.basename(path.dirname(f)) === parent);
    return cands.length === 1 && !res.covered.has(cands[0]) ? cands[0] : null;
  };
  const perValue = new Map(); // `${id}\t${key}` → missing entries
  for (const m of res.missing) { const k = `${m.id}\t${m.key}`; if (!perValue.has(k)) perValue.set(k, []); perValue.get(k).push(m); }
  for (const [k, list] of perValue) {
    const c = byId.get(list[0].id), key = list[0].key;
    let parts = splitFiles(c.props[key]);
    for (const m of list) {
      const to = moveTarget(m.file);
      if (to) { parts = parts.map((p) => p === m.raw ? m.raw.replace(m.file, to) : p); res.covered.set(to, [c.id]); changed.moved.push(`${c.id}: ${m.file} → ${to}`); }
      else parts = parts.filter((p) => p !== m.raw);
    }
    const left = parts.filter((p) => { const f = normalizeFile(p); return !f || fs.existsSync(path.join(root, f)); });
    if (left.length) { const val = left.join('; '); if (val !== c.props[key]) { edit(c.doc, c.propLine[key], `  ${key}: ${val}`); c.props[key] = val; } }
    else if (c.props.status !== 'retired' && (key !== 'component' || !c.props.route || !routeToFiles(c.props.route, files).length)) {
      if (c.propLine.status !== undefined) edit(c.doc, c.propLine.status, '  status: retired');
      else insertAfter(c.doc, c.line, ['  status: retired']);
      c.props.status = 'retired';
      changed.retired.push(`${c.id} (${list.map((m) => m.file).join(', ')} deleted)`);
    }
  }
  // 2. op cards whose `source:` is the api folder: point at the route file(s) their args map to
  for (const c of cards) {
    if (c.kind !== 'op' || !c.props.args || c.props.status === 'retired') continue;
    const s = c.props.source || '';
    if (s && s !== 'packages/web/src/app/api' && s !== 'packages/web/src/app/api/') continue;
    const mapped = routeToFiles(c.props.args, files);
    if (!mapped.length) continue;
    const val = mapped.join('; ');
    if (c.propLine.source !== undefined) edit(c.doc, c.propLine.source, `  source: ${val}`);
    else insertAfter(c.doc, c.line, [`  source: ${val}`]);
    changed.tightened.push(`${c.id}: ${val}`);
  }
  // apply the in-place edits (bottom-up so lines stay valid)
  for (const [doc, list] of Object.entries(edits)) {
    const lines = docs[doc];
    for (const e of list.sort((a, b) => b.line - a.line)) { if (e.insert) lines.splice(e.line + 1, 0, ...e.insert); else lines[e.line] = e.text; }
  }
  // 3. a card for every uncovered file
  const defined = definedIds(root);
  const stillUncovered = res.uncovered.filter((f) => !res.covered.has(f));
  for (const file of stillUncovered) {
    const kind = kindOf(file);
    const h = headerOf(path.join(root, file), { withId: true });
    let id = h.id && h.id.startsWith(kind + ':') && !taken.has(h.id) ? h.id : idFor(file, taken);
    taken.add(id);
    let doc, unsorted = false;
    if (kind === 'lib') doc = libHome(file, cards, root);
    else { doc = HOME[kind]; unsorted = true; }
    if (!docs[doc]) docs[doc] = fs.readFileSync(path.join(root, DOCS, doc), 'utf8').split('\n');
    const node = docNodeOf(docs[doc]) || `module:${doc.replace(/\.md$/, '')}`;
    insertCard(docs[doc], kind, newCard(file, kind, id, node, root, defined), unsorted);
    changed.added.push(`${id} ← ${file} (${doc})`);
  }
  const touched = new Set([...Object.keys(edits), ...changed.added.map((a) => a.match(/\((.+)\)$/)[1])]);
  for (const doc of touched) fs.writeFileSync(path.join(root, DOCS, doc), docs[doc].join('\n'));
  for (const [k, v] of Object.entries(changed)) if (v.length) log(`${k} (${v.length}):\n  ${v.join('\n  ')}`);
  if (!touched.size) log('in step: nothing to write');
  return changed;
}

module.exports = { escapeUnknown, sourceFiles, headerOf, kindOf, idFor, routeToFiles, normalizeFile, readCards, check, write, libHome, insertCard, newCard };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--write')) { write(); process.exit(0); }
  const res = check();
  if (argv.includes('--json')) { console.log(JSON.stringify({ files: res.files, cards: res.cards, uncovered: res.uncovered, missing: res.missing }, null, 2)); process.exit(res.uncovered.length || res.missing.length ? 1 : 0); }
  if (res.uncovered.length) console.log(`${res.uncovered.length} file(s) without a card:\n  ${res.uncovered.join('\n  ')}`);
  if (res.missing.length) console.log(`${res.missing.length} card(s) whose file is gone:\n  ${res.missing.map((m) => `${m.id} (${m.doc}) → ${m.file}`).join('\n  ')}`);
  if (!res.uncovered.length && !res.missing.length) console.log(`in step: ${res.files} files, ${res.cards} cards`);
  process.exit(res.uncovered.length || res.missing.length ? 1 : 0);
}
