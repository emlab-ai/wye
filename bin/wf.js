#!/usr/bin/env node
'use strict';
// wf — the agent's door into Waterfall. Talks to the running web app (WF_URL, default http://localhost:3456).
//
//   wf resolve <link|id>                 what a link points at: document, node, block or section (text included)
//   wf doc <product/project/doc>         a document's markdown body
//   wf doc write <product/project/doc> [--file f]   replace the body (stdin or --file), checked against the current hash
//   wf doc create <product/project/slug> --title "…" [--template blank] [--parent doc] [--type module]   a new document in a project (a page of that type)
//   wf doc retype <product/project/doc> --type <slug>   the page becomes an instance of that type; every link to it follows
//   wf node <id> [--product p]           a node with its relations
//   wf node set <id> --product p [--status s] [--text t] [--set key=value ...] [--unset key ...]
//   wf context "<text>" --product p      knowledge closest to a text (local semantic search)
//   wf type add <slug> --product p [--extends parent] [--purpose "…"] [--doc product/project/doc]   a proposed type card
//   wf inbox add --product p --title "…" [--ref id ...] (body on stdin)   a raw note (pasted material) for later filing;
//        decisions, questions, requirements and rules are blocks in the documents, not inbox items
//   wf inbox list --product p [--all]    what is waiting for review
//   wf session list --product p [--all]  sessions (active first); runners online
//   wf session show <id> --product p     one session with its log (--full for everything)
//   wf session changes <id>              every block the session added / changed / removed, per document (--json)
//   wf session create --product p --agent a "<instruction>" [--ref id ...] [--link url]
//   wf session log <id> --product p "<line>" | (stdin)   append to the log
//   wf session done|fail <id> --product p ["result"]     finish a session
//   wf session handoff <id> --product p --agent a ["note"]  continue it under another agent
//   wf session open <id> --product p <product/project/doc[#node] | url>   navigate the person's browser to a page
//   wf session take <id> --product p       mark it running under you (interactive pick-up, e.g. /wf-restore)
//   wf agent listen --product p --agent claude-code|codex [--cmd "<command>"] [--name n] [--once]
//        pick up queued sessions for that agent, run the command with the prompt on stdin, stream output to the log
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const WF_URL = (process.env.WF_URL || 'http://localhost:3456').replace(/\/$/, '');
const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { (flags[k] === undefined ? (flags[k] = v) : (flags[k] = [].concat(flags[k], v))); i++; } }
  else pos.push(a);
}
const list = v => v === undefined ? [] : [].concat(v);
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const product = () => flags.product || process.env.WF_PRODUCT || die('--product <slug> (or WF_PRODUCT) is required');

