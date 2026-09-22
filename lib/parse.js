'use strict';
// Parses one or more context-graph markdown files into { nodes, edges, fieldIndex }.
// Node = any `id: kind:slug` inside a ```yaml block, any `### kind:slug` heading, any table row whose
// first cell is an id (ops, enums, tests), and any row of the "Drift" table. Edges come from typed keys
// (satisfied-by, verified-by, refines, governed-by, ...), explicit `a -(verb)-> b` lines, and mentions.
const fs = require('fs');
const path = require('path');

const KINDS = ['req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'action', 'gate', 'flag', 'test', 'ui-test', 'module', 'product', 'task', 'goal', 'tool', 'setting', 'field', 'drift', 'question', 'decision', 'type', 'prop', 'block'];
// The base ontology declares the base kinds as type: cards; a product's own type: cards extend the kind list (pass 1),
// so the id regex used while parsing (CUR_ID_RE) is built per parse. ID_RE is the base one, for callers outside a parse.
const BASE_ONTOLOGY = path.join(__dirname, '..', 'schema', 'base-ontology.md');
// Short kind aliases for fast typing in prose (et:order → entity:order). Normalised by cleanId.
const ALIASES = { et: 'entity', rq: 'req', rl: 'rule', pg: 'page', st: 'state', dc: 'decision', qn: 'question', vl: 'value', ac: 'action', gt: 'gate', fl: 'flag', tk: 'task', gl: 'goal' };
const idRegex = kinds => new RegExp('\\b(' + kinds.map(k => k.replace(/[-]/g, '\\-')).concat(Object.keys(ALIASES)).join('|') + '):([A-Za-z0-9_][A-Za-z0-9_./#\\-]*)', 'g');
const ID_RE = idRegex(KINDS);
let CUR_ID_RE = ID_RE;
const EDGE_KEYS = {
    'refines': 'refines', 'satisfied-by': 'satisfied-by', 'verified-by': 'verified-by', 'governed-by': 'governed-by',
    'gated-by': 'gated-by', 'reads': 'reads', 'writes': 'writes', 'calls': 'calls', 'contradicts': 'contradicts',
    'owner': 'owned-by', 'owns': 'owns', 'embedded-in': 'embedded-in', 'set-by': 'set-by', 'applies-to': 'applies-to',
    'governs': 'governs', 'see': 'see', 'resolves': 'resolves', 'submodules': 'has', 'depends-on': 'depends-on',
    'adds': 'adds', 'changes': 'changes', 'requires-tests': 'verified-by', 'roles': 'mentions', 'part-of': 'part-of', 'produced': 'produced',
    'extends': 'extends',
};
const STRUCTURAL = new Set(['refines', 'satisfied-by', 'verified-by', 'governed-by', 'gated-by', 'has', 'refs', 'owns', 'calls', 'has-action', 'reads', 'writes', 'navigates', 'triggers', 'set-by', 'embedded-in', 'typed-as', 'contradicts', 'owned-by', 'applies-to', 'governs', 'edge-to', 'resolves', 'depends-on', 'adds', 'changes', 'part-of', 'related-to', 'produced']);
const STOP = new Set(['name', 'notes', 'status', 'comment', 'lines', 'email', 'phone', 'street', 'city', 'country', 'aliases', 'instructions', 'code', 'symbol', 'quantity', 'fields', 'values', 'computed']);

function cleanId(tok) {
    let t = tok.replace(/[.,;:)\]]+$/, '');
    if (t.includes('|')) t = t.split('|')[0];
    if (/^(test|ui-test):/.test(t)) t = t.replace(/#.*$/, '');
    if (t.startsWith('setting:')) t = 'flag:' + t.slice(8);
    const k = t.split(':')[0]; if (ALIASES[k]) t = ALIASES[k] + t.slice(k.length);
    return t;
}
// Words just before an id may name the relation: "satisfied by rule:x" → satisfied-by. Otherwise related-to.
const VERB_PHRASES = { 'satisfied by': 'satisfied-by', 'verified by': 'verified-by', 'governed by': 'governed-by', 'gated by': 'gated-by', 'refines': 'refines', 'resolves': 'resolves', 'reads': 'reads', 'writes': 'writes', 'calls': 'calls', 'navigates to': 'navigates', 'triggers': 'triggers', 'contradicts': 'contradicts', 'part of': 'part-of', 'owns': 'owns', 'depends on': 'depends-on', 'related to': 'related-to', 'see': 'see', 'implements': 'satisfied-by' };
function inferVerb(before) {
    const words = before.toLowerCase().replace(/[^a-z\s-]/g, ' ').trim().split(/\s+/).filter(Boolean);
    for (let n = 3; n >= 1; n--) { const ph = words.slice(-n).join(' '); if (VERB_PHRASES[ph]) return VERB_PHRASES[ph]; }
    return 'related-to';
}
// Links [label](kind:slug) and bare ids in a prose node's text, each with the inferred verb.
function proseRefs(text) {
    const out = [];
    const linkRe = /\[([^\]]+)\]\(([a-z-]+:[A-Za-z0-9_./#\-]+)\)/g; let m;
    const covered = [];
    while ((m = linkRe.exec(text))) { out.push({ id: cleanId(m[2]), label: m[1], verb: inferVerb(text.slice(Math.max(0, m.index - 40), m.index)) }); covered.push([m.index, m.index + m[0].length]); }
    CUR_ID_RE.lastIndex = 0;
    while ((m = CUR_ID_RE.exec(text))) {
        if (covered.some(([a, b]) => m.index >= a && m.index < b)) continue;
        out.push({ id: cleanId(m[0]), label: '', verb: inferVerb(text.slice(Math.max(0, m.index - 40), m.index)) });
    }
    return out;
}
const STATUS_TAG = /(?:^|\s)#(proposed|approved|shipped|unverified|api-only|deprecated|question|drift|done|in-progress|blocked|open|todo|review|non-goal|partial|active|draft|complete|on-track|at-risk|off-track|paused|resolved|rejected|superseded|retired|dismissed|defining|defined|building|cancelled|failed)\b/g;
// `#ready` on a task line is a mark, not a status (decision:exec.backlog-is-unassigned-work): the task stays todo
const READY_TAG = /(?:^|\s)#ready\b/g;
const TRAILING_TAG = new RegExp('(?:^|\\s)#(' + STATUS_TAG.source.match(/#\(([^)]*)\)/)[1] + '|ready)\\s*$');
function idsIn(text) {
    const out = []; let m; CUR_ID_RE.lastIndex = 0;
    while ((m = CUR_ID_RE.exec(text))) out.push(cleanId(m[0]));
    return out;
}

// ---- blocks: the web's anchor hash (packages/web/src/lib/anchors.ts) — FNV-1a over the decoration-free text — so
// block:<doc>.<hash> is the node behind the #b-<hash> anchor.
function normalizeText(t) { return t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~#>|\\-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function blockHash(text) {
    const s = normalizeText(text); let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
}

// ---- ontology: pass 1 reads type: cards (base ontology + the product's documents) into a type table.
// A property spec is `<value type>[?] [-(inverse)-> name]`; value types: string, text, number, date, month, bool,
// enum [a, b], ref <type>, list of <type|scalar> — and, the same things spelled as a choice (decision:ontology.one-of-many-of):
// oneOf[<type>] = ref <type>, manyOf[<type>] = list of <type>, oneOf[a, b, c] = enum [a, b, c] (a single value among
// the words), manyOf[a, b, c] = several of them (a multi-select enum: `many` with `enum`). One name in the brackets
// that is a declared type (or a base kind) is a link; anything else is a list of values.
const SCALARS = new Set(['string', 'text', 'number', 'date', 'month', 'bool']);
let KNOWN_TYPES = new Set();   // set by pass 1 before the specs are read, so oneOf[manager] knows manager is a type
function parsePropSpec(raw) {
    let spec = raw.replace(/\s+#.*$/, '').trim();
    let inverse = null; const im = spec.match(/\s*-\(inverse\)->\s*([A-Za-z][A-Za-z0-9_-]*)\s*$/);
    if (im) { inverse = im[1]; spec = spec.slice(0, im.index).trim(); }
    const required = !spec.endsWith('?'); spec = spec.replace(/\?$/, '').trim();
    const p = { type: spec, ref: null, many: false, required, inverse, enum: null };
    let m;
    if ((m = spec.match(/^(oneOf|manyOf)\s*\[(.*)\]$/))) {
        const many = m[1] === 'manyOf'; const items = m[2].split(',').map(x => x.trim()).filter(Boolean);
        if (items.length === 1 && (KNOWN_TYPES.has(items[0]) || items[0] === 'node')) { p.ref = items[0]; p.many = many; p.type = many ? `list of ${items[0]}` : `ref ${items[0]}`; }
        else { p.enum = items; p.many = many; p.type = many ? `manyOf [${items.join(', ')}]` : `enum [${items.join(', ')}]`; }
        return p;
    }
    if ((m = spec.match(/^list of (.+)$/))) { p.many = true; if (!SCALARS.has(m[1].trim())) p.ref = m[1].trim(); }
    else if ((m = spec.match(/^ref (.+)$/))) p.ref = m[1].trim();
    else if ((m = spec.match(/^enum\s*\[(.*)\]$/))) p.enum = m[1].split(',').map(x => x.trim()).filter(Boolean);
    return p;
}
// Yaml fences of a file, split into id chunks: [{ id, lines, line }] with the chunk's lines de-indented.
function yamlChunks(lines) {
    const out = []; let inYaml = false, buf = [], start = 0;
    const flush = () => {
        let cur = null; const chunks = [];
        for (const raw of buf) {
            const idm = raw.match(/^\s*-?\s*id:\s*([a-z-]+:[A-Za-z0-9_./#\-]+)/);
            if (idm) { if (cur) chunks.push(cur); cur = { id: cleanId(idm[1]), lines: [raw] }; continue; }
            if (/^---\s*$/.test(raw)) { if (cur) chunks.push(cur); cur = null; continue; }
            if (cur) cur.lines.push(raw);
        }
        if (cur) chunks.push(cur);
        for (const c of chunks) {
            const first = c.lines[0].replace(/^\s*-\s*id:/, 'id:').trim();
            const rest = c.lines.slice(1), nonEmpty = rest.filter(l => l.trim());
            const indent = nonEmpty.length ? Math.min(...nonEmpty.map(l => l.match(/^\s*/)[0].length)) : 0;
            out.push({ id: c.id, body: [first, ...rest.map(l => l.slice(indent))].join('\n').trim(), line: start });
        }
    };
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/^\s*```/.test(l)) {
            if (!inYaml) { inYaml = /^\s*```ya?ml/.test(l); buf = []; start = i + 1; if (!inYaml) { let j = i + 1; while (j < lines.length && !/^\s*```/.test(lines[j])) j++; i = j; } }
            else { inYaml = false; flush(); }
            continue;
        }
        if (inYaml) buf.push(l);
    }
    return out;
}
// The type cards of every file: read once per build; with a cache (lib/build's parse cache), a file whose text did not
// change keeps its chunks. Returns [{ file, md, chunks }] for the files that exist.
function readTypeChunks(files, cache) {
    const out = [];
    for (const file of files) {
        if (!fs.existsSync(file)) continue;
        const md = fs.readFileSync(file, 'utf8');
        const hit = cache && cache.chunks.get(file);
        const chunks = hit && hit.md === md ? hit.chunks : yamlChunks(md.split('\n')).filter(c => c.id.startsWith('type:'));
        if (cache) cache.chunks.set(file, { md, chunks });
        out.push({ file, md, chunks });
    }
    return out;
}
function collectTypes(files, opts = {}) {
    const types = new Map(); const problems = [];
    const cwd = opts.cwd || process.cwd();
    const read = readTypeChunks(files, opts.cache);
    // the type names first, so a property spec `oneOf[manager]` can tell a link from a value
    KNOWN_TYPES = new Set();
    for (const { chunks } of read) for (const c of chunks) KNOWN_TYPES.add(c.id.slice(5));
    for (const { file, chunks } of read) {
        const rel = path.relative(cwd, file);
        for (const c of chunks) {
            if (types.has(c.id)) { problems.push({ level: 'error', msg: `${c.id}: duplicate type (${types.get(c.id).file}:${types.get(c.id).line} and ${rel}:${c.line})` }); continue; }
            const t = { id: c.id, slug: c.id.slice(5), extends: null, open: false, purpose: '', home: '', plural: '', ownProps: [], ownShapes: [], file: rel, line: c.line };
            const bl = c.body.split('\n');
            for (let i = 0; i < bl.length; i++) {
                const l = bl[i]; let m;
                if ((m = l.match(/^extends:\s*(type:[A-Za-z0-9_.-]+)/))) t.extends = m[1];
                else if ((m = l.match(/^open:\s*(true|yes)/))) t.open = true;
                else if ((m = l.match(/^home:\s*(\S+)/))) t.home = m[1];
                else if ((m = l.match(/^plural:\s*(.+?)\s*$/))) t.plural = m[1]; // the title of the type's collection document (decision:ontology.collection-document)
                else if ((m = l.match(/^purpose:\s*(.*)$/))) t.purpose = m[1].replace(/^>\s*/, '').trim() || (bl[i + 1] || '').trim();
                else if (/^props:\s*$/.test(l)) {
                    for (let j = i + 1; j < bl.length && /^\s+\S/.test(bl[j]); j++) {
                        const pm = bl[j].match(/^\s+([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/); if (!pm) continue;
                        t.ownProps.push(Object.assign({ name: pm[1], from: c.id }, parsePropSpec(pm[2])));
                    }
                }
                // shapes (decision:memory.shapes): the checks ctx enforces per type, declared on the type — one per line:
                //   `<status or *> requires <prop>[, <prop>] [| <alternative>] [as error]`   the instance in that status has the
                //       property (a body key or an outgoing edge of that name); commas: all of them, `|`: any of these
                //   `<prop> refs status <s>`   every node the property points at has that status
                else if (/^shapes:\s*$/.test(l)) {
                    for (let j = i + 1; j < bl.length && /^\s+\S/.test(bl[j]); j++) {
                        const line = bl[j].replace(/^\s+-?\s*/, '').replace(/\s+#.*$/, '').trim(); let m;
                        if ((m = line.match(/^(\S+)\s+requires\s+(.+?)(\s+as\s+(error|warning))?$/))) t.ownShapes.push({ from: c.id, status: m[1], all: m[2].split(/\s*,\s*/).map(a => a.split(/\s*\|\s*/)), level: m[4] || 'warning', text: line });
                        else if ((m = line.match(/^(\S+)\s+refs\s+status\s+(\S+)$/))) t.ownShapes.push({ from: c.id, prop: m[1], refStatus: m[2], level: 'warning', text: line });
                        else problems.push({ level: 'warning', msg: `${c.id}: shape not understood: "${line}"` });
                    }
                }
            }
            if (!t.extends && c.id !== 'type:node') t.extends = 'type:node';
            types.set(c.id, t);
        }
    }
    if (!types.has('type:node')) types.set('type:node', { id: 'type:node', slug: 'node', extends: null, open: true, purpose: 'the root type', home: '', plural: '', ownProps: [], ownShapes: [], file: '', line: 0 });
    // resolve chains and effective properties, parent first; a child may only narrow a parent's property
    const isA = (slug, target) => { const t = types.get('type:' + slug); return !!t && t.chain.includes('type:' + target); };
    for (const t of types.values()) {
        const chain = []; let cur = t; const seen = new Set();
        while (cur) {
            if (seen.has(cur.id)) { problems.push({ level: 'error', msg: `${t.id}: extends cycle through ${cur.id}` }); chain.length = 0; chain.push('type:node'); break; }
            seen.add(cur.id); chain.unshift(cur.id);
            if (!cur.extends) break;
            const parent = types.get(cur.extends);
            if (!parent) { problems.push({ level: 'error', msg: `${cur.id}: extends unknown type ${cur.extends}` }); chain.unshift('type:node'); break; }
            cur = parent;
        }
        t.chain = chain.includes(t.id) ? chain : chain.concat(t.id);
    }
    for (const t of types.values()) {
        const acc = new Map();
        for (const tid of t.chain) {
            const tt = types.get(tid); if (!tt) continue;
            for (const p of tt.ownProps) {
                const prev = acc.get(p.name);
                if (prev && prev.from !== p.from) {
                    const narrower = (!prev.required || p.required) && prev.many === p.many && (prev.ref === p.ref || (prev.ref && p.ref && isA(p.ref, prev.ref)) || (!prev.ref && prev.type === p.type));
                    if (!narrower) problems.push({ level: 'error', msg: `${tt.id}: property ${p.name} (${p.type}${p.required ? '' : '?'}) widens ${prev.from}'s ${prev.type}${prev.required ? '' : '?'}` });
                }
                acc.set(p.name, p);
            }
        }
        t.props = [...acc.values()];
        // shapes accumulate along the chain: a child adds checks, it never removes a parent's
        t.shapes = t.chain.flatMap(tid => (types.get(tid) || { ownShapes: [] }).ownShapes);
    }
    // verb → inverse, both ways, from every property that declares one
    const inverses = {};
    for (const t of types.values()) for (const p of t.ownProps) if (p.inverse) {
        if (inverses[p.name] && inverses[p.name] !== p.inverse) problems.push({ level: 'warning', msg: `${t.id}.${p.name}: inverse ${p.inverse} conflicts with ${inverses[p.name]} declared elsewhere` });
        inverses[p.name] = inverses[p.name] || p.inverse; if (!inverses[p.inverse]) inverses[p.inverse] = p.name;
    }
    return { types, problems, inverses };
}

// A parse cache (decision:wf2.parse-cache): `{ chunks: Map, files: Map }` kept by the caller across builds (the app's
// build coordinator, lib/build). A file whose text, ontology and cross-file reads are unchanged replays what it produced
// last time instead of being parsed again; the result is identical to a cold parse. `newParseCache()` makes one.
function newParseCache() { return { chunks: new Map(), files: new Map() }; }
function parseFiles(files, opts = {}) {
    const ontology = collectTypes([BASE_ONTOLOGY, ...files], opts);
    const kinds = [...new Set(KINDS.concat([...ontology.types.values()].map(t => t.slug)))];
    CUR_ID_RE = idRegex(kinds);
    try { return parseWith(files, ontology, kinds, opts); } finally { CUR_ID_RE = ID_RE; }
}
function parseWith(files, ontology, kinds, opts = {}) {
    const { types, problems, inverses } = ontology;
    const cwd = opts.cwd || process.cwd();
    const cache = opts.cache;
    // what the per-file pass depends on besides the file's own text: the kinds and every type's declaration
    const ontologyKey = cache ? require('crypto').createHash('sha1').update(JSON.stringify([kinds, [...types.values()]])).digest('hex') : '';
    const nodes = new Map();
    const edges = [];
    // a ref/list-of property declared on the node's type (or inherited) makes its key an edge named by the property
    const propVerb = (id, key) => { const t = types.get('type:' + id.split(':')[0]); const p = t && t.props.find(p => p.name === key && p.ref); return p ? p.name : ''; };
    const node = (id, props = {}) => {
        if (!nodes.has(id)) nodes.set(id, { id, kind: id.split(':')[0], title: '', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 });
        return Object.assign(nodes.get(id), props);
    };
    const edge = (from, to, verb) => { if (from !== to) edges.push({ from, to, verb }); };
    const modules = [];
    const DEFAULTS = id => ({ id, kind: id.split(':')[0], title: '', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 });
    // replay a file's recorded output onto the shared state
    const apply = ops => { for (const op of ops) { if (op.t === 'n') node(op.id); else if (op.t === 'p') Object.assign(node(op.id), op.props); else if (op.t === 'e') edge(op.from, op.to, op.verb); else if (op.t === 'm') modules.push(op.m); else problems.push(op.p); } };
    const holds = c => c.t === 'def' ? !!(nodes.get(c.id) && nodes.get(c.id).defined) === c.v : c.t === 'has' ? nodes.has(c.id) === c.v : (nodes.has(c.id) ? JSON.stringify(nodes.get(c.id)) : null) === c.v;
    // the per-file pass writes through a local view that records what it produced (ops) and what it read from the
    // other files' state (checks): a node's existence, whether it was defined, its state when this file touched it
    const localView = () => {
        const local = new Map(), written = new Map(), ops = [], checks = [], mods = [], probs = [];
        const seen = new Set();
        const check = c => { const k = c.t + '|' + c.id; if (!seen.has(k)) { seen.add(k); checks.push(c); } };
        const lnode = (id, props = {}) => {
            let n = local.get(id);
            if (!n) {
                const g = nodes.get(id);
                check({ t: 'snap', id, v: g ? JSON.stringify(g) : null });
                const keys = new Set(); written.set(id, keys);
                n = new Proxy(g ? { ...g } : DEFAULTS(id), { set(t, k, v) { t[k] = v; keys.add(k); return true; } });
                local.set(id, n); ops.push({ t: 'n', id });
            }
            return Object.assign(n, props);
        };
        const ledge = (from, to, verb) => { if (from !== to) ops.push({ t: 'e', from, to, verb }); };
        const view = {
            has: id => { if (local.has(id)) return true; const v = nodes.has(id); check({ t: 'has', id, v }); return v; },
            get: id => { if (local.has(id)) return local.get(id); const g = nodes.get(id); check({ t: 'def', id, v: !!(g && g.defined) }); return g; },
        };
        const finish = () => {
            for (const [id, n] of local) { const props = {}; for (const k of written.get(id)) props[k] = n[k]; ops.push({ t: 'p', id, props }); }
            for (const m of mods) ops.push({ t: 'm', m }); for (const p of probs) ops.push({ t: 'pr', p });
            return { ops, checks };
        };
        return { node: lnode, edge: ledge, view, modules: mods, problems: probs, finish };
    };

    const emptyLines = [];   // id-only lines, defined after every file when nothing else defines them
    for (const file of files) {
        const md = fs.readFileSync(file, 'utf8');
        const rel = path.relative(cwd, file);
        const hit = cache && cache.files.get(file);
        if (hit && hit.md === md && hit.ontology === ontologyKey && hit.checks.every(holds)) { apply(hit.ops); continue; }
        const L = localView();
        const node = L.node, edge = L.edge, nodes = L.view, modules = L.modules, problems = L.problems;
        const lines = md.split('\n');
        const fm = md.match(/^---\n([\s\S]*?)\n---/);
        // the document's node: any kind:slug whose kind is a declared type (rule:page-node-line); module is the default
        // kind a template writes, nothing more. An unknown kind is an error and the page is not in the graph.
        const nodeLine = fm && (fm[1].match(/^node:\s*([a-z-]+:[^\s]+)/m) || [])[1];
        const nodeKind = nodeLine && nodeLine.split(':')[0];
        if (nodeLine && !types.has('type:' + nodeKind)) problems.push({ level: 'error', msg: `${rel}: node ${nodeLine} — ${nodeKind} is not a declared type` });
        const moduleId = nodeLine && types.has('type:' + nodeKind) ? cleanId(nodeLine) : null;
        if (moduleId) {
            const title = (fm[1].match(/^title:\s*(.+)$/m) || [])[1] || moduleId.slice(moduleId.indexOf(':') + 1);
            const rootsM = fm[1].match(/^source-roots:\s*\[([^\]]*)\]/m);
            const sourceRoots = rootsM ? rootsM[1].split(',').map(x => x.trim()).filter(Boolean) : ['.'];
            modules.push({ id: moduleId, title, file: rel, verified: (fm[1].match(/^last-verified:\s*(\S+)/m) || [])[1] || '', sourceRoots });
            node(moduleId, { defined: true, title, file: rel, line: 1, body: fm[1].trim(), status: (fm[1].match(/^status:\s*(\S+)/m) || [])[1] || '' });
            // frontmatter keys that name relations (part-of, see, …) or ref/list properties of the page's type are edges from the page node
            for (const fl of fm[1].split('\n')) { const km = fl.match(/^([a-z-]+):\s*(.+)$/); if (!km) continue; const verb = EDGE_KEYS[km[1]] || propVerb(moduleId, km[1]); if (verb) for (const t of idsIn(km[2])) edge(moduleId, t, verb); }
        }

        let section = '', subsection = '', inYaml = false, yamlBuf = [], yamlStart = 0;
        const named = new Map();      // 1-based line → id of the prose node defined there (a named node is its own block)
        const cards = new Map();      // 1-based line of a yaml fence → ids of the cards inside (the fence's blocks)

        const flushYaml = (startLine) => {
            const chunks = []; let cur = null;
            for (const raw of yamlBuf) {
                const idm = raw.match(/^\s*-?\s*id:\s*([a-z-]+:[A-Za-z0-9_./#\-]+)/);
                if (idm) { if (cur) chunks.push(cur); cur = { id: cleanId(idm[1]), lines: [raw] }; continue; }
                if (/^---\s*$/.test(raw)) { if (cur) chunks.push(cur); cur = null; continue; }
                if (cur) cur.lines.push(raw);
            }
            if (cur) chunks.push(cur);
            for (const c of chunks) {
                const first = c.lines[0].replace(/^\s*-\s*id:/, 'id:').trim();
                const rest = c.lines.slice(1), nonEmpty = rest.filter(l => l.trim());
                const indent = nonEmpty.length ? Math.min(...nonEmpty.map(l => l.match(/^\s*/)[0].length)) : 0;
                const body = [first, ...rest.map(l => l.slice(indent))].join('\n').trim();
                const n = node(c.id, { defined: true, body, section, subsection, file: rel, line: startLine });
                if (!cards.has(startLine)) cards.set(startLine, []); cards.get(startLine).push(c.id);
                // a key's value; a `>` / `|` block scalar is its indented lines joined (a title written over two lines)
                const get = (k) => { const m = body.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')); if (!m) return ''; let v = m[1].trim(); if (/^[>|]-?$/.test(v)) { v = ''; const rest = body.slice(m.index + m[0].length).split('\n').slice(1); for (const l of rest) { if (!/^\s+\S/.test(l)) break; v += (v ? ' ' : '') + l.trim(); } } return v.replace(/^["']|["']$/g, ''); };
                n.title = get('title') || n.title;
                n.status = get('status').split(/\s+#/)[0].trim() || n.status;
                if (!n.title) n.title = (get('statement') || get('description') || get('purpose') || get('when') || '').replace(/^>\s*/, '').slice(0, 110);
                let key = '';
                for (const l of body.split('\n')) {
                    const km = l.match(/^([a-zA-Z][a-zA-Z0-9 ()|-]*?):(\s|$)/);
                    const explicit = l.match(/([a-z-]+:[A-Za-z0-9_./#\-]+)\s+-\(([a-z-]+)\)->\s+([a-z-]+:[A-Za-z0-9_./#\-]+)/);
                    if (explicit) { edge(cleanId(explicit[1]), cleanId(explicit[3]), explicit[2]); continue; }
                    if (km) key = km[1].trim().toLowerCase();
                    if (key === 'id') continue;
                    const am = l.match(/^\s*-\s+(action:[A-Za-z0-9_./\-]+):?\s*(.*)$/);
                    if (am && (key.startsWith('actions') || key === 'always' || key === 'sections')) {
                        const aid = cleanId(am[1]);
                        const desc = am[2].replace(/-\([a-z-]+\)->\s*[a-z-]+:[A-Za-z0-9_./#\-|]+/g, '').replace(/\s{2,}/g, ' ').trim();
                        node(aid, { defined: true, title: desc.slice(0, 110), body: `on: ${c.id}\ndoes: ${desc}`, section, subsection, file: rel, line: startLine });
                        edge(c.id, aid, 'has-action');
                        let em; const er = /-\(([a-z-]+)\)->\s*([a-z-]+:[A-Za-z0-9_./#\-|]+)/g;
                        while ((em = er.exec(am[2]))) for (const t of cleanId(em[2]).split('|')) edge(aid, t.includes(':') ? t : cleanId(em[2]).split(':')[0] + ':' + t, em[1]);
                        for (const t of idsIn(desc)) if (t !== aid) edge(aid, t, 'mentions');
                        continue;
                    }
                    const verb = EDGE_KEYS[key] || propVerb(c.id, key) || (key.startsWith('actions') ? 'has-action' : 'mentions');
                    for (const t of idsIn(l.replace(/^\s*id:.*$/, ''))) {
                        if (t === c.id) continue;
                        if (key.startsWith('actions')) {
                            if (t.startsWith('action:')) edge(c.id, t, 'has-action');
                            else edge(c.id, t, /^op:/.test(t) ? 'calls' : /^page:/.test(t) ? 'navigates' : 'mentions');
                        } else edge(c.id, t, verb);
                    }
                }
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (/^\s*```/.test(l)) {
                if (!inYaml) {
                    inYaml = /^\s*```ya?ml/.test(l); yamlBuf = []; yamlStart = i + 1;   // indented: a card inside a node's content
                    if (!inYaml) { let j = i + 1; while (j < lines.length && !/^\s*```/.test(lines[j])) j++; i = j; }
                } else { inYaml = false; flushYaml(yamlStart); }
                continue;
            }
            if (inYaml) { yamlBuf.push(l); continue; }
            const h2 = l.match(/^## (.+)/); if (h2) { section = h2[1].trim(); subsection = ''; }
            const h3 = l.match(/^### (.+)/); if (h3) { subsection = h3[1].trim(); for (const t of idsIn(h3[1])) node(t, { file: rel, line: i + 1 }); }
            if (/^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*(op|id|test node|enum|#|edge|policy|option|your req|test|tool)\s*\|/i.test(l)) {
                const cells = l.split('|').slice(1, -1).map(c => c.trim());
                if (/drift|contradiction/i.test(section)) {
                    const num = cells[0]; if (!/^\d+$/.test(num)) continue;
                    const id = 'drift:' + (moduleId ? moduleId.slice(7) + '.' : '') + num;
                    node(id, { defined: true, section, title: (cells[3] || '').slice(0, 110), body: `a: ${cells[1]}\nb: ${cells[2]}\nwhat: ${cells[3]}\nwhere: ${cells[4] || ''}`, file: rel, line: i + 1, status: 'drift' });
                    for (const t of idsIn(cells[1] + ' ' + cells[2])) edge(id, t, 'contradicts');
                    continue;
                }
                const first = idsIn(cells[0]);
                if (!first.length) continue;
                const isEnum = cells.length === 3 && first[0].startsWith('value:');
                const isTestTable = first[0].startsWith('test:') && cells.length === 3;
                const isOpTable = first[0].startsWith('op:') || first[0].startsWith('tool:');
                for (const id of first) {
                    const n = node(id, { defined: true, section, subsection, file: rel, line: i + 1 });
                    if (isEnum) { n.title = 'enum'; n.body = `source: ${cells[1]}\nvalues: ${cells[2]}`; }
                    else if (isTestTable) { n.title = cells[1]; n.body = `file: ${cells[1]}\ncount: ${cells[2]}`; }
                    else if (isOpTable && cells.length >= 4) {
                        n.title = (cells[2] || cells[1]).replace(/\*\*/g, '').slice(0, 110);
                        n.body = cells.length === 5 ? `args: ${cells[1]}\ndoes: ${cells[2]}\ngate: ${cells[3]}\nsource: ${cells[4]}` : `does: ${cells[1]}\ngate: ${cells[2]}\nsource: ${cells[3]}`;
                        const gate = cells.length === 5 ? cells[3] : cells[2];
                        for (const t of idsIn(cells.slice(1).join(' '))) edge(id, t, t.startsWith('gate:') ? 'gated-by' : 'mentions');
                        // permission shorthand used by the inventory pilot: "View, F" / "Manage, –"
                        const perm = { View: 'gate:permission-view-inventory', Manage: 'gate:permission-manage-inventory', Record: 'gate:permission-record-inventory-ops' };
                        for (const [k, g] of Object.entries(perm)) if (new RegExp('\\b' + k + '\\b').test(gate) && nodes.has(g)) edge(id, g, 'gated-by');
                        if (/,\s*F\b/.test(gate) && nodes.has('gate:feature-' + (moduleId || '').slice(7))) edge(id, 'gate:feature-' + moduleId.slice(7), 'gated-by');
                    } else { n.title = n.title || (cells[1] || '').slice(0, 110); n.body = n.body || cells.slice(1).join(' | '); }
                }
            }
            const em = l.match(/^\s*-\s+([a-z-]+:[A-Za-z0-9_./#\-]+)\s+-\(([a-z-]+)\)->\s+([a-z-]+:[A-Za-z0-9_./#\-]+)/);
            if (em) { edge(cleanId(em[1]), cleanId(em[3]), em[2]); continue; }
            // Prose node: a paragraph or list item whose first token is an id. "req:sale.close When a sale …" defines
            // req:sale.close with that text; links and ids in the text become edges (rule:prose-nodes).
            // an id alone on its line — a block just added in the editor, nothing typed yet — is a node with empty
            // text too, so the column can open it the moment it exists (rule:prose-nodes, req:wf2.ui.new-block-opens)
            const pm = l.match(new RegExp('^(\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[( |x|X)\\]\\s+)?|\\s*)(' + CUR_ID_RE.source.replace(/\\b/, '') + ')(?:(?=\\s)\\s+(\\S.*)|\\s*)$'));
            const checkbox = pm && pm[2] !== undefined ? (pm[2].trim() ? 'done' : 'open') : '';
            const paraStart = !(lines[i - 1] || '').trim() || /^\s*([-*+]|\d+[.)])\s/.test(l);
            if (pm && paraStart && !/^\s*\|/.test(l) && !/^#/.test(l) && !/-\(/.test(l)) {
                const id = cleanId(pm[3]); let text = pm[pm.length - 1] ?? '';
                // an id alone on its line: a block just added in the editor with nothing typed yet — or a bare
                // reference to a node defined elsewhere. Kept aside and made a node only if no other line defines
                // it, once every file is read (req:wf2.ui.new-block-opens); a card or a line with text always wins
                if (pm[pm.length - 1] === undefined) { if (!nodes.get(id) || !nodes.get(id).defined) emptyLines.push({ id, checkbox, section, subsection, rel, line: i + 1 }); continue; }
                let j = i + 1;
                // continuation lines join the text; a fence, heading, table, list item, rule or html comment ends it
                while (j < lines.length && lines[j].trim() && !/^(```|#|\||\s*([-*+]|\d+[.)])\s|---\s*$|\s*<!--)/.test(lines[j])) { text += ' ' + lines[j].trim(); j++; }
                if (nodes.get(id) && nodes.get(id).defined && !named.has(i + 1)) named.set(i + 1, id);
                if (!nodes.get(id) || !nodes.get(id).defined) {
                    // trailing (key: value, key: [id, id]) props: a comma inside [] separates list items, never keys —
                    // an id like rule:x looks like a key otherwise
                    let status = checkbox, ready = false; const extra = [];
                    const g = text.match(/\s*\(([A-Za-z][A-Za-z0-9_-]*:\s*[^()]*?(?:,\s*[A-Za-z][A-Za-z0-9_-]*:\s*[^()]*?)*)\)\s*$/);
                    if (g) text = text.slice(0, g.index).trim();
                    // the status (#open, #done …) and #ready are the tags at the END of the text, in any order — a
                    // hashtag inside a sentence is text (the editor writes them at the end, so this is where they live)
                    for (let m; (m = text.match(TRAILING_TAG)); ) { if (m[1] === 'ready') ready = true; else status = m[1]; text = text.slice(0, m.index).trim(); }
                    if (ready) extra.push('ready: true');
                    if (g) { for (const kv of g[1].split(/,\s*(?![^[\]]*\])(?=[A-Za-z][A-Za-z0-9_-]*:)/)) { const [k, ...v] = kv.split(':'); extra.push(k.trim() + ': ' + v.join(':').trim()); } }
                    const plain = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s{2,}/g, ' ').trim();
                    const title = (plain.match(/^(.+?[.;:!?])(\s|$)/) || [null, plain])[1].slice(0, 110);
                    const body = ['id: ' + id, 'text: ' + text].concat(status ? ['status: ' + status] : []).concat(extra).join('\n');
                    node(id, { defined: true, title, status, body, section, subsection, file: rel, line: i + 1, form: 'prose' });
                    named.set(i + 1, id);
                    for (const r of proseRefs(text)) if (r.id !== id) edge(id, r.id, r.verb);
                    for (const ex of extra) { const key = ex.split(':')[0]; const verb = EDGE_KEYS[key] || propVerb(id, key); if (verb) for (const t of idsIn(ex)) edge(id, t, verb); }
                }
                i = j - 1; continue;
            }
        }

        // ---- every block is a node (decision:ontology.blocks-last-phase). Mirrors the web's hashableBlocks: blank
        // lines separate paragraphs, each list item is a block of its own, a fence or table is one block. The document
        // has its headings, a heading has the blocks under it, a list item has its nested items; a prose node or a
        // yaml card is its own block. A link on a phrase in plain prose is the block's edge.
        const docSlug = moduleId ? moduleId.slice(moduleId.indexOf(":") + 1) : path.basename(file, '.md');
        const docId = moduleId || 'module:' + docSlug;
        if (moduleId) {
            const bodyStart = fm ? fm[0].split('\n').length : 0;
            const headings = [{ level: 0, id: docId }];
            const parentOf = () => headings[headings.length - 1].id;
            const blockNode = (text, line, parent) => {
                if (/^\s*<!--[\s\S]*-->\s*$/.test(text) || !normalizeText(text)) return null;   // comments and rules are not blocks
                const id = `block:${docSlug}.${blockHash(text)}`;
                const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
                node(id, { defined: true, title: plain.slice(0, 110), body: 'text: ' + text.split('\n').join('\n  '), section, subsection, file: rel, line, form: 'block' });
                edge(parent, id, 'has');
                if (!/^\s*(```|~~~)/.test(text)) { let lm; const lre = /\[([^\]]+)\]\(([a-z-]+:[A-Za-z0-9_./#\-]+)\)/g; while ((lm = lre.exec(text))) edge(id, cleanId(lm[2]), 'related-to'); }
                return id;
            };
            // Content (req:ontology.content, decision:ontology.content-markdown): the blocks indented under a node's
            // defining line — a list item, a named paragraph, a yaml card's closing fence — are its content, at any
            // depth. `open` is the stack of such containers; a block belongs to the deepest one shallower than it.
            let para = [], start = 0, fence = false, fenceStart = 0, fenceIndent = 0;
            const open = [];   // [{indent, id}] — list items, named paragraphs and cards that can take content
            const indentOf = (l) => l.match(/^\s*/)[0].length;
            const parentFor = (indent) => { while (open.length && open[open.length - 1].indent >= indent) open.pop(); return open.length ? open[open.length - 1].id : parentOf(); };
            section = ''; subsection = '';
            const flush = () => {
                if (!para.length) return;
                const indent = indentOf(para[0]);
                const text = para.map(l => l.slice(Math.min(indent, indentOf(l)))).join('\n');   // content is written de-indented
                const allItems = para.every(l => /^\s*(?:[-*+]|\d+[.)])\s/.test(l));
                if (/^\s*(```|~~~)/.test(para[0])) {
                    const ids = cards.get(fenceStart) || [];
                    const parent = parentFor(fenceIndent);
                    if (ids.length) { for (const c of ids) edge(parent, c, 'has'); open.push({ indent: fenceIndent, id: ids[ids.length - 1] }); }
                    else blockNode(text, start, parent);
                } else if (!allItems) {
                    const parent = parentFor(indent);
                    if (named.has(start)) { edge(parent, named.get(start), 'has'); open.push({ indent, id: named.get(start) }); }
                    else blockNode(text, start, parent);
                }
                para = [];
            };
            for (let i = bodyStart; i < lines.length; i++) {
                const l = lines[i];
                if (/^\s*(```|~~~)/.test(l)) { if (!fence) { flush(); fenceStart = i + 1; fenceIndent = indentOf(l); fence = true; } else { para.push(l); fence = false; flush(); continue; } }   // a fence is one block, flushed at its close
                if (!fence && /^\s*<!--[\s\S]*?-->\s*$/.test(l)) { flush(); continue; }   // a marker comment (<!-- table:bug -->) is no block and joins no paragraph: the row after it keeps its content
                if (!l.trim()) { if (!fence) { flush(); continue; } }
                if (!para.length) start = i + 1;
                para.push(l);
                if (fence) continue;
                const hm = l.match(/^(#{1,6})\s+(.*)$/);
                if (hm && para.length === 1) {
                    const level = hm[1].length; if (level === 2) { section = hm[2].trim(); subsection = ''; } if (level === 3) subsection = hm[2].trim();
                    while (headings.length > 1 && headings[headings.length - 1].level >= level) headings.pop();
                    open.length = 0;
                    const id = blockNode(l, i + 1, parentOf()); if (id) headings.push({ level, id });
                    para = []; continue;
                }
                const im = l.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
                if (im) {
                    const indent = im[1].length;
                    const parent = parentFor(indent);
                    let id;
                    if (named.has(i + 1)) { id = named.get(i + 1); edge(parent, id, 'has'); } else id = blockNode(im[2], i + 1, parent);
                    if (id) open.push({ indent, id });
                }
            }
            flush();
        }
        const rec = L.finish();
        if (cache) cache.files.set(file, { md, ontology: ontologyKey, ops: rec.ops, checks: rec.checks });
        apply(rec.ops);
    }

    for (const e of emptyLines) {
        if (nodes.get(e.id) && nodes.get(e.id).defined) continue;
        const status = e.checkbox;
        node(e.id, { defined: true, title: '', status, body: ['id: ' + e.id, 'text: '].concat(status ? ['status: ' + status] : []).join('\n'), section: e.section, subsection: e.subsection, file: e.rel, line: e.line, form: 'prose' });
    }
    // ---- fields
    const fieldOwners = new Map();
    const defineField = (ownerId, name, type, note) => {
        name = name.replace(/[?*]/g, '').trim();
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) return;
        const owner = nodes.get(ownerId);
        const fid = 'field:' + ownerId.split(':').slice(1).join(':') + '.' + name;
        node(fid, { defined: true, title: name, body: `on: ${ownerId}\nname: ${name}` + (type ? `\ntype: ${type.trim()}` : '') + (note ? `\nnote: ${note.trim()}` : ''), section: owner.section, subsection: ownerId, file: owner.file, line: owner.line, owner: ownerId });
        edge(ownerId, fid, 'has');
        for (const t of idsIn((type || '') + ' ' + (note || ''))) if (t !== ownerId) edge(fid, t, /^(entity|value|flag|state):/.test(t) ? 'typed-as' : 'mentions');
        const key = name.toLowerCase();
        if (!fieldOwners.has(key)) fieldOwners.set(key, { name, fids: [] });
        fieldOwners.get(key).fids.push(fid);
    };
    for (const n of [...nodes.values()].filter(n => /^(entity|value):/.test(n.id) && n.body)) {
        const bl = n.body.split('\n');
        for (let i = 0; i < bl.length; i++) {
            const hm = bl[i].match(/^(fields|computed[^:]*|shape)\s*:\s*(.*)$/);
            if (!hm) continue;
            const inline = hm[2].replace(/^\{|\}$/g, '').trim();
            if (inline && !inline.startsWith('#')) { for (const part of inline.split(/,\s*(?![^()]*\))/)) { const [nm, ty] = part.split(':'); if (nm) defineField(n.id, nm.replace(/\s*=.*$/, ''), ty, ''); } continue; }
            for (let j = i + 1; j < bl.length; j++) {
                const l = bl[j]; if (!/^\s+\S/.test(l)) break;
                const [main, note] = l.split(/\s+#\s*/);
                const fm2 = main.match(/^\s+([^:]+?):\s*(.*)$/);
                if (!fm2) { const bare = main.trim(); if (/^[A-Za-z][A-Za-z0-9?, /]*$/.test(bare)) for (const nm of bare.split(/[,/]/)) defineField(n.id, nm.replace(/\s*=.*$/, ''), '', note); continue; }
                for (const nm of fm2[1].split(/[,/]/)) defineField(n.id, nm.replace(/\s*=.*$/, ''), fm2[2], note);
            }
        }
    }
    // a body that names a field (word-bounded, lower or capitalised) mentions it: one regex over every field name, run
    // once per body, instead of one per field per node
    const fieldList = [...fieldOwners].filter(([key]) => key.length >= 5 && !STOP.has(key));
    const fieldRe = fieldList.length ? new RegExp('\\b(' + fieldList.map(([, { name }]) => name + '|' + name[0].toUpperCase() + name.slice(1)).join('|') + ')\\b', 'g') : null;
    if (fieldRe) for (const n of [...nodes.values()]) {
        if (!n.body || n.id.startsWith('field:')) continue;
        const found = new Set(); for (const m of n.body.matchAll(fieldRe)) found.add(m[1].toLowerCase());
        if (!found.size) continue;
        let refs = null;
        for (const [key, { fids }] of fieldList) {
            if (!found.has(key)) continue;
            const targets = fids.length === 1 ? fids : fids.filter(f => (refs ??= new Set(idsIn(n.body))).has(nodes.get(f).owner));
            for (const f of targets) if (nodes.get(f).owner !== n.id) edge(n.id, f, 'mentions');
        }
    }
    // ---- ontology: base types are nodes too (the product's own type: cards were parsed above), every declared
    // property is a prop:<type>.<name> node the type has, and every edge whose verb has an inverse gets its reverse
    // edge, marked generated so writers never serialise it (decision:ontology.inverses-generated).
    for (const t of types.values()) {
        if (!nodes.has(t.id) || !nodes.get(t.id).defined) {
            if (!t.file) continue;
            node(t.id, { defined: true, title: t.slug, status: '', body: `id: ${t.id}\n${t.extends ? 'extends: ' + t.extends + '\n' : ''}purpose: ${t.purpose}`, file: t.file, line: t.line });
            if (t.extends) edge(t.id, t.extends, 'extends');
        }
        for (const p of t.ownProps) {
            const pid = `prop:${t.slug}.${p.name}`;
            node(pid, { defined: true, title: p.name, body: `on: ${t.id}\nname: ${p.name}\ntype: ${p.type}${p.required ? '' : '?'}` + (p.inverse ? `\ninverse: ${p.inverse}` : ''), file: t.file, line: t.line, owner: t.id });
            edge(t.id, pid, 'has');
        }
    }
    for (const e of edges) { node(e.from); node(e.to); }
    const seen = new Set();
    const uniq = edges.filter(e => { const k = e.from + '|' + e.verb + '|' + e.to; if (seen.has(k)) return false; seen.add(k); return true; });
    // ---- valid time (decision:memory.bitemporal): `since` / `until` / `by` from the body; a node named in another's
    // `supersedes:` gets `supersededBy` and, when it has no `until` of its own, the successor's date — generated at
    // build time, never written back.
    const bodyProp = (n, key) => { const m = (n.body || '').match(new RegExp('^' + key + ':\\s*(.+)$', 'm')); return m ? m[1].trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '') : ''; };
    for (const n of nodes.values()) { if (!n.body) continue; const since = bodyProp(n, 'since'), until = bodyProp(n, 'until'), by = bodyProp(n, 'by'); if (since) n.since = since; if (until) n.until = until; if (by) n.by = by; }
    // ---- forgetting (decision:memory.forgetting): a request document that ended (status done / failed / cancelled, or
    // every task in it done) is archived for retrieval — its page, tasks and blocks leave search and the packet unless
    // asked; the knowledge blocks it holds (decisions, constraints, lessons, rules, requirements, questions) do not.
    // A computed state, never written; nothing moves on disk.
    const KNOWLEDGE = new Set(['decision', 'constraint', 'lesson', 'rule', 'req', 'question', 'goal', 'entity', 'contradiction', 'type']);
    for (const m of modules) {
        const page = nodes.get(m.id); if (!page || page.kind !== 'pr') continue;
        const tasks = [...nodes.values()].filter(n => n.kind === 'task' && n.defined && n.file === m.file);
        const ended = ['done', 'failed', 'cancelled', 'complete'].includes(page.status) || (tasks.length > 0 && tasks.every(t => t.status === 'done'));
        if (!ended) continue;
        for (const n of nodes.values()) if (n.file === m.file && n.defined && !KNOWLEDGE.has(n.kind)) n.archived = true;
    }
    for (const e of uniq) {
        if (e.verb !== 'supersedes') continue;
        const old = nodes.get(e.to), by = nodes.get(e.from);
        if (!old || old === by) continue;
        old.supersededBy = e.from;
        if (!old.until) { const at = by.since || bodyProp(by, 'date'); if (at) old.until = at; }
    }
    for (const e of [...uniq]) {
        const inv = inverses[e.verb]; if (!inv) continue;
        const k = e.to + '|' + inv + '|' + e.from; if (seen.has(k)) continue; seen.add(k);
        uniq.push({ from: e.to, to: e.from, verb: inv, generated: true });
    }
    for (const n of nodes.values()) if (!n.title) n.title = n.id.split(':').slice(1).join(':');
    const fieldIndex = {};
    for (const [k, { fids }] of fieldOwners) if (k.length >= 5 && !STOP.has(k) && fids.length === 1) fieldIndex[nodes.get(fids[0]).title] = fids[0];
    const typeList = [...types.values()].map(t => ({ id: t.id, slug: t.slug, extends: t.extends, chain: t.chain, open: t.open, purpose: t.purpose, home: t.home, plural: t.plural || '', props: t.props, shapes: t.shapes, file: t.file, line: t.line }));
    return { generatedAt: new Date().toISOString(), modules, files: files.map(f => path.relative(cwd, f)), nodes: [...nodes.values()], edges: uniq, fieldIndex, kinds, types: typeList, inverses, problems };
}

module.exports = { parseFiles, newParseCache, KINDS, ID_RE, STRUCTURAL, ALIASES, VERB_PHRASES, cleanId, idsIn, inferVerb, proseRefs, parsePropSpec, idRegex, BASE_ONTOLOGY, blockHash, normalizeText };
