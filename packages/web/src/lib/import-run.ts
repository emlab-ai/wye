// A big folder (an Obsidian vault, a wiki export) imported from a path on disk (the desktop app has the file
// system already — no browser upload needed, req:wf2.import.markdown-path). Unlike the multipart route, which
// writes every file at once and lets the watcher fire hook:import-analyse on all of them together — fine for a
// handful of pages, but a vault of hundreds spawns that many concurrent agent sessions — this writes everything
// as `raw` (no auto-fire), makes one request page listing every file as a task, then works the list one file at a
// time: fire the analyse hook, wait for its session to end, check the task, move on. The request page is the
// progress: reopen it any time to see how far the import got.
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { plan, write, readTree, copyAssetFrom, type PlannedDoc } from './import-docs';
import { loadScope, treeFor } from './scope';
import { rebuild, writeAtomic, patchFrontmatter } from './write';
import { createSession, getSession, updateSession } from './sessions';
import { startChat, sendMessage, watchSession, stopChat } from './agent-host';
import { skillBody } from './skills';
import { laneSystem, laneMessage, triage, groupFiles, type LaneFile, type BriefNode } from './import-brief';
import { onSessionEnd } from './sessions';
import { slugify } from './templates';
import { REPO_ROOT } from './products';
import { captureTask } from './work-io';
import { editNode } from './node-edit';
import type { ImportFile } from './import-docs';

export type BatchStatus = { lane?: string; next?: string[]; legacy?: boolean; product?: string; project?: string; title?: string; stopped?: boolean; task?: string; requestSlug: string; total: number; done: number; current: string | null; startedAt: string; finishedAt?: string; failed: string[] };
const g = globalThis as unknown as { __wfImportBatches?: Map<string, BatchStatus>; __wfImportWaiters?: Map<string, () => void> };
const batches = () => (g.__wfImportBatches ??= new Map());
const waiters = () => (g.__wfImportWaiters ??= new Map());

// one listener for the process's life (the same idiom as lib/runs-run.ts's 'runs' hook): a session ending resolves
// whichever file in whichever batch was waiting on it, if any.
onSessionEnd(async (_dir, s) => { const r = waiters().get(s.id); if (r) { waiters().delete(s.id); r(); } }, 'import-batch');
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;   // a session that never ends (crashed runner) must not hang the batch forever
function waitForSession(id: string): Promise<void> {
  return new Promise(resolve => {
    waiters().set(id, resolve);
    setTimeout(() => { if (waiters().delete(id)) resolve(); }, SESSION_TIMEOUT_MS);
  });
}

export function batchStatus(requestSlug: string): BatchStatus | undefined { return batches().get(requestSlug); }

// what the batch needs to go on after a stop (kept beside the status, which is what the UI reads)
type Item = PlannedDoc & { skip?: boolean };   // skip: already done (checked on the page, or processed in this run)
type BatchWork = { productDir: string; docsDir: string; reqFile: string; real: Item[]; running: boolean; order?: number[] };   // order: the lane's file order (short notes first)
const g2 = globalThis as unknown as { __wfImportWork?: Map<string, BatchWork> };
const work = () => (g2.__wfImportWork ??= new Map());