async function api(method, p, body) {
  const headers = { ...(body ? { 'content-type': 'application/json' } : {}), ...(process.env.WF_SESSION ? { 'x-wf-session': process.env.WF_SESSION } : {}) };
  const r = await fetch(WF_URL + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${j.message || j.error || text.slice(0, 200)}`);
  return j;
}
// stdin as text: nothing when it is a terminal, and never wait forever when nothing is piped (agents run in shells
// whose stdin is open but silent) — the first byte must arrive within a second.
const readStdin = () => new Promise(res => {
  if (process.stdin.isTTY) return res('');
  let s = ''; let started = false;
  const timer = setTimeout(() => { if (!started) { process.stdin.pause(); res(''); } }, 1000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { started = true; clearTimeout(timer); s += d; });
  process.stdin.on('end', () => { clearTimeout(timer); res(s); });
});
const out = o => console.log(flags.json ? JSON.stringify(o, null, 2) : typeof o === 'string' ? o : JSON.stringify(o, null, 2));

// product/project/doc → parts; a full URL works too
function docRef(ref) {
  const m = String(ref).match(/(?:^|\/)([^/]+)\/([^/]+)\/d\/([^/#?]+)/) || String(ref).match(/^([^/]+)\/([^/]+)\/([^/#?]+)$/);
  if (!m) die('document reference must be <product>/<project>/<doc> or a document URL');
  return { product: m[1], project: m[2], doc: m[3] };
}
// a product for a link: from the URL path, --product, or the env
function productOf(link) { const m = String(link).match(/\/\/[^/]+\/([^/]+)\//); return (m && m[1]) || flags.product || process.env.WF_PRODUCT || die('cannot tell the product from that link; pass --product'); }

async function resolve(link) {
  const j = await api('GET', `/api/${productOf(link)}/resolve?link=${encodeURIComponent(link)}`);
  if (flags.json) return out(j);
  console.log(`# ${j.title}  (${j.product}/${j.project}/${j.doc}, ${j.file})`);
  if (j.node) { console.log(`\nnode ${j.node.id} [${j.node.kind}${j.node.status ? ', ' + j.node.status : ''}] line ${j.node.line}\n${j.node.body}`); const rel = j.node.relations; for (const [v, ids] of rel.out) console.log(`  ${v} → ${ids.join(', ')}`); for (const [v, ids] of rel.inc) console.log(`  ← ${v}: ${ids.join(', ')}`); }
  else if (j.block) console.log(`\nblock at line ${j.block.line}:\n${j.block.text}`);
  else if (j.section) console.log(`\nsection "${j.section.heading}" from line ${j.section.line}:\n${j.section.text}`);
  else if (j.note) console.log(`\n${j.note}`);
  else console.log(`\ndocument (${j.length} chars). Read it: wf doc ${j.product}/${j.project}/${j.doc}`);
  // drawings in the text: their annotations as words, and the flattened PNG to look at
  for (const d of j.drawings || []) console.log(`\n${d.src}:\n${d.description || '(no annotations yet)'}${d.png ? `\nrendered with annotations: ${d.png} (look at it with the Read tool)` : ''}`);
  // images in the text (a bug's screenshot): the file to look at
  for (const im of j.images || []) console.log(`\nimage${im.alt ? ` "${im.alt}"` : ''}: ${im.path} (look at it with the Read tool)`);
}

const commands = {
  async resolve() { if (!pos[1]) die('wf resolve <link|id>'); await resolve(pos[1]); },
  async doc() {
    if (pos[1] === 'create') {
      const d = docRef(pos[2] || die('wf doc create <product/project/slug> --title "…"'));
      const j = await api('POST', `/api/${d.product}/${d.project}/doc`, { title: flags.title || die('--title is required'), template: flags.template || 'blank', parent: flags.parent || '', type: flags.type || 'module' });
      if (j.slug !== d.doc) console.error(`note: the slug comes from the title — created ${j.slug}, not ${d.doc}`);
      return out(flags.json ? j : `created ${d.product}/${d.project}/${j.slug} (${WF_URL}/${d.product}/${d.project}/d/${j.slug})`);
    }
    if (pos[1] === 'retype') {
      const d = docRef(pos[2] || die('wf doc retype <product/project/doc> --type <slug>'));
      const j = await api('PUT', `/api/${d.product}/${d.project}/doc/${d.doc}`, { op: 'retype', type: flags.type || die('--type is required') });
      return out(flags.json ? j : `${d.product}/${d.project}/${d.doc} is now ${j.node}${j.rewritten ? ` — ${j.rewritten} reference(s) in ${j.files} file(s) rewritten` : ''}`);
    }
    if (pos[1] === 'write') {
      const d = docRef(pos[2]); const body = flags.file ? fs.readFileSync(flags.file, 'utf8') : await readStdin();
      const cur = await api('GET', `/api/${d.product}/${d.project}/doc/${d.doc}`);
      const j = await api('PUT', `/api/${d.product}/${d.project}/doc/${d.doc}`, { op: 'replace-body', ifMatch: cur.bodyHash, body });
      out(flags.json ? j : `written ${d.product}/${d.project}/${d.doc}${j.lintOk === false ? '\nlint: ' + (j.lintErrors || []).join('; ') : ''}`);
      return;
    }
    const d = docRef(pos[1]); const j = await api('GET', `/api/${d.product}/${d.project}/doc/${d.doc}`);
    out(flags.json ? j : j.body);
  },
  async node() {
    if (pos[1] === 'set') {
      const id = pos[2] || die('wf node set <id> …'); const props = {};
      for (const kv of list(flags.set)) { const i = kv.indexOf('='); if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1); }
      for (const k of list(flags.unset)) props[k] = null;
      const patch = { ...(flags.status ? { status: flags.status } : {}), ...(flags.text ? { text: flags.text } : {}), ...(Object.keys(props).length ? { props } : {}) };
      const j = await api('PUT', `/api/${product()}/node/${encodeURIComponent(id)}`, patch);
      out(flags.json ? j : `${j.file}: ${j.line}`);
      return;
    }
    const id = pos[1] || die('wf node <id>'); const j = await api('GET', `/api/${product()}/node/${encodeURIComponent(id)}`);
    if (flags.json) return out(j);
    console.log(`${j.node.id} [${j.node.kind}${j.node.status ? ', ' + j.node.status : ''}] ${j.node.file}:${j.node.line}\n${j.node.body}`);
    for (const [v, ids] of j.relations.out) console.log(`  ${v} → ${ids.join(', ')}`); for (const [v, ids] of j.relations.inc) console.log(`  ← ${v}: ${ids.join(', ')}`);
  },
  async type() {
    if (pos[1] !== 'add') die('wf type add <slug> [--extends parent] [--purpose "…"] [--doc product/project/doc]');
    const slug = pos[2] || die('wf type add <slug>'); const p = product();
    const body = { slug, extends: flags.extends || 'node', purpose: flags.purpose || '' };
    if (flags.doc) { const d = docRef(flags.doc); body.doc = `data/products/${d.product}/projects/${d.project}/docs/${d.doc}.md`; body.project = d.project; } // the route wants the repo-relative file
    const j = await api('POST', `/api/${p}/types`, body);
    return out(flags.json ? j : `type:${slug} added to ${j.file} (proposed — properties: wf node set or the type page ${WF_URL}/${p}/types/${slug})`);
  },
  async context() {
    const text = pos[1] || (await readStdin()); const j = await api('POST', `/api/${product()}/context`, { text, limit: Number(flags.limit || 10) });
    if (flags.json) return out(j);
    for (const h of j.hits) console.log(`${Math.round(h.score * 100).toString().padStart(3)}%  ${h.id}  ${h.snippet.slice(0, 100)}`);
  },
  async inbox() {
    const p = product();
    if (pos[1] === 'add') {
      const fields = {}; for (const k of ['context', 'choice', 'alternatives', 'consequences', 'when', 'then', 'unless', 'statement', 'source', 'q']) if (flags[k]) fields[k] = String(flags[k]);
      const text = pos[2] || (process.stdin.isTTY ? '' : await readStdin());
      if (!flags.title && !text && !Object.keys(fields).length) die('wf inbox add --type t --title "…" [fields] (or body on stdin)');
      const j = await api('POST', `/api/${p}/inbox`, { type: flags.type || 'note', title: flags.title || '', text, from: flags.from || (process.env.WF_SESSION ? `agent session ${process.env.WF_SESSION}` : 'agent'), refs: list(flags.ref), session: flags.session || process.env.WF_SESSION, fields });
      return out(flags.json ? j : `inbox: ${j.name} (waiting for review at ${WF_URL}/${p}/inbox)`);
    }
    const j = await api('GET', `/api/${p}/inbox`); if (flags.json) return out(j);
    for (const i of j.items.filter(i => flags.all || i.status === 'new')) console.log(`${i.status.padEnd(9)} ${i.type.padEnd(11)} ${i.added.slice(0, 16)}  ${i.title}${i.node ? '  → ' + i.node : ''}`);
    return;
  },
  async session() {
    const sub = pos[1]; const p = product();
    if (sub === 'list' || !sub) {
      const j = await api('GET', `/api/${p}/sessions`); if (flags.json) return out(j);
      const active = j.sessions.filter(s => s.status === 'queued' || s.status === 'running');
      console.log(`runners online: ${j.runners.length}${j.runners.length ? ' — ' + j.runners.map(r => `${r.name} (${r.agent}${r.busy ? ', on ' + r.busy : ', idle'})`).join(', ') : ''}`);
      for (const s of (flags.all ? j.sessions : active)) console.log(`${s.id}  ${s.status.padEnd(9)} ${s.agent.padEnd(12)} ${s.createdAt.slice(0, 16)}  ${s.instruction.split('\n')[0].slice(0, 80)}`);
      if (!flags.all && !active.length) console.log('no active sessions (--all for history)');
      return;
    }
    const id = pos[2];
    if (sub === 'create') {
      const instruction = pos[2] || (await readStdin()); const j = await api('POST', `/api/${p}/sessions`, { agent: flags.agent || 'claude-code', instruction, refs: list(flags.ref), source: flags.link ? { link: flags.link } : {} });
      return out(flags.json ? j : `session ${j.id} queued for ${j.agent}`);
    }
    if (!id) die(`wf session ${sub} <id>`);
    if (sub === 'show') {
      const s = await api('GET', `/api/${p}/sessions/${id}`); if (flags.json) return out(s);
      console.log(`session ${s.id}  ${s.status}  agent ${s.agent}${s.runner ? ' runner ' + s.runner : ''}  created ${s.createdAt}${s.parent ? '  continues ' + s.parent : ''}${s.children && s.children.length ? '  handed to ' + s.children.join(', ') : ''}`);
      if (s.refs.length) console.log(`refs: ${s.refs.join(', ')}`); if (s.source && s.source.link) console.log(`link: ${s.source.link}`);
      console.log(`\n${s.instruction}\n`);
      const log = flags.full ? s.log : s.log.slice(-30); console.log(`log (${s.log.length} lines${flags.full ? '' : ', last 30'}):`); for (const l of log) console.log(`  ${l.t.slice(11, 19)} ${l.line}`);
      if (s.result) console.log(`\nresult:\n${s.result}`);
      return;
    }
    if (sub === 'log') { const text = pos[3] || (await readStdin()); const lines = text.split('\n').filter(Boolean); await api('PATCH', `/api/${p}/sessions/${id}`, { lines }); return; }
    if (sub === 'done' || sub === 'fail') { const result = pos[3] !== undefined ? pos[3] : process.stdin.isTTY ? undefined : await readStdin(); await api('PATCH', `/api/${p}/sessions/${id}`, { status: sub === 'done' ? 'done' : 'failed', result }); return out(`session ${id} ${sub === 'done' ? 'done' : 'failed'}`); }
    if (sub === 'take') { const runner = flags.runner || `interactive-${os.hostname().split('.')[0]}`; await api('PATCH', `/api/${p}/sessions/${id}`, { status: 'running', runner, line: `taken over interactively (${runner})` }); return out(`session ${id} running under ${runner}`); }
    if (sub === 'open') { const target = pos[3] || die('wf session open <id> <product/project/doc[#node] | url>'); const j = await api('PATCH', `/api/${p}/sessions/${id}`, { open: target }); return out(flags.json ? j : `opened ${j.path}${j.live ? '' : ' (no live console — logged only)'}`); }
    if (sub === 'cancel') { await api('PATCH', `/api/${p}/sessions/${id}`, { status: 'cancelled' }); return out(`session ${id} cancelled`); }
    if (sub === 'changes') { // every block the session added, changed or removed, per document
      const j = await api('GET', `/api/${p}/sessions/${id}/changes`); if (flags.json) return out(j);
      const c = j.counts; console.log(`session ${j.id}  ${j.status}  ${[c.added && `+${c.added} added`, c.changed && `${c.changed} changed`, c.removed && `${c.removed} removed`, c.prose && `${c.prose} paragraph(s)`].filter(Boolean).join(' · ') || 'no changes'}`);
      for (const g of j.groups) { console.log(`\n${g.doc}`); for (const r of g.rows) console.log(`  ${r.change === 'added' ? '+' : r.change === 'changed' ? '~' : '-'} ${r.id}${r.status ? ' #' + r.status : ''}${r.exists ? '' : ' (gone)'}  ${r.text !== r.id ? r.text.slice(0, 100) : ''}`); if (g.prose.length) console.log(`  … ${g.prose.length} paragraph(s)`); }
      return;
    }
    if (sub === 'handoff') { const j = await api('POST', `/api/${p}/sessions/${id}/handoff`, { agent: flags.agent || die('--agent required'), note: pos[3] || '' }); return out(flags.json ? j : `session ${j.id} queued for ${j.agent}, continuing ${id}`); }
    die(`unknown session command: ${sub}`);
  },
  async agent() {
    if (pos[1] !== 'listen') die('wf agent listen --product p --agent a [--cmd "…"] [--name n] [--once]');
    const p = product(); const agent = flags.agent || 'claude-code';
    const name = flags.name || `${os.hostname().split('.')[0]}-${agent}-${process.pid}`;
    // defaults: the prompt arrives on stdin; the agent may read, edit and run the project's tools without prompting
    const DEFAULT_CMD = {
      'claude-code': `claude -p --output-format text --permission-mode acceptEdits --allowedTools "Bash(wf:*)" "Bash(ctx:*)" "Bash(node:*)" "Bash(npm:*)" "Bash(git:*)" "Read" "Edit" "Write" "Grep" "Glob"`,
      codex: 'codex exec --sandbox workspace-write',
    };
    const cmd = flags.cmd || DEFAULT_CMD[agent] || die(`no default command for agent ${agent}; pass --cmd`);
    const me = { name, agent, host: os.hostname(), pid: process.pid, cwd: process.cwd(), startedAt: new Date().toISOString() };
    let busy = null;
    const beat = () => api('POST', `/api/${p}/runners`, { ...me, busy }).catch(e => console.error('heartbeat failed:', e.message));
    const bye = async () => { try { await api('POST', `/api/${p}/runners`, { ...me, gone: true }); } catch { /* server gone */ } process.exit(0); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
    await beat(); const hb = setInterval(beat, 10_000);
    console.log(`${name}: listening for ${agent} sessions of ${p} at ${WF_URL} — command: ${cmd}`);
    for (;;) {
      let s = null;
      try { s = await api('POST', `/api/${p}/sessions/claim`, { agent, runner: name }); } catch (e) { console.error('claim failed:', e.message); }
      if (!s) { await new Promise(r => setTimeout(r, 3000)); continue; } // --once: exit after the first session, but wait for it
      busy = s.id; await beat();
      console.log(`▶ session ${s.id}: ${s.instruction.split('\n')[0].slice(0, 100)}`);
      const log = lines => api('PATCH', `/api/${p}/sessions/${s.id}`, { lines }).catch(() => {});
      let prompt;
      try { prompt = await buildPrompt(p, s); } catch (e) { await api('PATCH', `/api/${p}/sessions/${s.id}`, { status: 'failed', line: `could not build the prompt: ${e.message}` }); busy = null; continue; }
      // the Waterfall contract: claude takes it as an appended system prompt, other agents get it on top of the prompt
      let system = ''; try { system = await (await fetch(`${WF_URL}/api/${p}/agent-prompt`)).text(); } catch { /* no contract available */ }
      let fullCmd = cmd; let fullPrompt = prompt;
      if (system && agent === 'claude-code') { const f = path.join(os.tmpdir(), `wf-system-${s.id}.md`); fs.writeFileSync(f, system); fullCmd = `${cmd} --append-system-prompt-file "${f}" --add-dir "${flags['waterfall-root'] || process.env.WF_ROOT || process.cwd()}"`; }
      else if (system) fullPrompt = `${system}\n\n---\n\n${prompt}`;
      await log([`runner ${name} starting: ${fullCmd}`]);
      const code = await runCommand(fullCmd, fullPrompt, log, flags.cwd || process.cwd(), p, s.id);
      await api('PATCH', `/api/${p}/sessions/${s.id}`, { status: code === 0 ? 'done' : 'failed', line: `exit code ${code}` }).catch(() => {});
      console.log(`■ session ${s.id} ${code === 0 ? 'done' : 'failed (' + code + ')'}`);
      busy = null; await beat();
      if (flags.once) break;
    }
    clearInterval(hb); await bye();
  },
};

// The prompt an agent gets: the instruction, then every ref and the source link resolved to its text, then how to
// talk back. Kept plain so any CLI agent can take it on stdin.
async function buildPrompt(p, s) {
  const parts = [];
  parts.push(`You are working on the product "${p}" in Waterfall (a knowledge base of requirements, rules, decisions, goals and tasks kept as markdown; a web app at ${WF_URL}). Session ${s.id}.`);
  parts.push(`\n## Instruction\n${s.instruction}${await fetchImages(p, s)}`);
  const ctx = [];
  const seen = new Set();
  for (const ref of [...(s.source && s.source.link ? [s.source.link] : []), ...s.refs]) {
    if (seen.has(ref)) continue; seen.add(ref);
    try { const j = await api('GET', `/api/${p}/resolve?link=${encodeURIComponent(ref)}`); ctx.push(renderResolved(ref, j)); } catch (e) { ctx.push(`- ${ref}: could not resolve (${e.message})`); }
  }
  if (ctx.length) parts.push(`\n## Context\n${ctx.join('\n\n')}`);
  if (s.parent) parts.push(`\nThis session continues session ${s.parent}; its log and result are in the instruction above. Pick up where it stopped.`);
  parts.push(`\n## How to work\n- The Waterfall CLI is \`wf\` (WF_URL=${WF_URL}, WF_PRODUCT=${p}). Read: \`wf resolve <link|id>\`, \`wf doc <product/project/doc>\`, \`wf node <id>\`, \`wf context "<text>"\`. Write: \`wf node set <id> --status s --set key=value\`, \`wf doc write <product/project/doc> --file f\` (whole body). \`ctx\` queries the graph offline (\`ctx --root data/products/${p} search …\`).\n- Documents are markdown under data/products/${p}/projects/<project>/docs/. Nodes are lines that start with an id (\`req:x …\`, \`- [ ] task:y …\`) or yaml blocks; keep ids stable.\n- Report progress with \`wf session log ${s.id} "<line>"\` and finish with \`wf session done ${s.id} "<result>"\` (or \`wf session fail\`). The runner marks the session done when you exit, so a final summary on stdout is enough.\n- If the work belongs to another agent, \`wf session handoff ${s.id} --agent <codex|claude-code> "<note>"\`.`);
  return parts.join('\n');
}
// The request's images (pasted into the command box) are the session's files in the app; a runner fetches them
// into a temp folder so the agent can open them with its Read tool wherever it runs.
async function fetchImages(p, s) {
  const names = Array.isArray(s.images) ? s.images : []; if (!names.length) return '';
  const dir = path.join(os.tmpdir(), `wf-${s.id}-files`); fs.mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const n of names) {
    try { const r = await fetch(`${WF_URL}/api/${p}/sessions/${s.id}/file/${encodeURIComponent(n)}`); if (!r.ok) continue; const f = path.join(dir, path.basename(n)); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); paths.push(f); } catch { /* skip the image */ }
  }
  return paths.length ? `\nImages attached to the request (look at them with the Read tool):\n${paths.map(f => `- ${f}`).join('\n')}` : '';
}
function renderResolved(ref, j) {
  const head = `### ${ref}\n${j.title} — ${j.file}`;
  if (j.node) { const r = j.node.relations; return `${head}\n${j.node.body}\n${r.out.map(([v, ids]) => `${v} → ${ids.join(', ')}`).join('\n')}${r.inc.length ? '\n' + r.inc.map(([v, ids]) => `← ${v}: ${ids.join(', ')}`).join('\n') : ''}`; }
  if (j.block) return `${head} (line ${j.block.line})\n${j.block.text}`;
  if (j.section) return `${head}\n${j.section.text.slice(0, 6000)}`;
  return `${head}\n(the whole document, ${j.length} chars — read it with wf doc ${j.product}/${j.project}/${j.doc})`;
}
// Run the agent command with the prompt on stdin; every stdout/stderr line goes to the session log (batched).
function runCommand(cmd, prompt, log, cwd, productEnv, sessionId) {
  return new Promise(resolve => {
    const child = spawn(cmd, { shell: true, cwd, env: { ...process.env, WF_URL, WF_PRODUCT: productEnv, WF_SESSION: sessionId } });
    let buf = []; let timer = null;
    const flush = () => { if (buf.length) { const b = buf; buf = []; log(b); } timer = null; };
    const onData = d => { for (const line of String(d).split('\n')) { if (!line.trim()) continue; process.stdout.write('  ' + line + '\n'); buf.push(line.slice(0, 2000)); } if (!timer) timer = setTimeout(flush, 800); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('close', code => { flush(); setTimeout(() => resolve(code ?? 1), 900); });
    child.stdin.on('error', () => {}); child.stdin.write(prompt); child.stdin.end();
  });
}

(async () => {
  const c = commands[pos[0]];
  if (!c) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 19).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(pos[0] ? 1 : 0); }
  try { await c(); } catch (e) { die(e.message); }
})();
