#!/usr/bin/env node
'use strict';
// wye — the one command of Wye (decision:wf2.cli-is-wye): the agent's and the person's door into the running app
// (WYE_URL, default http://localhost:3456), and the graph itself — `wye build`, `wye check`, `wye get`, `wye search`,
// `wye reqs`, `wye site`, `wye stats` (bin/wye-graph.js) read and build a product's graph without the app.
//
//   wye build [--root <product dir>]      parse the documents → _build/graph.json
//   wye check [--root <product dir>] [--strict]   the graph's problems (dangling references, missing fields…)
//   wye graph <get|neighbors|search|constraints|reqs|stats|site|impact|packet|verdicts> …   every graph command by name
//
//   wye setup                             the home (~/.wye when installed from npm: your products in data/) and the Claude Code skills
//   wye app [folder] [--port 3456] [--browser] [--no-open]   the app in its own window, over the home (--browser: in your browser);
//        with a folder, that folder is opened as the workspace: its vaults are the Documents roots, its files are under Files
//   wye export <product> [--out file]     the product as one file, <product>.wye.tgz (documents, pages, inbox; not sessions)
//   wye import <file.wye.tgz> [--slug s]  a new product from an export (markdown into a product: wye import <file|dir> --product p, below)
//   wye open <folder> [--slug s]          a product folder already on disk (projects/, or a repo's wye/) used where it is
//
//   wye resolve <link|id>                 what a link points at: document, node, block or section (text included)
//   wye doc <product/project/doc>         a document's markdown body
//   wye doc write <product/project/doc> [--file f] [--section "Analysis"]   replace the body (stdin or --file) — or one ## section of it — checked against the current hash
//   wye doc create <product/project/slug> --title "…" [--template blank] [--parent doc] [--type module]   a new document in a project (a page of that type)
//   wye doc retype <product/project/doc> --type <slug>   the page becomes an instance of that type; every link to it follows
//   wye query "<SQL>" [--json]   one read query over the graph: nodes(id, kind, title, status, project, page, file, text, props JSON),
//        edges(src, dst, verb); MATCH patterns on graph wye — e.g. FROM GRAPH_TABLE (wye MATCH (c:nodes)-[e:edges]->(p:nodes) …)
//   wye node <id> [--product p]           a node with its relations
//   wye node set <id> --product p [--status s] [--text t] [--set key=value ...] [--unset key ...]
//   wye node content <id> [--product p]   the blocks under the node (its content) as markdown; --file f | stdin replaces it
//   wye node add <type>:<slug> --product p [--title "…"]   a new instance of a product type — a row in the type's collection
//        document (created on the first instance, decision:ontology.collection-document); a base kind needs --doc project/doc
//   wye verdicts <id ...> --product p     classify nodes against their neighbours now (duplicate | refines | consistent | contradicts)
//   wye impact <id> --after "<new text>" --product p [--no-judge] [--json]   what an edit would reach and what each reached node
//        needs (unaffected | update | rework | contradicts | ask) — run it before editing an approved node; nothing is written
//   wye context "<text>" --product p [--all | --as-of d]   knowledge closest to a text (local semantic search; ended nodes hidden)
//   wye ask "<question>" --product p [--fast | --deep] [--json]   a cited answer from the product's knowledge, documents,
//        code and sessions: a fast answer, the sources a deeper search opens as it works, then its answer
//   wye ask-search "<words>" --product p [--source node|doc|code|session] [--limit n] [--expand] [--rerank] [--json]
//        the passages Ask answers from, ranked (full-text + vectors; --expand adds one hop along the graph)
//   wye packet --for "<text>" [--ref id ...] --product p [--budget N] [--all | --as-of d]   the constraints in force for a text:
//        every rule, constraint, gate, approved decision, goal and open question within two hops of what it touches, complete
//   wye type add <slug> --product p [--extends parent] [--purpose "…"] [--doc product/project/doc]   a proposed type card
//   wye remember [--title "…"] [--ref id ...] [--file f] --product p   the person's words as they were said (a request, a brief, a
//        correction, a pasted document; stdin or the argument): kept in the inbox as raw input — never a block —, its impact on
//        what is known judged (update | rework | contradicts | ask) and digested at once by a Remember session: new facts
//        proposed, changed ones superseded, contradictions raised as questions
//   wye inbox add --product p --title "…" [--ref id ...] (body on stdin)   a raw note (pasted material) for later filing;
//        decisions, questions, requirements and rules are blocks in the documents, not inbox items
//   wye inbox list --product p [--all]    what is waiting for review
//   wye session list --product p [--all]  sessions (active first); runners online
//   wye session show <id> --product p     one session with its log (--full for everything)
//   wye session changes <id>              every block the session added / changed / removed, per document (--json)
//   wye session create --product p --agent a "<instruction>" [--ref id ...] [--link url]
//   wye session log <id> --product p "<line>" | (stdin)   append to the log
//   wye session done|fail <id> --product p ["result"]     finish a session
//   wye session handoff <id> --product p --agent a ["note"]  continue it under another agent
//   wye session open <id> --product p <product/project/doc[#node] | url>   navigate the person's browser to a page
//   wye session take <id> --product p       mark it running under you (interactive pick-up, e.g. /wye-restore)
//   wye session join ["what you are working on"] --product p [--agent a] [--name n] [--ref id ...]   an agent that is already running
//        (on a server, over the tunnel — docs/remote-agent.md) joins as a session of its own; prints `export WYE_SESSION=<id>`:
//        eval "$(wye session join "…")" before starting the agent, and everything it writes is attributed to it
//   wye propose [<product/project/doc>] --pr <product/project/pr-x> --product p (a yaml card with `- id: kind:slug` on stdin or --file f)
//        one proposed block into the document where its kind lives, embedded on the request's Definition; without a
//        document it is defined on the request under Definition (decision:exec.definition-home-fallback)
//   wye init [folder] [--slug s] [--title "…"]   a vault for the current folder (lib/vault.js): its own knowledge in <folder>/.wye/
//        beside the code — the shallow definition, _agent.md, a note to agents in AGENTS.md / CLAUDE.md — linked to the vault
//        above and the ones below (`parent:` / `vaults:` in _product.md), and opened in the app; on a folder that has one, only the
//        note to agents in CLAUDE.md / AGENTS.md is brought up to date (the text between its markers)
//   wye init [folder] [--slug s] [--title "…"]   a vault for the folder (the current one): its own knowledge in .wye/ beside the
//        code — a first definition read from it, _agent.md, a note in AGENTS.md / CLAUDE.md — linked to the vault above
//        and the ones below. Inside a folder that has a vault, every command below finds its product from there.
//   wye init --product <slug> --repo <dir> [--title "…"] [--feature "<name>" --path <dir>]   a product's (or feature's) definition
//        from its code: the layered tree, every module / page / component / library / operation / test, shallow, and a
//        #ready describe task per module (lib/init.js) — no model, nothing overwritten
//   wye deepen <module> --product p [--worker claude-code]   assign the module's describe task: requirements from the code,
//        each mapped to the file that delivers it (prompts/describe-module.md)
//   wye pr <product/project/pr-x> [--status draft|refining|approved|building|done|failed|cancelled]   the PR's status, Definition and readiness
//   wye pr approve|cancel|reopen <product/project/pr-x> [--by name]   the person's move (never the librarian's)
//   wye pr revisit <product/project/pr-x>   bring a page written under older rules up to the current approach (skill:revisit-request):
//        its live librarian is told, else one starts on the page — form changes, what was decided stays
//   wye pr build <product/project/pr-x> [--worker claude-code|codex|runner] [--note "…"] [--force]   Build: hand the request's
//        request task to a worker with the Definition (rule:build) — what the person's "build it" in a librarian conversation means
//   wye skills --product p                 the product's skills (decision:wf2.hooks-and-skills): id, role, what it runs on
//   wye packages [--product p] [--json]   the system library (WYE_SYSTEM, else system/): each package with its title and what it holds
//        — skills, workflows, hooks, templates, types — and, with --product, the projects it is installed in
//   wye install <package> --product p --project x [--dry-run] [--create-product "<title>"] [--by name]   link the package into the
//        project (op:install.install): its documents follow the system library, its types are declared in the product, the
//        record is projects/x/.wye/packages.yaml; --dry-run lists what it would put there; --create-product makes the product first
//   wye uninstall <package> --product p --project x   the link, the record entry and the types the install declared are gone
//   wye skill <id> --product p             print a skill's instruction (its document's body, else the prompt file)
//   wye hooks --product p [--node <id>]    the product's hooks and what fired: hook, node, event, the task / blocks / session
//   wye hooks tick --product p [--now <iso>]   one tick of the hooks clock (decision:ea.time-based-hooks): time hooks whose slot passed fire
//   wye workflow list|show <id>            the product's workflows (decision:wf2.workflow-is-a-skill): stages, what each produces, its gate
//   wye workflow run <id> --on <node>      start a run on a node or document (--again for a second one on the same node)
//   wye run list|show <id>                 the runs: workflow, what it runs on, the stage, its readiness row by row
//   wye run advance|skip|retry|cancel <id> the person's moves; wye run reopen <id> --stage <s> goes back to a stage
//   wye explain <id | "text"> --product p   the current state of the product around a node or a text (the librarian, one turn)
//   wye work list --product p [--unassigned | --mine <name> | --goal <id> | --plan <id>] [--done]   every task with its state
//   wye work add "<text>" --product p [--part-of <id>] [--ready]   a task line on the backlog (under the node when --part-of names one)
//   wye work next --product p [--goal <id>]   the oldest ready, unblocked, unassigned task
//   wye work assign <task> --worker <person|claude-code|codex|runner> --product p [--note "…"] [--force]
//   wye import <file|dir> --product p [--project x] [--parent doc] [--no-analyse] [--brief "…"]   markdown files (a folder's tree kept) as
//        documents, then an agent extracts their types, requirements, facts and decisions as proposed blocks (skill:import)
//   wye import --code <dir> --name "<module>" --product p [--project x] [--parent doc] [--no-analyse] [--brief "…"]   a page for the
//        module with an import task on it, handed to an agent at once (skill:import-code): it reads the code and writes the definition
//   wye eval own | compare | public <adapter> | judge | report   the benchmarks (module:benchmarks): tier 1 on the product's own
//        history with the CI gate, the with-and-without harness, the public adapters, the judge set's κ, the latest / previous / delta
//   wye ea intake --product ea [--project assistant] --file <analysis.json>   (or the JSON on stdin) a meeting analysis — and/or `messages`: Slack threads and emails waiting on the director — an outside tool
//        pushes (task:ea.cli-intake): the meeting and its decisions, commitments, risks and updates filed proposed under their
//        projects and people; an item it cannot place waits in the Inbox with a question. Same meeting twice → nothing new
//   wye ea commitment move <id> --to YYYY-MM-DD --why "…" [--on YYYY-MM-DD] | met <id> [--on YYYY-MM-DD] | drop <id> --why "…"
//        follow a committed date (task:ea.commitment-tracking): a move keeps the old date, the new one, when and why
//   wye ea suggest list [--all] | add "<action>" --why "…" [--about id] [--source s] | close <id> [--done] [--why "…"]   suggested
//        actions at the top of the Digest — a second add of the same action about the same item renews the open one
//   wye ea digest context [--date d] | summary --file <entry.md> [--date d]   the Digest's daily summary: what arrived, changed or
//        closed since the last one and what waits now; then the entry written at the top of the Digest's Daily summary
//   wye ea brief daily|weekly|1on1 --product ea [--person person:ea.x] [--date YYYY-MM-DD] [--write] [--project p]   the morning
//        brief, the weekly execution review, 1:1 prep — printed, or with --write kept as a page under Briefs (one per day)
//   wye agent listen --product p --agent claude-code|codex [--cmd "<command>"] [--name n] [--once] [--take-ready [--goal <id>]]
//        pick up queued sessions for that agent, run the command with the prompt on stdin, stream output to the log;
//        --take-ready also claims the oldest #ready unblocked unassigned task when nothing is queued
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// WYE_URL / WYE_PRODUCT / WYE_SESSION; the WF_ names still work for the sessions that were started with them
const env = (k) => process.env['WYE_' + k] || process.env['WF_' + k];
const WF_URL = (env('URL') || 'http://localhost:3456').replace(/\/$/, '');
const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { (flags[k] === undefined ? (flags[k] = v) : (flags[k] = [].concat(flags[k], v))); i++; } }
  else pos.push(a);
}
const list = v => v === undefined ? [] : [].concat(v);
const die = (m, code = 1) => { console.error(m); process.exit(code); };
// The product a command is about: --product, WYE_PRODUCT, else the vault of the folder this runs in — the nearest
// .wye/ at or above it (decision:wf2.write-back-nearest-vault), under the name the app knows it by (hereProduct, set
// before the command runs). So inside a repository no flag is needed, and what an agent writes lands in that vault.
let hereProduct = '';
// In a session Wye started (WYE_SESSION), WYE_PRODUCT names the vault the session began in; when the agent runs wye
// from a folder of another vault, what it writes concerns that vault's files and goes there
// (decision:wf2.spanning-session-each-vault-its-share) — the session's own commands stay with its product.
let hereFirst = false;
const product = () => flags.product || (hereFirst && hereProduct) || env('PRODUCT') || hereProduct || die('--product <slug> (or WYE_PRODUCT) is required — or run wye inside a folder that has a vault (wye init)');
async function findHereProduct() {
  hereFirst = !!env('SESSION') && !!env('PRODUCT') && pos[0] !== 'session';
  if (flags.product || (env('PRODUCT') && !hereFirst)) return;
  let folder = null; try { folder = require('../lib/vault.js').vaultOf(process.cwd()); } catch { return; }
  if (!folder) return;
  const own = require('../lib/vault.js').readMeta(folder).slug || path.basename(folder);
  // the app opens the vault when it does not know it yet, and says which name it has there (a second vault with one
  // slug on this machine is shown as <slug>-2); with no app running, the vault's own name
  try { const r = await fetch(`${WF_URL}/api/products/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: path.join(folder, '.wye') }), signal: AbortSignal.timeout(4000) }); const j = await r.json(); hereProduct = (r.ok && j.slug) || own; } catch { hereProduct = own; }
}

async function api(method, p, body) {
  const headers = { ...(body ? { 'content-type': 'application/json' } : {}), ...(env('SESSION') ? { 'x-wf-session': env('SESSION') } : {}) };
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
function productOf(link) { const m = String(link).match(/\/\/[^/]+\/([^/]+)\//); return (m && m[1]) || flags.product || (hereFirst && hereProduct) || env('PRODUCT') || hereProduct || die('cannot tell the product from that link; pass --product'); }

async function resolve(link) {
  const j = await api('GET', `/api/${productOf(link)}/resolve?link=${encodeURIComponent(link)}`);
  if (flags.json) return out(j);
  console.log(`# ${j.title}  (${j.product}/${j.project}/${j.doc}, ${j.file})`);
  if (j.node) { console.log(`\nnode ${j.node.id} [${j.node.kind}${j.node.status ? ', ' + j.node.status : ''}] line ${j.node.line}\n${j.node.body}`); const rel = j.node.relations; for (const [v, ids] of rel.out) console.log(`  ${v} → ${ids.join(', ')}`); for (const [v, ids] of rel.inc) console.log(`  ← ${v}: ${ids.join(', ')}`); }
  else if (j.block) console.log(`\nblock at line ${j.block.line}:\n${j.block.text}`);
  else if (j.section) console.log(`\nsection "${j.section.heading}" from line ${j.section.line}:\n${j.section.text}`);
  else if (j.note) console.log(`\n${j.note}`);
  else console.log(`\ndocument (${j.length} chars). Read it: wye doc ${j.product}/${j.project}/${j.doc}`);
  // drawings in the text: their annotations as words, and the flattened PNG to look at
  for (const d of j.drawings || []) console.log(`\n${d.src}:\n${d.description || '(no annotations yet)'}${d.png ? `\nrendered with annotations: ${d.png} (look at it with the Read tool)` : ''}`);
  // images in the text (a bug's screenshot): the file to look at
  for (const im of j.images || []) console.log(`\nimage${im.alt ? ` "${im.alt}"` : ''}: ${im.path} (look at it with the Read tool)`);
}

const commands = {
  // wye setup: the home (~/.wye for an installed package, bin/wye-home.js) and the Claude Code skills
  async setup() {
    const h = require('./wye-home.js'); const dir = h.ensureHome();
    console.log(`home     → ${dir}${dir === h.INSTALL ? ' (this clone)' : ''}  — products in ${path.join(dir, 'data', 'products')}`);
    try { const c = h.linkCli(); console.log(`wye      → ${c.link}  ${c.onPath ? '(on PATH)' : `(add ${c.dir} to PATH)`}`); } catch (e) { console.error(`wye: ${e.message}`); }
    for (const l of h.linkSkills()) console.log(`skill    → ${l}`);
    console.log('\nnext: wye app   (the app, in its own window)\n      or start from your code: wye init --product <slug> --repo <dir>');
  },
  // wye export / import / open (decision:wf2.product-transfer) — through the running app
  async export() {
    const p = pos[1] || flags.product || env('PRODUCT') || die('wye export <product> [--out file]');
    const r = await fetch(`${WF_URL}/api/${p}/export`);
    if (!r.ok) { const j = await r.json().catch(() => ({})); die(`export: ${j.message || j.error || r.status}`); }
    const file = path.resolve(flags.out || `${p}.wye.tgz`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log(`${file}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB) — wye import ${path.basename(file)} on the other side`);
  },
  // a product exported as one file (wye export) → a new product; `wye import` sends a .wye.tgz here
  async importProduct() {
    const file = pos[1] || die('wye import <file.wye.tgz> [--slug s]');
    const r = await fetch(`${WF_URL}/api/products/import${flags.slug ? `?slug=${encodeURIComponent(flags.slug)}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/gzip' }, body: fs.readFileSync(file) });
    const j = await r.json().catch(() => ({})); if (!r.ok) die(`import: ${j.message || j.error || r.status}`);
    console.log(`imported as ${j.slug} → ${WF_URL}/${j.slug}  (${j.dir})`);
  },
  async open() {
    const folder = pos[1] || die('wye open <folder> [--slug s]');
    const j = await api('POST', '/api/products/open', { folder: path.resolve(folder.replace(/^~(?=$|\/)/, os.homedir())), slug: flags.slug });
    console.log(`${j.existing ? 'already open as' : 'opened as'} ${j.slug} → ${WF_URL}/${j.slug}  (${j.dir})`);
  },
  // wye app: the built web app over the home, on WYE_PORT (default 3456) — the port the CLI and the agents expect — in
  // its own window: this process owns the server, the Electron shell (packages/desktop, WYE_ATTACH) is the window on
  // it, and closing the window stops both. --browser opens the system browser instead; --no-open is the server alone.
  // Without Electron (an install that skipped the optional dependency or its download) the browser is the window.
  async app() {
    const h = require('./wye-home.js'); const dir = h.ensureHome();
    const web = path.join(h.INSTALL, 'packages', 'web');
    if (!fs.existsSync(path.join(web, '.next', 'BUILD_ID'))) die(h.isCheckout() ? 'no build yet: npm run build --workspace=packages/web (or npm run dev for the dev server)' : `the package has no app build (${web}/.next) — reinstall it`);
    const port = String(flags.port || process.env.WYE_PORT || 3456);
    const next = require.resolve('next/dist/bin/next', { paths: [web] });
    const url = `http://localhost:${port}`;
    const browser = () => { const o = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'; try { spawn(o, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref(); } catch { /* no opener */ } };
    // the Electron binary of this install, or null: the package lists it as optional so an install without it still runs
    const desktop = path.join(h.INSTALL, 'packages', 'desktop');
    let electron = null;
    if (!flags.browser && !flags['no-open'] && fs.existsSync(path.join(desktop, 'main.js'))) {
      const find = () => { try { return require(require.resolve('electron', { paths: [h.INSTALL] })); } catch { return null; } };
      electron = find();
      // the package is there but its binary is not: npm (11+) does not run a dependency's install script on a global
      // install unless told to, and that script is Electron's download — run it here, once
      if (!electron) {
        let pkgDir = null; try { pkgDir = path.dirname(require.resolve('electron/package.json', { paths: [h.INSTALL] })); } catch { /* not installed */ }
        if (pkgDir && fs.existsSync(path.join(pkgDir, 'install.js'))) {
          console.log('getting the window — Electron, a download of about 100 MB, once…');
          require('child_process').spawnSync(process.execPath, ['install.js'], { cwd: pkgDir, stdio: 'inherit' });
          electron = find();
        }
      }
    }
    // a Wye already answering on the port: this one is only a window on it
    const up = await fetch(`${url}/api/products`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
    console.log(`Wye on ${url} — home ${dir}  (${up ? 'already running' : electron ? 'close the window or Ctrl+C to stop it' : 'Ctrl+C stops it'})`);
    if (!electron && !flags.browser && !flags['no-open']) console.log('no Electron in this install — opening your browser instead (reinstall with: npm install -g @emlab/wye --include=optional --allow-scripts=electron)');
    const child = up ? null : spawn(process.execPath, [next, 'start', '-p', port, '-H', '127.0.0.1'], { cwd: h.prepareApp(web, dir), stdio: 'inherit', env: { ...process.env, WYE_HOME: dir, WYE_URL: url } });
    // wye app <folder>: that folder is the workspace (decision:wf2.workspace-is-the-top) — asked of the app once it answers
    if (pos[1]) {
      const folder = path.resolve(pos[1].replace(/^~(?=$|\/)/, os.homedir()));
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) die(`wye app: ${folder} is not a folder`);
      (async () => {
        for (let i = 0; i < 80; i++) {
          try { const r = await fetch(`${url}/api/workspace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder }), signal: AbortSignal.timeout(8000) }); const j = await r.json().catch(() => ({})); console.log(r.ok ? `workspace: ${folder} — ${j.vaults.length} vault${j.vaults.length === 1 ? '' : 's'}` : `workspace: ${j.message || r.status}`); return; }
          catch { await new Promise(res => setTimeout(res, 500)); }
        }
      })();
    }
    let shell = null; let done = false;
    const stop = sig => { if (done) return; done = true; if (shell) shell.kill(); if (child) child.kill(sig); else process.exit(0); };
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stop(sig));
    if (electron) {
      const started = Date.now();
      // ELECTRON_RUN_AS_NODE (set by some shells and editors) would make the binary run main.js as plain Node
      const env = { ...process.env, WYE_ATTACH: '1', WYE_PORT: port, WYE_HOME: dir }; delete env.ELECTRON_RUN_AS_NODE;
      shell = spawn(electron, [desktop], { stdio: ['ignore', 'ignore', 'inherit'], env });
      const fallback = why => { shell = null; if (done) return; console.log(`the window could not open (${why}) — the app stays on ${url}`); if (up) process.exit(0); browser(); };
      shell.on('error', e => fallback(e.message));
      // the window closed: the app stops with it — unless Electron never got as far as a window (no display)
      shell.on('exit', code => { if (!shell) return; if (code && Date.now() - started < 8000) return fallback(`Electron exit ${code}`); shell = null; stop('SIGTERM'); });
    } else if (!flags['no-open']) setTimeout(browser, up ? 0 : 2500);
    if (!child) { if (!electron) return; await new Promise(() => {}); }
    await new Promise(res => child.on('exit', code => { if (shell) shell.kill(); process.exitCode = done ? 0 : code ?? 0; res(); }));
  },
  // the benchmarks (eval/cli.js): runs here, reads the documents, asks the app for hits and packets; exit 2 when the gate fails
  async eval() { const code = await require('../eval/cli.js').main(pos.slice(1), flags); if (code) process.exit(code); },
  async resolve() { if (!pos[1]) die('wye resolve <link|id>'); await resolve(pos[1]); },
  async doc() {
    if (pos[1] === 'create') {
      const d = docRef(pos[2] || die('wye doc create <product/project/slug> --title "…"'));
      const j = await api('POST', `/api/${d.product}/${d.project}/doc`, { title: flags.title || die('--title is required'), template: flags.template || 'blank', parent: flags.parent || '', type: flags.type || 'module' });
      if (j.slug !== d.doc) console.error(`note: the slug comes from the title — created ${j.slug}, not ${d.doc}`);
      return out(flags.json ? j : `created ${d.product}/${d.project}/${j.slug} (${WF_URL}/${d.product}/${d.project}/d/${j.slug})`);
    }
    if (pos[1] === 'retype') {
      const d = docRef(pos[2] || die('wye doc retype <product/project/doc> --type <slug>'));
      const j = await api('PUT', `/api/${d.product}/${d.project}/doc/${d.doc}`, { op: 'retype', type: flags.type || die('--type is required') });
      return out(flags.json ? j : `${d.product}/${d.project}/${d.doc} is now ${j.node}${j.rewritten ? ` — ${j.rewritten} reference(s) in ${j.files} file(s) rewritten` : ''}`);
    }
    if (pos[1] === 'write') {
      const d = docRef(pos[2]); let body = flags.file ? fs.readFileSync(flags.file, 'utf8') : await readStdin();
      const cur = await api('GET', `/api/${d.product}/${d.project}/doc/${d.doc}`);
      // --section "Analysis": only that ## section is replaced (a missing one goes in its place on a request page); the rest stays
      if (flags.section) {
        body = require('../lib/sections').withSection(cur.body, flags.section, body);   // a missing section goes where it belongs
      }
      const j = await api('PUT', `/api/${d.product}/${d.project}/doc/${d.doc}`, { op: 'replace-body', ifMatch: cur.bodyHash, body });
      out(flags.json ? j : `written ${d.product}/${d.project}/${d.doc}${j.lintOk === false ? '\nlint: ' + (j.lintErrors || []).join('; ') : ''}`);
      return;
    }
    const d = docRef(pos[1]); const j = await api('GET', `/api/${d.product}/${d.project}/doc/${d.doc}`);
    out(flags.json ? j : j.body);
  },
  async query() {   // decision:wf2.graph-query — op:api.query
    const sql = pos.slice(1).join(' ').trim() || (flags.file ? fs.readFileSync(String(flags.file), 'utf8') : await readStdin());
    if (!sql.trim()) die('wye query "<SQL>" [--json]   tables nodes(id, kind, title, status, project, page, file, text, props JSON) and edges(src, dst, verb); graph wye for MATCH');
    const p = product();
    const j = await api('POST', `/api/${p}/query`, { sql });
    if (flags.json) return out(j);
    if (!j.rows.length) return console.log(`no rows (${j.ms} ms)`);
    const cols = j.columns; const cell = v => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    const w = cols.map(c => Math.min(60, Math.max(c.length, ...j.rows.map(r => cell(r[c]).length))));
    const line = vals => vals.map((v, i) => v.slice(0, w[i]).padEnd(w[i])).join('  ');
    console.log(line(cols)); console.log(w.map(n => '-'.repeat(n)).join('  '));
    for (const r of j.rows) console.log(line(cols.map(c => cell(r[c]))));
    console.log(`${j.rows.length}${j.truncated ? '+' : ''} row(s), ${j.ms} ms${j.graph ? '' : ' (graph patterns unavailable: SQL only)'}`);
  },
  async node() {
    if (pos[1] === 'add') {
      // a new instance (op:types.add): the app picks the document — the type's collection document — and says which
      const id = pos[2] || die('wye node add <type>:<slug> [--title "…"] [--doc project/doc]'); const [kind, ...rest] = id.split(':'); const slug = rest.join(':');
      if (!kind || !slug) die('the id is <type>:<slug>, e.g. city:london');
      const j = await api('POST', `/api/${product()}/types/${kind}`, { slug, title: flags.title || '', home: flags.doc || undefined });
      return out(flags.json ? j : `${j.id} added to ${j.doc ? `${j.doc.title} (${j.doc.project}/${j.doc.doc}${j.created ? ', new — the home of every ' + kind + ' from now on' : ''})` : j.file}`);
    }
    if (pos[1] === 'content') {
      // the node's content (req:ontology.content): read as markdown of its own, or replaced from --file / stdin
      const id = pos[2] || die('wye node content <id> [--file f]');
      const text = flags.file ? fs.readFileSync(flags.file, 'utf8') : await readStdin();
      if (!flags.file && !text) { const j = await api('GET', `/api/${product()}/node/${encodeURIComponent(id)}/content`); return out(flags.json ? j : j.content); }
      const cur = await api('GET', `/api/${product()}/node/${encodeURIComponent(id)}/content`);
      const j = await api('PUT', `/api/${product()}/node/${encodeURIComponent(id)}/content`, { content: text, ifMatch: cur.bodyHash });
      return out(flags.json ? j : `${cur.file}: content of ${id} written${j.lintOk ? '' : ' — check: ' + j.lintErrors.join(' · ')}`);
    }
    if (pos[1] === 'set') {
      const id = pos[2] || die('wye node set <id> …'); const props = {};
      for (const kv of list(flags.set)) { const i = kv.indexOf('='); if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1); }
      for (const k of list(flags.unset)) props[k] = null;
      const patch = { ...(flags.status ? { status: flags.status } : {}), ...(flags.text ? { text: flags.text } : {}), ...(Object.keys(props).length ? { props } : {}) };
      const j = await api('PUT', `/api/${product()}/node/${encodeURIComponent(id)}`, patch);
      out(flags.json ? j : `${j.file}: ${j.line}`);
      return;
    }
    const id = pos[1] || die('wye node <id>'); const j = await api('GET', `/api/${product()}/node/${encodeURIComponent(id)}`);
    if (flags.json) return out(j);
    console.log(`${j.node.id} [${j.node.kind}${j.node.status ? ', ' + j.node.status : ''}] ${j.node.file}:${j.node.line}\n${j.node.body}`);
    for (const [v, ids] of j.relations.out) console.log(`  ${v} → ${ids.join(', ')}`); for (const [v, ids] of j.relations.inc) console.log(`  ← ${v}: ${ids.join(', ')}`);
  },
  async type() {
    if (pos[1] !== 'add') die('wye type add <slug> [--extends parent] [--purpose "…"] [--doc product/project/doc]');
    const slug = pos[2] || die('wye type add <slug>'); const p = product();
    const body = { slug, extends: flags.extends || 'node', purpose: flags.purpose || '' };
    if (flags.doc) { const d = docRef(flags.doc); body.doc = `data/products/${d.product}/projects/${d.project}/${d.doc.startsWith('~') ? `.wye/${d.doc.slice(1)}` : `docs/${d.doc}`}.md`; body.project = d.project; } // the route wants the repo-relative file
    const j = await api('POST', `/api/${p}/types`, body);
    return out(flags.json ? j : `type:${slug} added to ${j.file} (proposed — properties: wye node set or the type page ${WF_URL}/${p}/types/${slug})`);
  },
  async packet() {
    // the constraint packet (op:api.packet): what governs a text and/or ids — complete, not a top-k; ended nodes hidden
    const text = flags.for !== undefined ? String(flags.for) : (pos[1] || (await readStdin()));
    const refs = list(flags.ref); if (!text.trim() && !refs.length) die('wye packet --for "<text>" [--ref id ...] [--budget N] [--all | --as-of d]');
    const j = await api('POST', `/api/${product()}/packet`, { text, refs, budget: flags.budget ? Number(flags.budget) : undefined, all: !!flags.all, asOf: flags['as-of'] || undefined });
    if (flags.json) return out(j);
    console.log(`# Constraints in force: ${text.trim().slice(0, 80) || refs.join(', ')}\n\n${j.markdown}`);
  },
  async verdicts() {
    // the verdict pass for nodes, now (op:api.verdicts): how each relates to its neighbours; non-consistent verdicts land under the node
    const ids = pos.slice(1); if (!ids.length) die('wye verdicts <id ...> [--json]');
    const j = await api('POST', `/api/${product()}/verdicts`, { ids });
    if (flags.json) return out(j);
    const order = { contradicts: 0, duplicate: 1, refines: 2, consistent: 3 };
    for (const v of [...j.verdicts].sort((x, y) => order[x.kind] - order[y.kind])) console.log(`${v.kind.padEnd(11)} ${v.b} ↔ ${v.a}${v.conflict ? ' [' + v.conflict + ']' : ''} — ${v.reason}${v.cached ? '  (cached)' : ''}`);
    console.log(`${j.judged} pair(s) judged, ${j.written} line(s) written under the node(s)`);
  },
  async impact() {
    // the impact set of a hypothetical edit (op:api.impact, req:exec.impact-for-agents): candidates with paths, then verdicts
    const id = pos[1] || die('wye impact <id> --after "<new text>"'); const after = flags.after !== undefined ? String(flags.after) : (await readStdin());
    if (!after.trim()) die('--after "<new text>" (or the new text on stdin) is required');
    const j = await api('POST', `/api/${product()}/impact`, { id, after, judge: !flags['no-judge'] });
    if (flags.json) return out(j);
    const order = { contradicts: 0, rework: 1, update: 2, ask: 3, unaffected: 4, undefined: 5 };
    console.log(`# impact of an edit to ${id}: ${j.candidates.length} candidate(s)\n`);
    for (const c of [...j.candidates].sort((a, b) => order[a.verdict] - order[b.verdict])) console.log(`${(c.verdict || 'unjudged').padEnd(11)} ${c.id}  ${c.via === 'text' ? 'by text' : c.path}${c.reason ? ' — ' + c.reason : ''}${c.update && c.update.text ? '\n            proposed: ' + c.update.text : ''}${c.question ? '\n            question: ' + c.question : ''}`);
    if (j.candidates.some(c => c.verdict && c.verdict !== 'unaffected')) console.log('\nList the updates you make and the tasks you leave (wye work add) in your summary.');
  },
  async ask() {
    const q = pos.slice(1).join(' ') || (await readStdin()); if (!q.trim()) die('wye ask "<question>" [--fast | --deep] [--json]');
    const lanes = flags.fast ? ['fast'] : flags.deep ? ['deep'] : ['fast', 'deep'];
    const r = await fetch(`${WF_URL}/api/${product()}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, lanes }) });
    if (!r.ok) die(`ask → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const res = { fast: '', deep: '', citations: new Map(), cut: false, errors: [] };
    const show = !flags.json; let section = '';
    const head = s => { if (show && section !== s) { section = s; process.stdout.write(`\n\n## ${s}\n`); } };
    let buf = '';
    for await (const d of r.body) {
      buf += Buffer.from(d).toString('utf8'); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = block.split('\n').find(l => l.startsWith('data: ')); if (!data) continue;
        const e = JSON.parse(data.slice(6));
        if (e.type === 'fast.delta') { head('Answer'); res.fast += e.text; if (show) process.stdout.write(e.text); }
        else if (e.type === 'found') { res.citations.set(e.citation.n, e.citation); if (show) process.stderr.write(`  · found [${e.citation.n}] ${e.citation.ref}\n`); }
        else if (e.type === 'step') { if (show) process.stderr.write(`  … ${e.text}\n`); }
        else if (e.type === 'deep.delta') { head('Deeper answer'); res.deep += e.text; if (show) process.stdout.write(e.text); }
        else if (e.type === 'fast.done' || e.type === 'deep.done') { for (const c of e.citations) res.citations.set(c.n, c); if (e.cut) res.cut = true; }
        else if (e.type === 'error') { res.errors.push(e); if (show) process.stderr.write(`  ! ${e.lane}: ${e.message}\n`); }
      }
    }
    const cites = [...res.citations.values()].sort((a, b) => a.n - b.n);
    if (flags.json) return out({ fast: res.fast, deep: res.deep, citations: cites, cut: res.cut, errors: res.errors });
    if (res.cut) console.log('\n\n(the deep search was cut short at its limit)');
    console.log(`\n\n## Sources\n${cites.map(c => `[${c.n}] ${c.ref}${c.href ? `  ${WF_URL}${c.href}` : ''}`).join('\n')}`);
  },
  async 'ask-search'() {
    const q = pos.slice(1).join(' ') || (await readStdin()); if (!q.trim()) die('wye ask-search "<words>" [--source s] [--limit n] [--expand] [--rerank]');
    const sp = new URLSearchParams({ q, limit: String(flags.limit || 12) }); if (flags.source) sp.set('source', list(flags.source).join(',')); if (flags.expand) sp.set('expand', '1'); if (flags.rerank) sp.set('rerank', '1');
    const j = await api('GET', `/api/${product()}/search?${sp}`);
    if (flags.json) return out(j);
    for (const h of j.hits) console.log(`${h.id}${h.via ? `  (via ${h.via})` : ''}\n    ${h.title} — ${h.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    if (j.degraded) console.log(`(${j.degraded}: full-text search only)`);
  },
  async context() {
    const text = pos[1] || (await readStdin()); const j = await api('POST', `/api/${product()}/context`, { text, limit: Number(flags.limit || 10), all: !!flags.all, asOf: flags['as-of'] || undefined });
    if (flags.json) return out(j);
    for (const h of j.hits) console.log(`${Math.round(h.score * 100).toString().padStart(3)}%  ${h.id}  ${h.snippet.slice(0, 100)}`);
    if (j.hidden) console.log(`(${j.hidden} superseded / retired / archived hidden — --all or --as-of <date> shows them)`);
  },
  async inbox() {
    const p = product();
    if (pos[1] === 'add') {
      const fields = {}; for (const k of ['context', 'choice', 'alternatives', 'consequences', 'when', 'then', 'unless', 'statement', 'source', 'q']) if (flags[k]) fields[k] = String(flags[k]);
      const text = pos[2] || (process.stdin.isTTY ? '' : await readStdin());
      if (!flags.title && !text && !Object.keys(fields).length) die('wye inbox add --type t --title "…" [fields] (or body on stdin)');
      const j = await api('POST', `/api/${p}/inbox`, { type: flags.type || 'note', title: flags.title || '', text, from: flags.from || (env('SESSION') ? `agent session ${env('SESSION')}` : 'agent'), refs: list(flags.ref), session: flags.session || env('SESSION'), fields });
      return out(flags.json ? j : `inbox: ${j.name} (waiting for review at ${WF_URL}/${p}/inbox)`);
    }
    const j = await api('GET', `/api/${p}/inbox`); if (flags.json) return out(j);
    for (const i of j.items.filter(i => flags.all || i.status === 'new')) {
      const im = i.impact && i.impact.candidates.length ? `  [${i.impact.candidates.map(c => `${c.verdict} ${c.id}`).join(', ')}]` : '';
      console.log(`${i.status.padEnd(9)} ${(i.raw ? 'raw' : i.type).padEnd(11)} ${i.added.slice(0, 16)}  ${i.title}${i.node ? '  → ' + i.node : ''}${i.session ? '  (session ' + i.session + ')' : ''}${im}`);
    }
    return;
  },
  // wye remember: the person's words as they were said (a request, a brief, a correction, a pasted document) kept in
  // the inbox, and digested at once by a Remember session (decision:waterfall.raw-request-to-inbox-then-digest)
  async remember() {
    const p = product();
    const text = flags.file ? fs.readFileSync(flags.file, 'utf8') : (pos[1] || await readStdin());
    if (!text.trim()) die('wye remember [--title "…"] [--ref id ...] [--file f]  (the person\'s words on stdin or as the argument)');
    const j = await api('POST', `/api/${p}/inbox`, { type: 'note', title: flags.title || '', text, from: flags.from || (env('SESSION') ? `agent session ${env('SESSION')}` : 'agent'), refs: list(flags.ref), session: env('SESSION'), digest: true });
    if (flags.json) return out(j);
    console.log(`inbox: ${j.name}${j.session ? ` — digested by session ${j.session} (${WF_URL}/${p}/sessions/${j.session})` : ` — kept, not digested${j.error ? `: ${j.error}` : ''}`}`);
    const im = j.impact;
    if (!im) console.log('impact: not judged');
    else if (!im.candidates.length) console.log(`impact: none on what is known (${im.judged} closest block${im.judged === 1 ? '' : 's'} judged)`);
    else for (const c of im.candidates) console.log(`impact: ${c.verdict.padEnd(11)} ${c.id} — ${c.question || c.reason}`);
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
    if (sub === 'join') {
      const runner = flags.name || `${os.userInfo().username}@${os.hostname().split('.')[0]}`;
      const j = await api('POST', `/api/${p}/sessions`, { join: true, agent: flags.agent || 'claude-code', instruction: pos[2] || '', runner, refs: list(flags.ref) });
      if (flags.json) return out(j);
      // the export line alone on stdout, so it can be eval'ed; the words for the person on stderr
      console.error(`joined ${p} as session ${j.id} (${runner}) — finish with: wye session done ${j.id}`);
      return console.log(`export WYE_SESSION=${j.id}`);
    }
    if (!id) die(`wye session ${sub} <id>`);
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
    if (sub === 'open') { const target = pos[3] || die('wye session open <id> <product/project/doc[#node] | url>'); const j = await api('PATCH', `/api/${p}/sessions/${id}`, { open: target }); return out(flags.json ? j : `opened ${j.path}${j.live ? '' : ' (no live console — logged only)'}`); }
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
  async propose() {
    // one proposed block (op:api.propose): the card on stdin or --file; the home document first, else the plan
    const p = product(); const doc = pos[1] && !pos[1].startsWith('--') ? pos[1] : '';
    const card = flags.file ? fs.readFileSync(flags.file, 'utf8') : await readStdin();
    const prRef = flags.pr || flags.plan; // --plan is the old name
    if (!card.trim()) die('wye propose [<product/project/doc>] --pr <product/project/pr-x>  (the yaml card on stdin or --file f)');
    if (!doc && !prRef) die('--pr <product/project/pr-x> is required when no document is given');
    const body = { card, pr: prRef || undefined, doc: doc ? (() => { const d = docRef(doc); return `${d.product}/${d.project}/${d.doc}`; })() : undefined };
    const j = await api('POST', `/api/${p}/propose`, body);
    return out(flags.json ? j : `${j.id} proposed in ${j.file}${j.pr ? ` — embedded on ${j.pr}'s Definition` : ''}${doc ? '' : ' (no home document yet: on the plan under Definition)'}`);
  },
  // wye init: a product's (or a feature's) definition from its code, shallow, with the describe tasks (lib/init.js)
  async init() {
    if (!flags.product) return commands.initHere();
    const p = flags.product;
    const repo = flags.repo || die('--repo <dir> — the code the product is read from');
    const { init } = require('../lib/init.js');
    const dataRoot = path.join(require('./wye-home.js').ensureHome(), 'data');
    const r = init({ dataRoot, product: p, title: flags.title, project: flags.project, repo, feature: flags.feature, path: flags.path, icon: flags.icon, description: flags.description });
    if (flags.json) return out({ ...r.made, areas: r.areas.map(a => ({ dir: a.dir, slug: a.slug, files: a.files.length })), project: r.project });
    console.log(`${r.made.written.length} page(s) written under ${path.join(dataRoot, 'products', p, 'projects', r.project, 'docs')}${r.made.skipped.length ? ` (${r.made.skipped.length} existed and were kept)` : ''}`);
    console.log(`scanned ${r.made.counts.files} files: ${r.areas.length} modules, ${r.made.counts.pages} pages, ${r.made.counts.components} components, ${r.made.counts.ops} operations, ${r.made.counts.tests} tests`);
    for (const a of r.areas) console.log(`  ${a.slug.padEnd(20)} ${String(a.files.length).padStart(5)} files  ${a.dir}`);
    const root = path.join(dataRoot, 'products', p);
    console.log(`\nnext: wye build --root ${root} && wye check --root ${root} --repo ${repo}\n      open it in the app, then wye deepen <module> --product ${p}   (or let a runner take the #ready tasks)`);
    console.log(`\nquick start → ${WF_URL}/${p}/start`);
  },
  // wye init [folder]: a vault for the current folder (req:wf2.vault-init, lib/vault.js) — its own knowledge in .wye/
  // beside the code, linked to the vault above and the ones below; written here, then opened in the app when it runs
  async initHere() {
    const folder = path.resolve((pos[1] || '.').replace(/^~(?=$|\/)/, os.homedir()));
    let v; try { v = require('../lib/vault.js').initVault({ folder, slug: flags.slug, title: flags.title, icon: flags.icon, description: flags.description }); } catch (e) { die(`init: ${e.message.replace(/^\w+: /, '')}`); }
    let opened = null, why = '';
    try { opened = await api('POST', '/api/products/open', { folder: v.dir }); } catch (e) { why = e.cause ? 'the app is not running' : e.message; }
    if (flags.json) return out({ existing: v.existing, folder: v.folder, dir: v.dir, slug: v.slug, product: opened ? opened.slug : null, parent: v.parent || null, children: v.children || [], linked: v.linked || [], written: v.made ? v.made.written : [], skipped: v.made ? v.made.skipped : [] });
    const there = opened ? `${WF_URL}/${opened.slug}` : `not opened in the app (${why}) — wye open ${v.folder}`;
    if (v.existing) { const w = v.made.written.map(f => path.relative(v.folder, f)); console.log(`this folder already has its knowledge: ${v.dir}  (vault ${v.slug}) — ${w.length ? `the note to agents brought up to date in ${w.join(', ')}` : 'nothing was written'}\n${there}`); return; }
    const relTo = f => path.relative(v.folder, f) || '.';
    console.log(`vault ${v.slug} → ${v.dir}`);
    console.log(`${v.made.written.length} file(s) written${v.made.skipped.length ? ` (${v.made.skipped.length} existed and were kept)` : ''}; scanned ${v.made.counts.files} files: ${v.areas.length} modules, ${v.made.counts.pages} pages, ${v.made.counts.components} components, ${v.made.counts.ops} operations, ${v.made.counts.tests} tests`);
    console.log(`parent: ${v.parent ? relTo(v.parent) : 'none above this folder'}${v.children.length ? `\nchildren: ${v.children.map(relTo).join(', ')}` : ''}${v.linked.length ? `\nlinks updated in: ${v.linked.map(f => path.join(relTo(f), '.wye/_product.md')).join(', ')}` : ''}`);
    console.log(`agents working here are sent to it by AGENTS.md / CLAUDE.md; its own instructions: ${path.join(v.dir, '_agent.md')}`);
    if (opened && opened.slug !== v.slug) console.log(`note: another product is already called ${v.slug} on this machine — the app shows this vault as ${opened.slug}; use --product ${opened.slug} with the CLI`);
    console.log(`\n${there}${opened ? `\nnext: wye deepen <module> --product ${opened.slug}   (or let a runner take the #ready tasks)` : ''}`);
  },
  // wye deepen <module>: assign the module's describe task to a worker with the describe contract (prompts/describe-module.md)
  async deepen() {
    const mod = pos[1] || die('wye deepen <module> --product p [--worker claude-code|codex|runner] [--project main]');
    const p = product(); const proj = flags.project || (await api('GET', `/api/${p}/projects`)).main || die(`${p} has no project`);
    const id = `task:${proj}.describe.${mod}`;
    let contract = ''; try { contract = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'describe-module.md'), 'utf8'); } catch { /* the task text carries the gist */ }
    const j = await api('POST', `/api/${p}/work/assign`, { id, worker: flags.worker || 'claude-code', note: contract, force: !!flags.force, by: flags.by || undefined });
    return out(flags.json ? j : `${id} → ${j.worker}${j.session ? ` (session ${j.session}, ${j.mode})` : ''} — the worker reads the code and writes the requirements mapped to it`);
  },
  async pr() {
    if (pos[1] === 'build') {
      // Build from the CLI (rule:build, req:exec.build-from-definition): the request's task goes to a worker with the
      // Definition as context — the person's move, never the librarian's
      const ref = pos[2] || die('wye pr build <product/project/pr-x> [--worker claude-code|codex|runner] [--note "…"] [--force]');
      const d = docRef(ref); const p = d.product; const r = `${d.product}/${d.project}/${d.doc}`;
      const pr = await api('GET', `/api/${p}/pr?ref=${encodeURIComponent(r)}`);
      if (!pr.task) die(`${r} has no request task to build`);
      const df = pr.definition || {};
      const j = await api('POST', `/api/${p}/work/assign`, { id: pr.task, worker: flags.worker || 'claude-code', note: flags.note || '', build: r, force: !!flags.force, by: flags.by || (env('SESSION') ? `agent:${env('SESSION')}` : undefined) });
      return out(flags.json ? j : `${r} → building: ${pr.task} → ${j.worker}${j.session ? ` (session ${j.session}, ${j.mode})` : ''}; definition ${df.total ?? '?'} block(s), ${df.agreed ?? '?'} agreed${df.defined ? '' : ` — ${df.open ?? '?'} still open, built anyway`}`);
    }
    if (pos[1] === 'revisit') {
      const ref = pos[2] || die('wye pr revisit <product/project/pr-x>'); const d = docRef(ref); const r = `${d.product}/${d.project}/${d.doc}`;
      const j = await api('PATCH', `/api/${d.product}/pr`, { ref: r, action: 'revisit' });
      return out(flags.json ? j : `${r}: ${j.mode === 'told' ? 'its librarian was asked to revisit it' : 'a librarian is revisiting it'} (session ${j.session}) — ${WF_URL}/${d.product}/${d.project}/d/${d.doc}`);
    }
    // approve / cancel from the CLI — the person's move (a librarian never runs these)
    if (pos[1] === 'approve' || pos[1] === 'cancel' || pos[1] === 'reopen') {
      const ref = pos[2] || die(`wye pr ${pos[1]} <product/project/pr-x>`); const d = docRef(ref); const p = d.product;
      const j = await api('PATCH', `/api/${p}/pr`, { ref: `${d.product}/${d.project}/${d.doc}`, action: pos[1], by: flags.by || undefined });
      return out(flags.json ? j : `${d.product}/${d.project}/${d.doc}: ${j.status}${j.stopped?.length ? ` (refining session ${j.stopped.join(', ')} stopped)` : ''}`);
    }
    const ref = pos[1] || die('wye pr <product/project/pr-x> [--status s] | wye pr approve|cancel|reopen <ref>'); const d = docRef(ref); const p = d.product;
    const r = `${d.product}/${d.project}/${d.doc}`;
    if (flags.status) { const j = await api('PATCH', `/api/${p}/pr`, { ref: r, status: flags.status }); return out(flags.json ? j : `${r}: status ${j.status}`); }
    const j = await api('GET', `/api/${p}/pr?ref=${encodeURIComponent(r)}`); if (flags.json) return out(j);
    const df = j.definition;
    console.log(`${j.label ?? j.node}  ${j.status}${j.role === 'librarian' ? '  (librarian)' : ''}${j.task ? '  task ' + j.task : ''}  session ${j.session}`);
    console.log(`definition: ${df.total} block(s), ${df.agreed} agreed, ${df.open} open${df.missing ? `, ${df.missing} missing` : ''}${df.contradicted.length ? `, contradicted: ${df.contradicted.join(', ')}` : ''}`);
    const rd = j.readiness; if (rd) console.log(`readiness: ${['definition', 'agreed', 'impact', 'contradictions', 'tasks'].map(k => `${rd[k] ? '✓' : '✗'} ${k}`).join(' · ')} — ${rd.ok ? 'ready to approve' : 'not ready'}${j.approvedBy ? ` · approved by ${j.approvedBy} ${j.approvedAt ?? ''}` : ''}`);
    for (const it of df.items) console.log(`  ${it.agreed ? '✓' : it.missing ? '?' : '·'} ${it.id}${it.status ? ' #' + it.status : ''}`);
  },
  // `plan` is the old name of `pr`
  async plan() { console.error('wye plan is now wye pr'); return commands.pr(); },
  // `workflows` reads like `skills`: the list
  async workflows() { pos[1] = pos[1] || 'list'; return commands.workflow(); },
  // the system library and installs (lib/install.ts): one function per op behind the routes, so the app and wye agree
  async packages() {
    const j = await api('GET', `/api/system/packages${flags.product || env('PRODUCT') ? `?product=${flags.product || env('PRODUCT')}` : ''}`);
    if (flags.json) return out(j);
    if (!j.packages.length) return console.log('the system library has no packages');
    const names = xs => xs.map(x => x.id).join(', ') || '—';
    for (const p of j.packages) {
      console.log(`${p.slug} — ${p.title}${p.installedIn ? `  (installed in: ${p.installedIn.join(', ') || 'none'})` : ''}${p.description ? `
  ${p.description}` : ''}`);
      console.log(`  skills: ${names(p.skills)}
  workflows: ${names(p.workflows)}
  hooks: ${p.hooks.map(h => `${h.id} (on ${h.on}${h.agent ? ', starts an agent session' : ''})`).join(', ') || '—'}
  templates: ${names(p.templates)}
  types: ${names(p.types)}`);
    }
  },
  async install() {
    const pkg = pos[1] || die('wye install <package> --product p --project x [--dry-run] [--create-product "<title>"]');
    const p = product(); const proj = flags.project || die('--project <slug> is required');
    const by = flags.by || (env('SESSION') ? `agent:${env('SESSION')}` : os.userInfo().username);
    const create = typeof flags['create-product'] === 'string' ? flags['create-product'] : undefined;
    const j = await api('POST', `/api/${p}/${proj}/packages`, { package: pkg, dryRun: !!flags['dry-run'], by, createProduct: create });
    if (flags.json) return out(j);
    const head = j.dryRun ? `${pkg} (${j.title}) would put into ${p}/${proj}${j.createProduct ? ` — a new product "${j.createProduct}"` : ''}:` : `${pkg} installed in ${p}/${proj}${j.createProduct ? ` (new product "${j.createProduct}")` : ''}:`;
    console.log(head);
    for (const [k, xs] of [['skills', j.skills], ['workflows', j.workflows], ['templates', j.templates]]) console.log(`  ${k}: ${xs.map(x => `${x.id} — ${x.title}`).join('; ') || '—'}`);
    console.log(`  hooks: ${j.hooks.map(h => `${h.id} on ${h.on}${h.agent ? ' (starts an agent session)' : ''}`).join('; ') || '—'}`);
    console.log(`  types: ${j.types.map(t => `${t.id} ${t.there ? '(already there — kept)' : j.dryRun ? '(new)' : '(declared)'}`).join('; ') || '—'}`);
    if (j.dryRun) console.log('nothing written — run it again without --dry-run to install');
    else console.log(`record: ${p}/${proj}/.wye/packages.yaml${j.typesFile ? ` · types in ${path.relative(process.cwd(), j.typesFile)}` : ''} · ${WF_URL}/${p}/${proj}`);
  },
  async uninstall() {
    const pkg = pos[1] || die('wye uninstall <package> --product p --project x');
    const p = product(); const proj = flags.project || die('--project <slug> is required');
    const j = await api('DELETE', `/api/${p}/${proj}/packages/${pkg}`);
    if (flags.json) return out(j);
    console.log(`${pkg} uninstalled from ${p}/${proj}${j.removedTypes.length ? ` — types removed: ${j.removedTypes.join(', ')}` : ''}`);
    for (const w of j.warnings) console.log(`warn  ${w}`);
  },
  async skills() {
    // the product's skills (op:api.skills): documents under the Skills page, the shipped prompts among them
    const j = await api('GET', `/api/${product()}/skills`);
    if (flags.json) return out(j);
    if (!j.skills.length) return console.log('no skills — open the product in the app once: the base skills are written then');
    for (const s of j.skills) console.log(`${s.id.padEnd(28)} ${s.role.padEnd(10)} ${(s.takes ? 'on ' + s.takes : '').padEnd(12)} ${s.title}${s.status && s.status !== 'active' ? ` [${s.status}]` : ''}`);
  },
  async skill() {
    if (!pos[1]) die('wye skill <id>');
    const j = await api('GET', `/api/${product()}/skills?id=${encodeURIComponent(pos[1])}`);
    if (flags.json) return out(j);
    console.log(`# ${j.title} (${j.id}) — ${j.role}${j.takes ? `, on ${j.takes}` : ''}${j.doc ? `\n_${j.doc}_` : ''}\n\n${j.body}`);
  },
  async hooks() {
    // one tick of the clock (op:api.hooks-tick): each time hook whose slot moved, fired or only recorded
    if (pos[1] === 'tick') {
      const j = await api('POST', `/api/${product()}/hooks/tick`, flags.now ? { now: flags.now } : {});
      if (flags.json) return out(j);
      if (!j.ticks.length) return console.log(`${j.now}: no time hook is due`);
      for (const t of j.ticks) console.log(`${t.slot.slice(0, 16).replace('T', ' ')}Z ${t.hook} on ${t.node}: ${t.skipped ? `recorded, not fired (${t.skipped})` : t.firings.length ? t.firings.map(f => f.actions.map(a => a.error ? `${a.kind} failed — ${a.error}` : `${a.kind}${a.added?.length ? ' ' + a.added.join(', ') : ''}${a.session ? ` → session ${a.session}` : ''}`).join('; ')).join(' | ') : 'nothing fired'}`);
      return;
    }
    // the hooks and their firings (op:api.hooks)
    const j = await api('GET', `/api/${product()}/hooks${flags.node ? `?node=${encodeURIComponent(flags.node)}` : ''}`);
    if (flags.json) return out(j);
    if (!j.on) console.log('hooks are off (WF_HOOKS=0)');
    if (!j.hooks.length) console.log('no hooks — add cards to the Hooks document');
    for (const h of j.hooks) console.log(`${h.id.padEnd(30)} ${h.status.padEnd(7)} on ${h.on}${Object.keys(h.where).length ? ' where ' + Object.entries(h.where).map(([k, v]) => `${k}=${v}`).join(' ') : ''} → ${h.actions.map(a => a.kind === 'run' ? `run ${a.skill}` : a.kind === 'add' ? `add ${a.template}${a.to ? ' to ' + a.to : ''}` : a.kind).join('; ')}${h.once ? '' : ' (every time)'} · fired ${h.firings}×`);
    if (j.firings.length) { console.log(''); for (const f of j.firings) console.log(`${f.at.slice(0, 16).replace('T', ' ')} ${f.hook} on ${f.node} (${f.event})${f.depth ? ` depth ${f.depth}` : ''}: ${f.actions.map(a => a.error ? `${a.kind} failed — ${a.error}` : `${a.kind}${a.added?.length ? ' ' + a.added.join(', ') : ''}${a.session ? ` → session ${a.session}` : ''}`).join('; ')}`); }
  },
  // The workflows of a product and one run of one (decision:wf2.workflow-is-a-skill, decision:wf2.run-holds-the-state):
  // a workflow is a skill with stages, a run is a card that says where it got to; readiness is computed per request.
  async workflow() {
    const sub = pos[1] || 'list';
    if (sub === 'run') {
      const id = pos[2] || die('wye workflow run <workflow:id> --on <node>');
      const on = flags.on || die('--on <node|document node id> is required');
      const j = await api('POST', `/api/${product()}/workflows`, { workflow: id.startsWith('workflow:') ? id : `workflow:${id}`, on, again: !!flags.again });
      return out(flags.json ? j : `${j.run} started on ${on}`);
    }
    const j = await api('GET', `/api/${product()}/workflows`);
    if (flags.json) return out(j);
    if (!j.workflows.length) return console.log("no workflows — add a workflow-<slug>.md under the project's Skills page");
    for (const w of j.workflows) {
      if (sub === 'show' && w.id !== pos[2] && w.id !== `workflow:${pos[2]}`) continue;
      console.log(`${w.id.padEnd(28)} ${w.status.padEnd(7)} on ${(w.takes.join(', ') || '*').padEnd(20)} ${w.stages.length} stages  ${w.title}`);
      if (sub === 'show') for (const st of w.stages) console.log(`  ${st.id.padEnd(26)} ${st.gate.padEnd(7)} ${(st.produces.join(', ') || '–').padEnd(22)} until ${st.until.map(u => u.kind).join(', ') || '–'}`);
      for (const b of w.bad) console.log(`  ! ${b} — not a criterion this engine knows`);
    }
  },
  async run() {
    const sub = pos[1] || 'list';
    if (['advance', 'skip', 'reopen', 'retry', 'cancel'].includes(sub)) {
      const id = pos[2] || die(`wye run ${sub} <run:id>${sub === 'reopen' ? ' --stage <stage:id>' : ''}`);
      const j = await api('POST', `/api/${product()}/runs`, { run: id.startsWith('run:') ? id : `run:${id}`, action: sub, stage: flags.stage });
      return out(flags.json ? j : `${id} ${sub === 'advance' ? 'advanced' : sub === 'skip' ? 'skipped' : sub + 'ed'}${j.stage ? ` → ${j.stage}` : ''}${j.status ? ` (${j.status})` : ''}`);
    }
    const j = await api('GET', `/api/${product()}/runs`);
    if (flags.json) return out(j);
    if (!j.runs.length) return console.log('no runs — wye workflow run <id> --on <node>');
    for (const r of j.runs) {
      if (sub === 'show' && r.id !== pos[2] && r.id !== `run:${pos[2]}`) continue;
      console.log(`${r.id.padEnd(22)} ${r.status.padEnd(9)} ${r.workflowTitle.padEnd(14)} on ${r.on.padEnd(28)} ${r.stageTitle} (${r.step}/${r.of})`);
      if (sub !== 'show') continue;
      for (const row of r.readiness.rows) console.log(`  ${row.ok ? '✓' : '·'} ${row.label}${row.blocking.length ? ` — ${row.blocking.join(', ')}` : ''}`);
      if (r.produced.length) console.log(`  produced: ${r.produced.join(', ')}`);
      for (const l of r.log) console.log(`  · ${l}`);
    }
  },
  // wye import <file|dir> --product p [--project x] [--parent doc] [--no-analyse]   markdown files as documents (the tree
  // kept), then hook:import-analyse hands each to an agent with skill:import unless --no-analyse (req:wf2.import.markdown);
  // wye import --code <dir> --name "<feature>" --product p [--no-analyse]   a feature's definition read from its code, the
  // describe tasks handed to an agent with skill:describe-module (req:wf2.import.code)
  async import() {
    if (/\.(wye\.)?tgz$|\.tar\.gz$/.test(pos[1] || '') && !flags.product) return commands.importProduct();
    const p = product();
    if (flags.code) {
      const name = flags.name || die('wye import --code <dir> --name "<feature>" --product p [--no-analyse]');
      const j = await api('POST', `/api/${p}/import-code`, { name, path: String(flags.code), project: flags.project, parent: flags.parent, analyse: !flags['no-analyse'], brief: flags.brief ? String(flags.brief) : undefined });
      if (flags.json) return out(j);
      console.log(`${j.node} — page ${p}/${j.project}/${j.slug} with ${j.task}${j.session ? `, handed to an agent (session ${j.session}); the definition lands on the page as proposed blocks` : j.error ? `; not handed to an agent: ${j.error}` : ''}`);
      return;
    }
    const src = pos[1] || die('wye import <file|dir> --product p [--project x] [--parent doc] [--no-analyse]  |  wye import --code <dir> --name "…"');
    const proj = flags.project || (await api('GET', `/api/${p}/projects`)).main || die(`${p} has no project to import into`);
    const abs = path.resolve(String(src));
    const st = fs.statSync(abs);
    const files = [];
    const walk = (dir, rel) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules') continue; const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (/\.(md|markdown|png|jpe?g|gif|webp|svg)$/i.test(e.name)) files.push({ rel: r, abs: path.join(dir, e.name) }); } };
    if (st.isDirectory()) walk(abs, ''); else files.push({ rel: path.basename(abs), abs });
    if (!files.length) die(`nothing to import under ${abs}`);
    const fd = new FormData();
    for (const f of files) fd.append(f.rel, new Blob([fs.readFileSync(f.abs)]), f.rel);
    if (flags.parent) fd.append('parent', String(flags.parent));
    if (flags.brief) fd.append('brief', String(flags.brief));
    fd.append('analyse', flags['no-analyse'] ? '0' : '1');
    const r = await fetch(`${WF_URL}/api/${p}/${proj}/import`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) die(`import → ${r.status}: ${j.message || j.error}`);
    if (flags.json) return out(j);
    const docs = j.docs.filter(d => !d.folder);
    console.log(`${docs.length} document(s) imported into ${p}/${proj}${j.docs.length > docs.length ? ` (${j.docs.length - docs.length} folder page(s))` : ''}${j.assets.length ? `, ${j.assets.length} image(s)` : ''}${j.analyse ? ' — an agent analyses each; its blocks arrive in the Inbox as proposed' : ' — not analysed (Analyse on each page)'}`);
    for (const d of docs) console.log(`  ${d.slug.padEnd(32)} ${d.title}${d.from ? `  ← ${d.from}` : ''}`);
    for (const x of j.skipped) console.log(`  skipped ${x.path}: ${x.reason}`);
  },
  async ea() {
    // the executive assistant (task:ea.cli-intake, task:ea.commitment-tracking, req:ea.daily-brief) — op:api.ea-*
    const sub = pos[1]; const p = product();
    if (sub === 'intake') {
      const text = flags.file ? fs.readFileSync(String(flags.file), 'utf8') : await readStdin();
      if (!text.trim()) die('wye ea intake --product ea --file <analysis.json> (or the JSON on stdin)');
      let analysis; try { analysis = JSON.parse(text); } catch (e) { die(`the analysis is not JSON: ${e.message}`); }
      const j = await api('POST', `/api/${p}/ea/intake`, { analysis, ...(flags.project ? { project: flags.project } : {}) });
      if (flags.json) return out(j);
      if (j.meeting) console.log(`${j.meeting}${j.meetingCreated ? ' (new)' : ' (already filed)'}`);
      if (j.messages) {   // Slack threads and emails waiting on the director (decision:ea.messages-pushed)
        for (const id of j.messages.created) console.log(`  waiting  ${id}${j.messages.answered.includes(id) ? ' (answered)' : ''}`);
        for (const id of j.messages.updated) console.log(`  updated  ${id}${j.messages.answered.includes(id) ? ' (answered)' : ''}`);
        for (const n of j.messages.notes) console.log(`  note     ${n}`);
        if (!j.meeting) return;
      }
      for (const id of j.created) console.log(`  created  ${id}`);
      for (const id of j.updates) console.log(`  update   ${id}`);
      for (const id of j.questions) console.log(`  question ${id}`);
      for (const n of j.inbox) console.log(`  inbox    ${n}`);
      for (const id of j.skipped) console.log(`  already  ${id}`);
      for (const n of j.notes) console.log(`  note     ${n}`);
      if (!j.created.length && !j.updates.length && !j.questions.length) console.log('  nothing new');
      return;
    }
    if (sub === 'suggest') {   // suggested actions (decision:ea.suggested-actions) — op:api.ea-suggest
      const what = pos[2];
      if (what === 'list' || !what) {
        const j = await api('GET', `/api/${p}/ea/suggest${flags.all ? '?all=1' : ''}`);
        if (flags.json) return out(j);
        if (!j.suggestions.length) return console.log('no open suggestions');
        for (const x of j.suggestions) console.log(`${x.id}  ${x.title}${x.about ? `  — about ${x.about}` : ''}  (${x.suggested}${x.status !== 'open' ? `, ${x.status}` : ''})\n    why: ${x.why}`);
        return;
      }
      if (what === 'add') {
        const title = pos.slice(3).join(' ').trim();
        if (!title || !flags.why) die('wye ea suggest add "<the action>" --why "<what makes it worth doing now>" [--about <id>] [--source daily|new-information]');
        const j = await api('POST', `/api/${p}/ea/suggest`, { action: 'add', title, why: String(flags.why), ...(flags.about ? { about: String(flags.about) } : {}), ...(flags.source ? { source: String(flags.source) } : {}) });
        return flags.json ? out(j) : console.log(`${j.renewed ? 'renewed' : 'suggested'}  ${j.id}`);
      }
      if (what === 'close') {
        const id = pos[3]; if (!id) die('wye ea suggest close <suggestion id> [--done] [--why "…"]   (dismissed unless --done)');
        const j = await api('POST', `/api/${p}/ea/suggest`, { action: 'close', id, how: flags.done ? 'done' : 'dismissed', ...(flags.why ? { reason: String(flags.why) } : {}) });
        return flags.json ? out(j) : console.log(`closed ${id}`);
      }
      die('wye ea suggest list [--all] | add "<action>" --why "…" [--about id] | close <id> [--done] [--why "…"]');
    }
    if (sub === 'digest') {   // the Digest's daily summary (decision:ea.digest-is-a-page) — op:api.ea-digest
      const what = pos[2];
      if (what === 'context') { const j = await api('GET', `/api/${p}/ea/digest${flags.date ? `?date=${flags.date}` : ''}`); return flags.json ? out(j) : console.log(j.markdown); }
      if (what === 'summary') {
        const text = flags.file ? fs.readFileSync(String(flags.file), 'utf8') : await readStdin();
        if (!text.trim()) die('wye ea digest summary --product ea --file <entry.md> (or the text on stdin) [--date YYYY-MM-DD]');
        const j = await api('POST', `/api/${p}/ea/digest`, { summary: text, ...(flags.date ? { date: flags.date } : {}) });
        return flags.json ? out(j) : console.log(`written: today's entry at the top of the Daily summary on ${j.doc}`);
      }
      die('wye ea digest context | summary --file <entry.md>  [--product ea] [--date YYYY-MM-DD]');
    }
    if (sub === 'commitment') {
      const op = pos[2]; const id = pos[3];
      if (!['move', 'met', 'drop'].includes(op) || !id) die('wye ea commitment move <id> --to YYYY-MM-DD --why "…" [--on d] | met <id> [--on d] | drop <id> --why "…"');
      if (op === 'move' && (!flags.to || flags.to === true)) die('wye ea commitment move <id> --to YYYY-MM-DD --why "…"');
      if ((op === 'move' || op === 'drop') && (!flags.why || flags.why === true)) die(`${op === 'move' ? 'a move' : 'dropping'} needs a reason: --why "…"`);
      const j = await api('POST', `/api/${p}/ea/commitment`, { op, id, ...(flags.to ? { to: String(flags.to) } : {}), ...(flags.why ? { why: String(flags.why) } : {}), ...(flags.on ? { on: String(flags.on) } : {}) });
      if (flags.json) return out(j);
      return out(`${id} ${op === 'move' ? `moved ${j.move.from} → ${j.move.to}` : op === 'met' ? `met on ${j.props['met-on']}` : 'dropped'}`);
    }
    if (sub === 'brief') {
      const kind = pos[2];
      if (!['daily', 'weekly', '1on1'].includes(kind)) die('wye ea brief daily|weekly|1on1 --product ea [--person person:ea.x] [--date YYYY-MM-DD] [--write]');
      if (kind === '1on1' && (!flags.person || flags.person === true)) die('wye ea brief 1on1 --person person:ea.<slug>');
      const j = await api('POST', `/api/${p}/ea/brief`, { kind, write: !!flags.write, ...(flags.date ? { date: String(flags.date) } : {}), ...(flags.person ? { person: String(flags.person) } : {}), ...(flags.project ? { project: String(flags.project) } : {}) });
      if (flags.json) return out(j);
      console.log(`# ${j.title}\n\n${j.markdown}`);
      if (j.doc) console.error(`written: ${j.doc} (${WF_URL}${j.link})`);
      if (j.skipped && j.skipped.length) console.error(`not read (no graph built): ${j.skipped.join(', ')}`);
      return;
    }
    die('wye ea intake | commitment move|met|drop | brief daily|weekly|1on1 — see wye help');
  },
  async explain() {
    // one librarian turn on a node or a text (req:exec.explain-anywhere, op:api.explain): the current state, nothing proposed
    const what = pos[1] || (await readStdin()); if (!what.trim()) die('wye explain <id | "text">');
    const j = await api('POST', `/api/${product()}/explain`, /^[a-z-]+:[A-Za-z0-9_.\-]+$/.test(what.trim()) ? { id: what.trim() } : { text: what });
    if (flags.json) return out(j);
    console.log(j.explanation);
  },
  async work() {
    // the Work view for agents (req:exec.backlog-for-agents): list, add, next, assign — op:api.work
    const p = product(); const sub = pos[1] || 'list';
    if (sub === 'list') {
      const j = await api('GET', `/api/${p}/work`); if (flags.json) return out(j);
      const flat = []; const walk = (r, d) => { flat.push([r, d]); for (const c of r.children) walk(c, d + 1); }; for (const r of j.items) walk(r, 0);
      const rows = flat.filter(([r]) => (flags.done || r.status !== 'done') && (!flags.unassigned || r.state === 'unassigned') && (!flags.mine || r.worker === flags.mine) && (!flags.goal || r.partOf.includes(flags.goal)) && (!flags.pr || (r.pr && r.pr.id === flags.pr)));
      for (const [r, d] of rows) console.log(`${'  '.repeat(d)}${r.id.padEnd(40 - d * 2)} ${r.status.padEnd(12)} ${r.state.padEnd(11)}${r.ready ? ' #ready' : '       '} ${(r.worker || '—').padEnd(12)} ${r.pr ? r.pr.id : (r.partOf[0] || '')}  ${r.title.slice(0, 60)}`);
      if (!rows.length) console.log('no work matches');
      return;
    }
    if (sub === 'add') {
      const text = pos[2] || (await readStdin()); if (!text.trim()) die('wye work add "<text>" [--part-of <id>] [--ready]');
      const j = await api('POST', `/api/${p}/work`, { text, partOf: flags['part-of'] || undefined, project: flags.project || undefined, ready: !!flags.ready, by: flags.by || (env('SESSION') ? `agent:${env('SESSION')}` : 'agent') });
      return out(flags.json ? j : `${j.id} added to ${j.file} (unassigned${flags.ready ? ', ready' : ''})`);
    }
    if (sub === 'next') {
      const j = await api('GET', `/api/${p}/work/next${flags.goal ? `?goal=${encodeURIComponent(flags.goal)}` : ''}`); if (flags.json) return out(j);
      if (j.off) return console.log('auto-take is off for this product (_product.md: auto-take: off)');
      return console.log(j.task ? `${j.task.id}  ${j.task.title}${j.task.pr ? `  (${j.task.pr.id})` : ''}` : 'no ready, unblocked, unassigned task');
    }
    if (sub === 'assign') {
      const id = pos[2] || die('wye work assign <task> --worker <name>');
      const j = await api('POST', `/api/${p}/work/assign`, { id, worker: flags.worker || die('--worker required'), note: flags.note || '', force: !!flags.force, by: flags.by || undefined });
      return out(flags.json ? j : `${id} → ${j.worker}${j.session ? ` (session ${j.session}, ${j.mode})` : ''}`);
    }
    die(`unknown work command: ${sub}`);
  },
  async agent() {
    if (pos[1] !== 'listen') die('wye agent listen --product p --agent a [--cmd "…"] [--name n] [--once]');
    const p = product(); const agent = flags.agent || 'claude-code';
    const name = flags.name || `${os.hostname().split('.')[0]}-${agent}-${process.pid}`;
    // defaults: the prompt arrives on stdin; the agent may read, edit and run the project's tools without prompting
    const DEFAULT_CMD = {
      'claude-code': `claude -p --output-format text --permission-mode acceptEdits --allowedTools "Bash(wye:*)" "Bash(wf:*)" "Bash(ctx:*)" "Bash(node:*)" "Bash(npm:*)" "Bash(git:*)" "Read" "Edit" "Write" "Grep" "Glob"`,
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
      // nothing queued: with --take-ready, the oldest #ready unblocked unassigned task is taken as an assignment
      // (req:exec.ready-for-runners) — a queued run session for this agent, claimed the same way
      if (!s && flags['take-ready']) {
        try { const t = await api('POST', `/api/${p}/work/next`, { agent, runner: name, goal: flags.goal || undefined }); if (t && t.session) { console.log(`▶ took ${t.task} from the backlog`); s = await api('POST', `/api/${p}/sessions/claim`, { agent, runner: name }); } } catch (e) { console.error('take-ready failed:', e.message); }
      }
      if (!s) { await new Promise(r => setTimeout(r, 3000)); continue; } // --once: exit after the first session, but wait for it
      busy = s.id; await beat();
      console.log(`▶ session ${s.id}: ${s.instruction.split('\n')[0].slice(0, 100)}`);
      const log = lines => api('PATCH', `/api/${p}/sessions/${s.id}`, { lines }).catch(() => {});
      let prompt;
      try { prompt = await buildPrompt(p, s); } catch (e) { await api('PATCH', `/api/${p}/sessions/${s.id}`, { status: 'failed', line: `could not build the prompt: ${e.message}` }); busy = null; continue; }
      // the Wye contract: claude takes it as an appended system prompt, other agents get it on top of the prompt
      let system = ''; try { system = await (await fetch(`${WF_URL}/api/${p}/agent-prompt`)).text(); } catch { /* no contract available */ }
      let fullCmd = cmd; let fullPrompt = prompt;
      if (system && agent === 'claude-code') { const f = path.join(os.tmpdir(), `wf-system-${s.id}.md`); fs.writeFileSync(f, system); fullCmd = `${cmd} --append-system-prompt-file "${f}" --add-dir "${flags['wye-root'] || process.env.WF_ROOT || process.cwd()}"`; }
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
  parts.push(`You are working on the product "${p}" in Wye (a knowledge base of requirements, rules, decisions, goals and tasks kept as markdown; a web app at ${WF_URL}). Session ${s.id}.`);
  parts.push(`\n## Instruction\n${s.instruction}${await fetchImages(p, s)}`);
  const ctx = [];
  const seen = new Set();
  for (const ref of [...(s.source && s.source.link ? [s.source.link] : []), ...s.refs]) {
    if (seen.has(ref)) continue; seen.add(ref);
    try { const j = await api('GET', `/api/${p}/resolve?link=${encodeURIComponent(ref)}`); ctx.push(renderResolved(ref, j)); } catch (e) { ctx.push(`- ${ref}: could not resolve (${e.message})`); }
  }
  if (ctx.length) parts.push(`\n## Context\n${ctx.join('\n\n')}`);
  // the constraints in force (req:memory.intake-packet), computed by the app; never blocks the start
  try { const pk = await api('POST', `/api/${p}/packet`, { text: s.instruction, refs: s.refs, budget: 10000 }); if (pk && pk.markdown) parts.push(`\n## Constraints in force\n${pk.markdown}\n\nThe same for any text, mid-session: \`wye packet --for "<text>" [--ref id]\`.`); } catch (e) { parts.push(`\n## Constraints in force\n_Could not compute the constraint packet (${e.message}); run \`wye packet --for "<the request>"\` before you change anything._`); }
  if (s.parent) parts.push(`\nThis session continues session ${s.parent}; its log and result are in the instruction above. Pick up where it stopped.`);
  parts.push(`\n## How to work\n- The Wye CLI is \`wye\` (WYE_URL=${WF_URL}, WYE_PRODUCT=${p}). Read: \`wye resolve <link|id>\`, \`wye doc <product/project/doc>\`, \`wye node <id>\`, \`wye context "<text>"\`. Write: \`wye node set <id> --status s --set key=value\`, \`wye node content <id> --file f\` (the blocks under a node), \`wye doc write <product/project/doc> --file f\` (whole body). \`ctx\` queries the graph offline (\`ctx --root data/products/${p} search …\`).\n- Documents are markdown under data/products/${p}/projects/<project>/docs/. Nodes are lines that start with an id (\`req:x …\`, \`- [ ] task:y …\`) or yaml blocks; keep ids stable.\n- Report progress with \`wye session log ${s.id} "<line>"\` and finish with \`wye session done ${s.id} "<result>"\` (or \`wye session fail\`). The runner marks the session done when you exit, so a final summary on stdout is enough.\n- If the work belongs to another agent, \`wye session handoff ${s.id} --agent <codex|claude-code> "<note>"\`.`);
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
  return `${head}\n(the whole document, ${j.length} chars — read it with wye doc ${j.product}/${j.project}/${j.doc})`;
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

// WYE_READONLY (the Ask deep lane, decision:wf2.ask-two-lanes): only commands that read — anything that writes knowledge,
// starts work or reports on a session is refused here, whatever the agent's tool allow-list lets through
// (constraint:wf2.pr-is-the-persons).
if (env('READONLY')) {
  const GRAPH_READ = new Set(['get', 'neighbors', 'search', 'constraints', 'stats', 'reqs']);
  const c = pos[0] === 'graph' ? pos[1] : pos[0];
  const ok = ['ask-search', 'resolve', 'context', 'packet'].includes(c) || GRAPH_READ.has(c)
    || (c === 'node' && pos.length === 2 && !['add', 'set', 'content', 'retype'].includes(pos[1]))
    || (c === 'doc' && pos.length === 2 && !['create', 'write'].includes(pos[1]))
    || (c === 'session' && pos[1] === 'show');
  if (!ok) die(`wye is read-only here (WYE_READONLY): \`${pos.slice(0, 2).join(' ')}\` is not a read`);
}

// the graph commands (bin/wye-graph.js) work on a product folder, no app needed: `wye build`, `wye check`… and
// `wye graph <cmd>` for the ones whose name the app-side command already has (impact, packet, verdicts)
const GRAPH_CMDS = new Set(['build', 'check', 'site', 'get', 'neighbors', 'search', 'constraints', 'stats', 'reqs']);
if (GRAPH_CMDS.has(pos[0]) || pos[0] === 'graph') {
  process.argv = [process.argv[0], path.join(__dirname, 'wye-graph.js'), ...argv.slice(pos[0] === 'graph' ? 1 : 0)];
  require('./wye-graph.js');
  return;
}

(async () => {
  const c = commands[pos[0]];
  if (!c) { // the help is this file's leading comment, whole — every command up to the first line of code
    const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(2); const end = lines.findIndex(l => !l.startsWith('//'));
    console.log(lines.slice(0, end < 0 ? undefined : end).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(pos[0] ? 1 : 0); }
  // the commands that work on a folder or on the app itself never ask which product
  if (!['setup', 'app', 'init', 'initHere', 'open', 'importProduct', 'eval'].includes(pos[0])) await findHereProduct();
  try { await c(); } catch (e) { die(e.message); }
})();