// The imports of a product the rail shows under Agents: running, or stopped and not finished. Kept in memory — a
// server restart ends them; the import page still lists which files are left (each keeps its Analyse button).
export function productBatches(product: string): BatchStatus[] {
  return [...batches().values()].filter(b => b.product === product && !b.finishedAt)
    .map(b => { const w: BatchWork | undefined = work().get(b.requestSlug); const real: Item[] = w?.real ?? []; const order: number[] = w?.order ?? real.map((_, i) => i);
      const now = new Set((b.current ?? '').split(', '));
      return { ...b, next: order.map((i: number) => real[i]).filter((d: Item | undefined): d is Item => !!d && !d.skip && !now.has(d.slug)).slice(0, 5).map((d: Item) => d.title) }; });
}
// Stop: no file after the one running now is started (that one finishes, or is cancelled from its own session).
// Resume: the loop goes on from the first file not done.
export async function controlBatch(product: string, requestSlug: string, action: 'stop' | 'resume'): Promise<BatchStatus | null> {
  let b = batches().get(requestSlug); let w = work().get(requestSlug);
  if ((!b || !w) && action === 'resume') { const fromPage = await batchFromPage(product, requestSlug); if (fromPage) { b = fromPage; w = work().get(requestSlug); } }
  if (!b || (b.product && b.product !== product) || b.finishedAt) return null;
  if (action === 'stop') b.stopped = true;
  else { b.stopped = false; if (w && !w.running) void runBatch(product, w.productDir, w.docsDir, w.reqFile, w.real, b); }
  return b;
}

function freeSlug(base: string, taken: Set<string>): string {
  const root = slugify(base) || 'import'; let s = root; let n = 2;
  while (taken.has(s)) s = `${root}-${n++}`;
  return s;
}

// the node id (module:<slug>, or the id the source file's own front matter carried) is a smart tag: the app links
// it to the page on its own, so the task line needs no href
const nodeOf = (d: PlannedDoc) => d.md.match(/^node:\s*(\S+)/m)?.[1] ?? `module:${d.slug}`;
const taskLine = (i: number, d: PlannedDoc) => `- [ ] task:import-${i + 1} \`${d.from}\` → will become **${d.title}**`;
const doneLine = (i: number, d: PlannedDoc) => `- [x] task:import-${i + 1} \`${d.from}\` → ${nodeOf(d)} ${d.title}`;
const failedLine = (i: number, d: PlannedDoc) => `- [x] task:import-${i + 1} \`${d.from}\` → ${nodeOf(d)} ${d.title} — written, but the agent could not finish; open the page and press Analyse`;
const keptLine = (i: number, d: PlannedDoc) => `- [x] task:import-${i + 1} \`${d.from}\` → ${nodeOf(d)} ${d.title} — kept as written (a template, a snippet or nearly empty: nothing to analyse)`;

