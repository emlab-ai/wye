'use strict';
// Parses one or more context-graph markdown files into { nodes, edges, fieldIndex }.
// Node = any `id: kind:slug` inside a ```yaml block, any `### kind:slug` heading, any table row whose
// first cell is an id (ops, enums, tests), and any row of the "Drift" table. Edges come from typed keys
// (satisfied-by, verified-by, refines, governed-by, ...), explicit `a -(verb)-> b` lines, and mentions.
const fs = require('fs');
const path = require('path');

const KINDS = ['req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'action', 'gate', 'flag', 'test', 'ui-test', 'module', 'tool', 'setting', 'field', 'drift', 'question', 'decision'];
const ID_RE = new RegExp('\\b(' + KINDS.join('|') + '):([A-Za-z0-9_][A-Za-z0-9_./#\\-]*)', 'g');
const EDGE_KEYS = {
    'refines': 'refines', 'satisfied-by': 'satisfied-by', 'verified-by': 'verified-by', 'governed-by': 'governed-by',
    'gated-by': 'gated-by', 'reads': 'reads', 'writes': 'writes', 'calls': 'calls', 'contradicts': 'contradicts',
    'owner': 'owned-by', 'owns': 'owns', 'embedded-in': 'embedded-in', 'set-by': 'set-by', 'applies-to': 'applies-to',
    'governs': 'governs', 'see': 'see', 'resolves': 'resolves', 'submodules': 'has', 'depends-on': 'depends-on',
    'adds': 'adds', 'changes': 'changes', 'requires-tests': 'verified-by', 'roles': 'mentions',
};
const STRUCTURAL = new Set(['refines', 'satisfied-by', 'verified-by', 'governed-by', 'gated-by', 'has', 'refs', 'owns', 'calls', 'has-action', 'reads', 'writes', 'navigates', 'triggers', 'set-by', 'embedded-in', 'typed-as', 'contradicts', 'owned-by', 'applies-to', 'governs', 'edge-to', 'resolves', 'depends-on', 'adds', 'changes']);
const STOP = new Set(['name', 'notes', 'status', 'comment', 'lines', 'email', 'phone', 'street', 'city', 'country', 'aliases', 'instructions', 'code', 'symbol', 'quantity', 'fields', 'values', 'computed']);

function cleanId(tok) {
    let t = tok.replace(/[.,;:)\]]+$/, '');
    if (t.includes('|')) t = t.split('|')[0];
    if (/^(test|ui-test):/.test(t)) t = t.replace(/#.*$/, '');
    if (t.startsWith('setting:')) t = 'flag:' + t.slice(8);
    return t;
}
function idsIn(text) {
    const out = []; let m; ID_RE.lastIndex = 0;
    while ((m = ID_RE.exec(text))) out.push(cleanId(m[0]));
    return out;
}

function parseFiles(files) {
    const nodes = new Map();
    const edges = [];
    const node = (id, props = {}) => {
        if (!nodes.has(id)) nodes.set(id, { id, kind: id.split(':')[0], title: '', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 });
        return Object.assign(nodes.get(id), props);
    };
    const edge = (from, to, verb) => { if (from !== to) edges.push({ from, to, verb }); };
    const modules = [];

    for (const file of files) {
        const md = fs.readFileSync(file, 'utf8');
        const lines = md.split('\n');
        const rel = path.relative(process.cwd(), file);
        const fm = md.match(/^---\n([\s\S]*?)\n---/);
        const moduleId = fm && (fm[1].match(/^node:\s*(module:[^\s]+)/m) || [])[1];
        if (moduleId) {
            const title = (fm[1].match(/^title:\s*(.+)$/m) || [])[1] || moduleId.slice(7);
            const rootsM = fm[1].match(/^source-roots:\s*\[([^\]]*)\]/m);
            const sourceRoots = rootsM ? rootsM[1].split(',').map(x => x.trim()).filter(Boolean) : ['.'];
            modules.push({ id: moduleId, title, file: rel, verified: (fm[1].match(/^last-verified:\s*(\S+)/m) || [])[1] || '', sourceRoots });
            node(moduleId, { defined: true, title, file: rel, line: 1, body: fm[1].trim(), status: (fm[1].match(/^status:\s*(\S+)/m) || [])[1] || '' });
        }

        let section = '', subsection = '', inYaml = false, yamlBuf = [], yamlStart = 0;

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
                const get = (k) => { const m = body.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
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
                    const verb = EDGE_KEYS[key] || (key.startsWith('actions') ? 'has-action' : 'mentions');
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
            if (/^```/.test(l)) {
                if (!inYaml) {
                    inYaml = /^```ya?ml/.test(l); yamlBuf = []; yamlStart = i + 1;
                    if (!inYaml) { let j = i + 1; while (j < lines.length && !/^```/.test(lines[j])) j++; i = j; }
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
            if (em) edge(cleanId(em[1]), cleanId(em[3]), em[2]);
        }
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
    for (const n of [...nodes.values()]) {
        if (!n.body || n.id.startsWith('field:')) continue;
        const refs = new Set(idsIn(n.body));
        for (const [key, { name, fids }] of fieldOwners) {
            if (key.length < 5 || STOP.has(key)) continue;
            const re = new RegExp('\\b' + name + '\\b|\\b' + name[0].toUpperCase() + name.slice(1) + '\\b');
            if (!re.test(n.body)) continue;
            const targets = fids.length === 1 ? fids : fids.filter(f => refs.has(nodes.get(f).owner));
            for (const f of targets) if (nodes.get(f).owner !== n.id) edge(n.id, f, 'mentions');
        }
    }
    for (const e of edges) { node(e.from); node(e.to); }
    const seen = new Set();
    const uniq = edges.filter(e => { const k = e.from + '|' + e.verb + '|' + e.to; if (seen.has(k)) return false; seen.add(k); return true; });
    for (const n of nodes.values()) if (!n.title) n.title = n.id.split(':').slice(1).join(':');
    const fieldIndex = {};
    for (const [k, { fids }] of fieldOwners) if (k.length >= 5 && !STOP.has(k) && fids.length === 1) fieldIndex[nodes.get(fids[0]).title] = fids[0];
    return { generatedAt: new Date().toISOString(), modules, files: files.map(f => path.relative(process.cwd(), f)), nodes: [...nodes.values()], edges: uniq, fieldIndex };
}

module.exports = { parseFiles, KINDS, ID_RE, STRUCTURAL, cleanId, idsIn };
