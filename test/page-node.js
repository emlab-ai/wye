'use strict';
// The page as a node (req:wf2.page.node, rule:page-node-line): the frontmatter `node:` line takes any kind:slug whose
// kind is a declared type; that node is the document's node with the frontmatter as its body, validated against the
// type like any instance; ref/list properties of the type written in the frontmatter are edges named by the property.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-page-'));
const w = (name, s) => { const f = path.join(dir, name); fs.writeFileSync(f, s); return f; };
const onto = w('ontology.md', `---
node: module:ontology
title: Ontology
---

\`\`\`yaml
- id: type:person
  extends: type:node
  props:
    name: string
- id: type:team
  extends: type:node
  props:
    lead: ref person -(inverse)-> leads
    members: list of person? -(inverse)-> memberOf
    size: number?
\`\`\`
`);
const team = w('platform.md', `---
node: team:platform
title: Platform team
status: active
icon: 🛠
order: 2
last-verified: 2026-09-18
lead: person:ana
members: [person:ana, person:bo]
size: two
---

# Platform team

person:ana Ana leads (name: Ana)
person:bo Bo (name: Bo)
`);
const bad = w('ghost.md', `---
node: ghost:x
title: Ghost
---

# Ghost
`);
const plain = w('todo.md', `---
node: module:todo
type: module
title: TODO
---

# TODO
`);
// a plan page as the app writes it (templates/docs/pr.md) in a product with no ontology document of its own
const plan = w('pr-x.md', `---
node: pr:x
type: pr
title: Do X
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: abc123
agent: claude-code
started: 2026-09-18T12:00:00.000Z
part-of: module:todo
---

# Do X
`);
const data = parseFiles([onto, team, bad, plain, plan]);
const g = new Graph(data);

// --- the page's node has the page's kind
const t = g.node('team:platform');
assert(t && t.defined && t.kind === 'team' && t.line === 1, 'team:platform is the document node, defined at line 1');
assert.strictEqual(t.title, 'Platform team', 'title from the frontmatter');
assert.strictEqual(t.status, 'active', 'status from the frontmatter');
assert(t.body.includes('lead: person:ana'), 'the frontmatter is the body');
assert(data.modules.some(m => m.id === 'team:platform' && /platform\.md$/.test(m.file)), 'graph.modules lists the page whatever its kind');
assert(data.modules.some(m => m.id === 'module:todo'), 'module stays the default kind');

// --- ref/list properties of the type in the frontmatter are edges named by the property
const out = g.out.get('team:platform') || [];
assert(out.some(e => e.verb === 'lead' && e.to === 'person:ana'), 'lead → person:ana');
assert(out.some(e => e.verb === 'members' && e.to === 'person:bo'), 'members → person:bo');
assert((g.out.get('person:ana') || []).some(e => e.verb === 'leads' && e.to === 'team:platform' && e.generated), 'the inverse is generated');

// --- the page is an instance: ctx check validates its frontmatter against the type, ignoring the page bookkeeping keys
const { errors, warnings } = g.check();
const has = (list, re) => list.some(m => re.test(m));
assert(has(warnings, /team:platform: size "two" is not a number/), 'a mistyped frontmatter property is reported');
assert(!has(warnings, /team:platform: undeclared property (title|status|icon|order|last-verified|node)/), 'page bookkeeping keys are not undeclared properties: ' + warnings.filter(x => x.includes('team:platform')).join(' | '));

// --- an unknown kind on the node line is an error and the page is not in the graph
assert(has(errors, /ghost\.md: node ghost:x — ghost is not a declared type/), 'unknown kind reported: ' + errors.join(' | '));
assert(!data.modules.some(m => m.id === 'ghost:x'), 'the ghost page is not a module');

// --- type:pr is a base type (rule:pr-type-base): a plan page parses in any product, its props declared
const p = g.node('pr:x');
assert(p && p.defined && p.kind === 'pr', 'pr:x is the document node of a product without its own type:pr: ' + errors.join(' | '));
assert(data.modules.some(m => m.id === 'pr:x'), 'the plan page is in the graph');
assert(!has(warnings, /pr:x: undeclared property (session|agent|started)/), 'session, agent, started are declared on type:pr: ' + warnings.filter(x => x.includes('pr:x')).join(' | '));
assert((g.out.get('pr:x') || []).some(e => e.verb === 'part-of' && e.to === 'module:todo'), 'part-of from the frontmatter is an edge');

// --- the frontmatter type: line is not read
assert(!has(warnings, /module:todo: undeclared property type/), 'type: is a bookkeeping key');
console.log('page-node ok');
