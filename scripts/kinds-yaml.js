#!/usr/bin/env node
'use strict';
// schema/kinds.yaml is derived from schema/base-ontology.md (issue #5): the `kinds:`, `verbs:` and `statuses:` blocks
// are generated from the type cards — purpose and required properties per kind, every ref / list property with its
// inverse as a verb, and each type's declared `statuses:` — so the summary cannot drift from the ontology again. The
// file's preamble and its hand-written sections (goal-and-task-properties, aliases, prose-nodes, conventions) are
// kept as they are. `--check` exits 1 when the file on disk differs (it runs in `npm test`); `--write` rewrites it.
const fs = require('fs');
const path = require('path');
const { parseFiles } = require('../lib/parse.js');

const ROOT = path.resolve(__dirname, '..');
const ONTOLOGY = 'schema/base-ontology.md';
const TARGET = path.join(ROOT, 'schema/kinds.yaml');
const GENERATED = ['kinds', 'verbs', 'statuses'];
// kinds the parser generates or that only exist as blocks of another node: named in the ontology, not in the summary
const SKIP = new Set(['node', 'field', 'prop', 'block', 'type']);

const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.length));
const oneLine = s => (s || '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
const width = (names, cap) => Math.min(cap, Math.max(...names.map(s => s.length)) + 2);

// A type card's `purpose:` in full — the graph keeps only its first line, and a folded block says more than that.
function purposeOf(body) {
  const lines = (body || '').split('\n');
  const i = lines.findIndex(l => /^purpose:/.test(l));
  if (i < 0) return '';
  const first = lines[i].replace(/^purpose:\s*/, '');
  if (!/^[>|]-?$/.test(first.trim())) return oneLine(first);
  const out = [];
  for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) out.push(lines[j].trim());
  return oneLine(out.join(' '));
}

