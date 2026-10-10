#!/usr/bin/env node
// References a card makes (decision:waterfall.references-say-what-they-cannot-link): lib: and component: ids are kinds
// of every product; an id in an inline code span is an example, not a reference; a value of ids whose kind is no type
// of the product is warned about instead of vanishing; an id defined twice is warned about; a field named by an
// ordinary word is never mentioned by prose that uses the word.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseFiles } = require('../lib/parse');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wye-refs-'));
const write = (name, text) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); return name; };

write('docs/app.md', `---
node: module:app
type: module
title: App
---

# App

\`\`\`yaml
- id: req:app.home
  title: The home screen loads
  status: shipped
  satisfied-by: [lib:src.homescreen, component:header, widget:thing]
  verified-by: [test:home]
- id: lib:src.homescreen
  file: src/HomeScreen.tsx
  purpose: the home screen
- id: component:header
  file: src/Header.tsx
  purpose: the header
- id: entity:stamp-card
  title: Stamp card
  fields:
    title: string
    stamps: number
    expiresAt: date
- id: req:app.title
  title: The title shows
  status: shipped
  text: every card shows its title and its stamps and when it expiresAt
\`\`\`

A link goes on the words, as \`[the words](kind:slug)\`, never bare like \`req:nope\`.
`);
write('docs/dup.md', `---
node: module:dup
type: module
title: Dup
---

# Dup

\`\`\`yaml
- id: lib:src.homescreen
  file: src/other/HomeScreen.tsx
  purpose: the other home screen
\`\`\`
`);

process.chdir(dir);
const g = parseFiles(['docs/app.md', 'docs/dup.md'].map(f => path.join(dir, f)));
const edges = g.edges.filter(e => e.from === 'req:app.home' && e.verb === 'satisfied-by').map(e => e.to).sort();
assert.deepStrictEqual(edges, ['component:header', 'lib:src.homescreen'], 'lib: and component: ids make edges');
assert.ok(!g.nodes.some(n => n.id === 'kind:slug' || n.id === 'req:nope'), 'an id in a code span is not a node');
const msgs = (g.problems || []).map(p => p.msg);
assert.ok(msgs.some(m => /req:app.home: satisfied-by names widget:thing, but widget is not a kind/.test(m)), 'an unknown kind is warned about: ' + msgs.join(' | '));
assert.ok(msgs.some(m => /lib:src.homescreen: defined twice \(\S*docs\/app.md:\d+ and \S*docs\/dup.md:\d+\)/.test(m)), 'a second definition is warned about: ' + msgs.join(' | '));
const mentions = g.edges.filter(e => e.from === 'req:app.title' && e.verb === 'mentions').map(e => e.to).sort();
assert.ok(!mentions.includes('field:stamp-card.title'), 'a field named title is not mentioned by the word: ' + mentions.join(', '));
assert.ok(mentions.includes('field:stamp-card.expiresAt'), 'a field with a name of its own is: ' + mentions.join(', '));
process.chdir(os.tmpdir()); fs.rmSync(dir, { recursive: true, force: true });
console.log('ok — references: lib/component kinds, code-span examples, unknown kinds and double definitions warned, generic field names not mentioned');