// Plans and writes every file as `raw` (so nothing auto-fires), makes the request page, and starts the sequential
// analysis in the background — the caller does not wait on it. Returns at once with the page the person watches.
export async function startBatchImport(product: string, project: string, opts: { rootPath?: string; files?: ImportFile[]; images?: Map<string, Buffer>; label?: string; parent?: string; brief?: string; analyse: boolean }): Promise<{ ok: true; requestSlug: string; total: number; task?: string; skipped: number } | { ok: false; error: string; message: string }> {
  const scope = await loadScope(product, project);
  if (!scope || !scope.project) return { ok: false, error: 'not_found', message: 'no such project' };
  const where = opts.rootPath ?? opts.label ?? 'the upload';
  let files = opts.files;
  if (!files) { if (!opts.rootPath) return { ok: false, error: 'invalid', message: 'path or files required' }; try { files = await readTree(opts.rootPath); } catch (e) { return { ok: false, error: 'invalid', message: `cannot read ${opts.rootPath}: ${e instanceof Error ? e.message : String(e)}` }; } }
  const mdFiles = files.filter(f => /\.(md|markdown)$/i.test(f.path));
  if (!mdFiles.length) return { ok: false, error: 'invalid', message: `no markdown files in ${where}` };
  // a folder whose files are all empty on disk is almost always a synced folder (Dropbox, iCloud, OneDrive) whose
  // files are online-only placeholders: say that, instead of importing nothing and listing every file as skipped
  if (mdFiles.every(f => !f.text.trim())) return { ok: false, error: 'empty', message: `All ${mdFiles.length} markdown file${mdFiles.length === 1 ? ' is' : 's are'} empty on disk. If ${where} is in Dropbox, iCloud or OneDrive, its files may be online-only — make the folder available offline, then import again.` };
  const tree = treeFor(scope, project);
  const existing = new Set([...tree.byFile.values()].map(d => d.slug));
  if (opts.parent && !existing.has(opts.parent)) return { ok: false, error: 'invalid', message: `no document ${opts.parent}` };
  const full = plan(files, { project, parent: opts.parent, analyse: false, brief: opts.brief, existing });
  const real = full.docs.filter(d => !d.folder);
  const readAsset = opts.rootPath ? await copyAssetFrom(opts.rootPath) : async (from: string) => opts.images?.get(from) ?? null;
  await write(scope.project.docsDir, full, readAsset);   // every doc lands `raw` — no hook fires yet

  const base = opts.label ?? (path.basename((opts.rootPath ?? '').replace(/\/+$/, '')) || 'import');
  const reqSlug = freeSlug(`import ${base}`, existing);
  const date = new Date().toISOString().slice(0, 10);
  const md = `---\nnode: module:${reqSlug}\ntype: module\ntitle: Import: ${base}\nstatus: active\nowner: unassigned\nlast-verified: ${date}\n${opts.analyse ? '' : 'analyse: off\n'}source: ${JSON.stringify(opts.rootPath ? `import-path/${opts.rootPath}` : `import-upload/${base}`)}\n${opts.parent ? `part-of: module:${opts.parent}\n` : ''}---\n\n# Import: ${base}\n\nImporting ${real.length} file${real.length === 1 ? '' : 's'} from \`${where}\`, one at a time${opts.analyse ? ' — each is written as a page, then handed to an agent to rewrite into requirements, decisions, facts, entities and tasks (skill:import), before the next one starts' : ''}.\n${opts.brief ? `\n> ${opts.brief}\n` : ''}\n## Files\n\n${real.map((d, i) => taskLine(i, d)).join('\n')}\n${full.skipped.length ? `\n## Skipped\n\n${full.skipped.map(s => `- \`${s.path}\` — ${s.reason}`).join('\n')}\n` : ''}`;
  const reqFile = path.join(scope.project.docsDir, `${reqSlug}.md`);
  await writeAtomic(reqFile, md);
  await rebuild(scope.product.dir);

  // one task in Work for the whole import (the page holds a line per file): checked when the last file is done
  const fresh = await loadScope(product, project);
  const t = fresh ? await captureTask(fresh, { text: `Import ${base} — ${real.length} document${real.length === 1 ? '' : 's'}`, partOf: `module:${reqSlug}`, project, by: 'person' }) : null;
  const task = t?.ok ? t.id : undefined;
  const status: BatchStatus = { product, project, title: `Import: ${base}`, task, requestSlug: reqSlug, total: real.length, done: 0, current: null, startedAt: new Date().toISOString(), failed: [] };
  batches().set(reqSlug, status);
  work().set(reqSlug, { productDir: scope.product.dir, docsDir: scope.project.docsDir, reqFile, real, running: false });
  if (opts.analyse) void runBatch(product, scope.product.dir, scope.project.docsDir, reqFile, real, status);
  else await finish(product, status);   // not analysed: the pages sit `raw`, each with its own Analyse button
  return { ok: true, requestSlug: reqSlug, total: real.length, task, skipped: full.skipped.length };
}

// The import lane (decision:wf2.import-lane): one agent session for the whole import instead of one per file. The
// pages are sorted first — templates, snippets and near-empty notes are kept as written with no agent; short notes go
// several to a message on the faster model; dense ones one at a time on the default model. Each message carries the
// pages inline, and the session's system text carries the brief (types, existing ids, commands, a finished page), a
// prefix the model caches across turns. Every LANE_RESET turns the agent starts fresh with a brief rebuilt from the
// graph (the ids made so far included), so its context never bloats. A turn's end checks its files off on the page.
const LANE_RESET = 12;
const SMALL_MODEL = process.env.WYE_IMPORT_SMALL_MODEL || 'claude-sonnet-5-5';
const wfUrl = () => process.env.WYE_URL || process.env.WF_URL || 'http://localhost:3456';

