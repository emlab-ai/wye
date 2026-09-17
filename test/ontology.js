'use strict';
// Ontology: type: cards declare kinds; instances use kind:slug; properties inherit along extends; ref/list props are
// edges named by the property; inverses are generated; ctx check validates instances against effective properties.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const md = `---
node: module:people
title: People
---

# People

\`\`\`yaml
- id: type:person
  extends: type:node
  props:
    name: string
    email: string?
- id: type:employee
  extends: type:person
  props:
    startDate: date
    manager: ref employee -(inverse)-> reports
- id: type:manager
  extends: type:employee
  props:
    team: ref team -(inverse)-> leads
- id: type:team
  extends: type:node
  props:
    members: list of person -(inverse)-> memberOf
    size: number?
\`\`\`

## Instances

\`\`\`yaml
- id: team:platform
  name: Platform
  members: [person:ana, employee:bo]
  size: two
- id: manager:ana
  name: Ana
  startDate: 2026-02-01
  team: team:platform
- id: person:cy
  email: cy@example.com
  nickname: C
\`\`\`

employee:bo Bo joined in March (startDate: 2026-03-09, manager: manager:ana)

A paragraph that links [the team](team:platform) in passing.
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-onto-'));
const file = path.join(dir, 'people.md');
fs.writeFileSync(file, md);
const data = parseFiles([file]);
const g = new Graph(data);

// --- types are nodes; instances of declared types are ids
const tp = g.node('type:person');
assert(tp && tp.defined && tp.kind === 'type', 'type:person is a defined node of kind type');
assert((g.out.get('type:employee') || []).some(e => e.verb === 'extends' && e.to === 'type:person'), 'extends is an edge');
const ana = g.node('manager:ana');
assert(ana && ana.defined && ana.kind === 'manager', 'manager:ana defined from a card with an open kind');
const bo = g.node('employee:bo');
assert(bo && bo.defined && bo.form === 'prose', 'employee:bo defined as a prose node with an open kind');
assert((g.out.get("module:people") || []).some(e => e.verb === "related-to" && e.to === "team:platform"), "open kinds are recognised in plain prose links");

// --- graph.types carries chain and effective properties
const types = Object.fromEntries(data.types.map(t => [t.id, t]));
assert.deepStrictEqual(types['type:manager'].chain, ['type:node', 'type:person', 'type:employee', 'type:manager'], 'chain parent first');
const mgrProps = Object.fromEntries(types['type:manager'].props.map(p => [p.name, p]));
assert(mgrProps.name && mgrProps.name.from === 'type:person' && mgrProps.name.required, 'inherited required prop remembers its declaring type');
assert(mgrProps.email && !mgrProps.email.required, 'trailing ? makes a prop optional');
assert(mgrProps.manager && mgrProps.manager.ref === 'employee' && !mgrProps.manager.many && mgrProps.manager.inverse === 'reports', 'ref prop: target, cardinality, inverse');
const teamProps = Object.fromEntries(types['type:team'].props.map(p => [p.name, p]));
assert(teamProps.members.ref === 'person' && teamProps.members.many && teamProps.members.inverse === 'memberOf', 'list of prop is many');
assert(g.node('prop:team.members') && (g.out.get('type:team') || []).some(e => e.verb === 'has' && e.to === 'prop:team.members'), 'properties are generated nodes the type has');

// --- ref/list props are edges named by the property
const outOf = id => (g.out.get(id) || []).filter(e => !e.generated).map(e => e.verb + '>' + e.to).sort();
assert.deepStrictEqual(outOf('team:platform'), ['members>employee:bo', 'members>person:ana'], 'collection edges: ' + outOf('team:platform'));
assert(outOf('employee:bo').includes('manager>manager:ana'), 'prose trailing group ref prop is an edge: ' + outOf('employee:bo'));
assert(outOf('manager:ana').includes('team>team:platform'), 'card ref prop is an edge');

// --- inverses are generated, marked, named
const gen = (g.out.get('person:ana') || []).filter(e => e.generated);
assert(gen.some(e => e.verb === 'memberOf' && e.to === 'team:platform'), 'memberOf generated on the member');
assert((g.out.get('manager:ana') || []).some(e => e.generated && e.verb === 'reports' && e.to === 'employee:bo'), 'reports generated on the manager');
assert((g.out.get('team:platform') || []).some(e => e.generated && e.verb === 'leads' && e.to === 'manager:ana'), 'leads generated on the team');
assert((g.out.get('req:x') || []).length === 0, 'no stray edges');

// --- check validates instances
const c = g.check({ repo: dir });
const has = (list, re) => list.some(m => re.test(m));
assert(has(c.warnings, /person:cy: required property name missing/), 'required missing: ' + c.warnings.join(' | '));
assert(has(c.warnings, /person:cy: undeclared property nickname/), 'undeclared property');
assert(has(c.warnings, /team:platform: size "two" is not a number/), 'value type');
assert(has(c.warnings, /person:ana: required property name missing/) === false, 'referenced-only instance is not validated');
assert(c.ok, 'no errors: ' + c.errors.join('; '));

// --- render / packet carry the type chain so an agent knows a manager is an employee
const rendered = g.render(g.node('manager:ana'));
assert(/type: manager < employee < person/.test(rendered), 'render shows the type chain: ' + rendered.split('\n')[1]);
assert(!/type: req/.test(g.render(g.node('type:person'))) , 'base kinds do not repeat their trivial chain');

console.log('ok — ontology: types, inheritance, edges, inverses, check, render');