// One line per kind: the purpose as written while it fits, else its first clause — cut at a sentence or clause end,
// never mid-word, with the citations dropped. The summary says what the kind is; the ontology says the rest.
const BUDGET = 112;
const tidy = s => s.replace(/[,;]+$/, '').replace(/\s+[—-]$/, '').trim();
function summary(purpose) {
  let s = purpose.replace(/\{\{(\w+)\}\}/g, '<$1>').replace(/[{}]/g, '');   // braces would read as a yaml mapping
  if (s.length <= BUDGET) return tidy(s);
  s = oneLine(s.replace(/\s*\([^()]*\b[a-z][a-z0-9-]*:[A-Za-z0-9_.#-]+[^()]*\)/g, ''));   // (decision:…), (… constraint:…)
  if (s.length <= BUDGET) return tidy(s);
  const idx = re => [...s.matchAll(re)].map(m => m.index);
  const sentence = idx(/[.;]\s/g).find(i => i >= 45 && i <= BUDGET);            // a whole sentence when one fits
  const clause = idx(/(?:[.;:]\s|\s—\s)/g).find(i => i >= 45);                  // else the opening clause
  const at = sentence ?? clause;
  return tidy(at !== undefined ? s.slice(0, at) : s.slice(0, BUDGET).replace(/\s+\S*$/, '') + ' …');
}

function blocks(g) {
  const types = g.types.filter(t => t.id.startsWith('type:'));
  const body = new Map(g.nodes.filter(n => n.kind === 'type').map(n => [n.id, n.body || '']));
  const byId = new Map(types.map(t => [t.id, t]));
  const kinds = [];
  const verbs = new Map();   // verb → { from: Set, to: Set, inverse }
  const statuses = [];

  for (const t of types.sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (SKIP.has(t.slug)) { if (t.statuses.length) statuses.push([t.slug, t.statuses]); continue; }
    // required: what an instance must carry — the type's own and inherited requirements, minus the root type's
    const required = t.props.filter(p => p.required && p.from !== 'type:node').map(p => p.name);
    const purpose = summary(purposeOf(body.get(t.id)) || oneLine(t.purpose) || `a ${t.slug}`);
    kinds.push([t.slug, purpose, required]);
    if (t.statuses.length) statuses.push([t.slug, t.statuses]);
    // a ref / list property is a verb: who may say it, and what it points at
    for (const p of t.props) {
      if (!p.ref || p.from === 'type:node') continue;
      const owner = byId.get(p.from);
      const v = verbs.get(p.name) ?? { from: new Set(), to: new Set(), inverse: p.inverse || '' };
      v.from.add(owner ? owner.slug : p.from.replace(/^type:/, ''));
      v.to.add(p.ref);
      if (p.inverse) v.inverse = p.inverse;
      verbs.set(p.name, v);
    }
  }
  // the root type's own links hold for every node: listed once, from `any`
  const root = byId.get('type:node');
  for (const p of ((root && root.props ? root.props : []).filter(p => p.from === "type:node"))) {
    if (!p.ref) continue;
    const v = verbs.get(p.name) ?? { from: new Set(), to: new Set(), inverse: p.inverse || '' };
    v.from.add('any'); v.to.add(p.ref); if (p.inverse) v.inverse = p.inverse;
    verbs.set(p.name, v);
  }

  const kw = width(kinds.map(([slug]) => slug + ':'), 16);
  const kindLines = kinds.map(([slug, purpose, required]) =>
    `  ${pad(slug + ':', kw)}{ purpose: ${purpose}${required.length ? `, required: [${required.join(', ')}]` : ''} }`);
  const verbLines = [...verbs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, v]) => {
    const from = [...v.from].sort().join(' | ') || 'any';
    const to = [...v.to].sort().join(' | ');
    return `  ${pad(name + ':', 16)}${from} → ${to}${v.inverse ? `   (inverse: ${v.inverse})` : ''}`;
  });
  const sw = width(statuses.map(([slug]) => slug + ':'), 16);
  const statusLines = statuses.sort((a, b) => a[0].localeCompare(b[0])).map(([slug, list]) => `  ${pad(slug + ':', sw)}[${list.join(', ')}]`);
  return { kinds: kindLines, verbs: verbLines, statuses: statusLines };
}

// Replace each generated block in place; everything else in the file is left untouched.
function render(current, made) {
  const lines = current.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([a-z-]+):\s*$/);
    if (!m || !GENERATED.includes(m[1])) { out.push(lines[i]); continue; }
    out.push(lines[i], ...made[m[1]]);
    while (i + 1 < lines.length && !/^[a-z-]+:/.test(lines[i + 1])) i++;   // skip the old body
    if (out[out.length - 1] !== '') out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function main() {
  const argv = process.argv.slice(2);
  const g = parseFiles([ONTOLOGY], ROOT);
  const made = blocks(g);
  const current = fs.readFileSync(TARGET, 'utf8');
  const next = render(current, made);
  const missing = GENERATED.filter(k => !new RegExp(`^${k}:\\s*$`, 'm').test(current));
  if (missing.length) { console.error(`schema/kinds.yaml has no ${missing.join(', ')} block to generate into`); process.exit(1); }
  if (argv.includes('--write')) {
    if (next === current) { console.log('kinds.yaml: in step'); return; }
    fs.writeFileSync(TARGET, next); console.log(`kinds.yaml: written (${made.kinds.length} kinds, ${made.verbs.length} verbs, ${made.statuses.length} status sets)`);
    return;
  }
  if (next !== current) {
    const a = current.split('\n'), b = next.split('\n');
    const first = a.findIndex((l, i) => l !== b[i]);
    console.error(`schema/kinds.yaml is not in step with ${ONTOLOGY} (first difference on line ${first + 1}) — run: node scripts/kinds-yaml.js --write`);
    console.error(`  on disk:   ${(a[first] ?? '').trim().slice(0, 120)}`);
    console.error(`  generated: ${(b[first] ?? '').trim().slice(0, 120)}`);
    process.exit(1);
  }
  console.log(`ok — kinds.yaml in step with the ontology (${made.kinds.length} kinds, ${made.verbs.length} verbs, ${made.statuses.length} status sets)`);
}
main();