async function runBatch(product: string, productDir: string, docsDir: string, reqFile: string, real: Item[], status: BatchStatus): Promise<void> {
  const w = work().get(status.requestSlug); if (w) { if (w.running) return; w.running = true; }
  try {
    const project = status.project ?? path.basename(path.dirname(docsDir));
    const left: LaneFile[] = [];
    for (let i = 0; i < real.length; i++) {
      const d = real[i]; if (!d || d.skip || !d.file) continue;
      let text = ''; try { text = await readFile(path.join(docsDir, d.file), 'utf8'); } catch { continue; }
      left.push({ index: i, slug: d.slug, ref: `${product}/${project}/${d.slug}`, title: d.title, from: d.from ?? d.slug, text });
    }
    const kinds = new Map(left.map(f => [f.index, triage(f.from, f.text)]));
    for (const f of left.filter(f => kinds.get(f.index) === 'skip')) { await patchLine(reqFile, f.index, real[f.index], 'kept'); real[f.index].skip = true; status.done++; }
    const groups = groupFiles(left, f => kinds.get(f.index)!);
    if (w) w.order = groups.flatMap(g => g.files.map(f => f.index));
    await rebuild(productDir);
    for (const phase of ['small', 'dense'] as const) {
      const gs = groups.filter(g => g.kind === phase).map(g => g.files);
      if (gs.length && !(await runPhase(product, productDir, docsDir, reqFile, real, status, gs, phase === 'small' ? SMALL_MODEL : undefined))) return;   // paused
    }
    await finish(product, status);
  } catch (e) { console.log(`[wf] import lane ${status.requestSlug}: ${e instanceof Error ? e.message : String(e)}`); status.stopped = true; }
  finally { status.current = null; if (w) w.running = false; }
}

async function laneBrief(product: string, docsDir: string, real: Item[]): Promise<string> {
  const scope = await loadScope(product);
  const skill = (scope && await skillBody(scope, 'skill:import')) || await readFile(path.join(REPO_ROOT, 'prompts/import.md'), 'utf8').catch(() => '# Import a document');
  // one page this import already finished, as the shape to follow
  let example: { ref: string; text: string } | undefined;
  for (const d of real) {
    if (!d?.skip || !d.file) continue;
    const text = await readFile(path.join(docsDir, d.file), 'utf8').catch(() => '');
    if (/^status:\s*analysed\b/m.test(text.slice(0, 800)) && text.length > 600) { example = { ref: d.slug, text }; break; }
  }
  return laneSystem({ product, skill, nodes: (scope?.graph.nodes ?? []) as BriefNode[], example });
}

// One session works `groups` in order, a message each. Resolves true when all are done, false when paused or cancelled.
async function runPhase(product: string, productDir: string, docsDir: string, reqFile: string, real: Item[], status: BatchStatus, groups: LaneFile[][], model?: string): Promise<boolean> {
  if (!groups.length) return true;
  const title = status.title ?? 'Import';
  const s = await createSession(productDir, product, { agent: 'claude-code', mode: 'chat', instruction: laneMessage(title, groups[0]), refs: [`module:${status.requestSlug}`], source: { link: `/${product}/${status.project}/d/${status.requestSlug}` } as never, system: await laneBrief(product, docsDir, real), model });
  status.lane = s.id;
  let gi = 0; let turns = 0; let settled = false; let ending = false;
  return new Promise<boolean>(resolve => {
    const settle = (v: boolean) => { if (settled) return; settled = true; unsub(); resolve(v); };
    const checkOff = async (files: LaneFile[], crashed: boolean) => {
      for (const f of files) {
        const text = await readFile(path.join(docsDir, real[f.index].file), 'utf8').catch(() => '');
        const ok = !crashed && /^status:\s*analysed\b/m.test(text.split('\n---')[0] ?? '');
        await patchLine(reqFile, f.index, real[f.index], ok ? 'done' : 'failed');
        real[f.index].skip = true; status.done++; if (!ok) status.failed.push(f.slug);
      }
      await rebuild(productDir).catch(() => undefined);
    };
    const close = async (line: string) => { ending = true; await updateSession(productDir, s.id, { status: 'done', result: line, line }); stopChat(s.id, line, true); };
    const next = async () => {
      gi++; turns++;
      if (gi >= groups.length) { await close(`import lane done: ${groups.flat().length} pages`); settle(true); return; }
      if (status.stopped) { await close('paused — the import stops here; Resume goes on with a fresh lane'); settle(false); return; }
      status.current = groups[gi].map(f => f.slug).join(', ');
      const fresh = turns % LANE_RESET === 0;
      if (fresh) await updateSession(productDir, s.id, { system: await laneBrief(product, docsDir, real) });   // a fresh agent reads a brief with today's ids
      await sendMessage(productDir, s.id, { text: laneMessage(title, groups[gi]), ...(fresh ? { fresh: true } : {}) } as never);
    };
    let byPerson = false;   // Stop or Cancel on the session announces itself with a note before the process ends
    const unsub = watchSession(s.id, ev => {
      if (settled || ending) return;
      if (ev.kind === 'note' && /stopped by the user|— process ended/.test(ev.text ?? '')) byPerson = true;
      if (ev.kind === 'result') void checkOff(groups[gi], false).then(next).catch(e => { console.log(`[wf] import lane: ${e}`); settle(false); });
      else if (ev.kind === 'exit') void (async () => {
        // the process ended mid-turn: cancelled by the person (= pause), or it crashed (the files fail, a new lane goes on)
        const cur = await getSession(productDir, s.id);
        if (byPerson || cur?.status === 'cancelled') { status.stopped = true; if (cur?.status === 'running') await updateSession(productDir, s.id, { status: 'done', line: 'the import is paused' }); settle(false); return; }
        await checkOff(groups[gi], true); ending = true;
        settle(await runPhase(product, productDir, docsDir, reqFile, real, status, groups.slice(gi + 1), model));
      })();
    });
    status.current = groups[0].map(f => f.slug).join(', ');
    void startChat(productDir, product, s.id, { wfUrl: wfUrl() });
  });
}

async function finish(product: string, status: BatchStatus): Promise<void> {
  status.finishedAt = new Date().toISOString();
  if (!status.task) return;
  const scope = await loadScope(product);
  if (scope) await editNode(scope, status.task, { status: 'done' }).catch(e => console.log(`[wf] import batch ${status.requestSlug}: could not check ${status.task} — ${e instanceof Error ? e.message : String(e)}`));
}

async function patchLine(reqFile: string, i: number, d: PlannedDoc, how: boolean | 'done' | 'failed' | 'kept'): Promise<void> {
  const md = await readFile(reqFile, 'utf8');
  const to = how === 'kept' ? keptLine(i, d) : how === true || how === 'done' ? doneLine(i, d) : failedLine(i, d);
  // the file's line by its number, whatever title it was written with
  const re = new RegExp(`^- \\[ \\] task:import-${i + 1} .*$`, 'm');
  if (re.test(md)) await writeAtomic(reqFile, md.replace(re, to));
}

// An import whose run is gone (the server restarted) or was started by an older build: rebuilt from its page — the
// file lines still unchecked are what is left; each line's source path finds the page it was written as.
const LINE = /^- \[( |x)\] task:import-(\d+) `([^`]+)` → (.*)$/;
export async function batchFromPage(product: string, requestSlug: string): Promise<BatchStatus | null> {
  const scope = await loadScope(product); if (!scope) return null;
  const node = scope.graph.modules.find(m => m.id === `module:${requestSlug}`); if (!node?.file) return null;
  const project = scope.projects.find(p => node.file.includes(`/projects/${p.slug}/`)); if (!project) return null;
  const reqFile = path.join(project.docsDir, `${requestSlug}.md`);
  let md: string; try { md = await readFile(reqFile, 'utf8'); } catch { return null; }
  const lines = md.split('\n').map(l => l.match(LINE)).filter((m): m is RegExpMatchArray => !!m);
  if (!lines.length) return null;
  const bySource = new Map<string, string>();   // import/<path> → file name in docsDir
  for (const f of await readdir(project.docsDir)) {
    if (!f.endsWith('.md')) continue;
    const head = (await readFile(path.join(project.docsDir, f), 'utf8')).slice(0, 1200);
    const src = head.match(/^source:\s*(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '');
    if (src?.startsWith('import/')) bySource.set(src.slice('import/'.length), f);
  }
  const real: Item[] = [];
  for (const m of lines) {
    const i = Number(m[2]) - 1; const from = m[3]; const file = bySource.get(from);
    const title = m[4].match(/\*\*(.+)\*\*/)?.[1] ?? m[4];
    real[i] = { slug: file ? file.replace(/\.md$/, '') : '', file: file ?? '', title, md: '', from, parent: null, folder: false, skip: m[1] === 'x' || !file };
  }
  for (let i = 0; i < real.length; i++) real[i] ??= { slug: '', file: '', title: '', md: '', from: '', parent: null, folder: false, skip: true };
  const total = real.length; const done = real.filter(d => d.skip).length;
  const title = md.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^"|"$/g, '') ?? requestSlug;
  const status: BatchStatus = { product, project: project.slug, title, requestSlug, total, done, current: null, startedAt: new Date().toISOString(), failed: [], stopped: true };
  batches().set(requestSlug, status);
  work().set(requestSlug, { productDir: scope.product.dir, docsDir: project.docsDir, reqFile, real, running: false });
  return status;
}

// Imports with files left that no run in this process is working: shown as stopped, with Resume.
export async function pagesLeft(product: string): Promise<BatchStatus[]> {
  const scope = await loadScope(product); if (!scope) return [];
  const running = new Map([...batches().values()].filter(b => !b.finishedAt).map(b => [b.requestSlug, b]));
  const out: BatchStatus[] = [];
  for (const m of scope.graph.modules) {
    if (!m.file || !/^Import: /.test(m.title.replace(/^"/, '')) ) continue;
    const slug = m.id.replace(/^module:/, ''); const b = running.get(slug);
    if (b?.product) continue;   // a run of this build: productBatches lists it
    // a run an older build started: it is working, but cannot be stopped from here (a restart ends it; Resume goes on)
    if (b) { out.push({ ...b, product, title: m.title, project: scope.projects.find(p => m.file.includes(`/projects/${p.slug}/`))?.slug, legacy: true }); continue; }
    let md: string; try { md = await readFile(path.join(REPO_ROOT, m.file), 'utf8'); } catch { continue; }
    if (!/^- \[ \] task:import-\d+ /m.test(md) || /^analyse: off$/m.test(md)) continue;   // nothing left, or imported as is
    const all = (md.match(/^- \[[ x]\] task:import-\d+ /gm) ?? []).length; const done = (md.match(/^- \[x\] task:import-\d+ /gm) ?? []).length;
    const project = scope.projects.find(p => m.file.includes(`/projects/${p.slug}/`))?.slug;
    const next = [...md.matchAll(/^- \[ \] task:import-\d+ `[^`]+` → .*?\*\*(.+?)\*\*/gm)].slice(0, 5).map(x => x[1]);
    out.push({ product, project, title: m.title, requestSlug: slug, total: all, done, current: null, startedAt: '', failed: [], stopped: true, next });
  }
  return out;
}
