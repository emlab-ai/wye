// The system library and installs, the CLI/API subset of the install design (module:implement-a-feature-to-install-
// system-skills-and-dev-design): a package is `<system>/projects/<pkg>/` — `package.md` (its card: title, description,
// entity:install.package), `docs/` (skills, workflows, hook documents, templates) and, outside docs/ so no link ever
// exposes it, `types.md`: the `- id: type:<slug>` cards the package brings (decision:ea.packages-carry-types).
// Install (op:install.install) declares those types in the product, writes the project's record and makes one directory
// link (decision:install.directory-link); the record is the fact, the link derived from it
// (decision:install.record-is-canonical). One function per op, called by the API routes and, through them, `wye`.
import { createRequire } from 'node:module';
import path from 'node:path';
import { lstat, mkdir, readFile, readdir, readlink, rm, rmdir, stat, symlink, unlink } from 'node:fs/promises';
import { DATA_ROOT, REPO_ROOT, listProducts } from './products';
import { docRoute, splitDocument, type Chunk } from './doc';
import { parseHook } from './hooks';
import { instancesOf, ontologyDoc } from './types';
import { appendTypeCard } from './type-edit';
import { instantiate } from './templates';
import { rebuild, withFileLock, writeAtomic } from './write';
import { createProduct } from './product-create';
import type { GraphData } from './graph';

const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const lib = (): { parseFiles(files: string[], o: { cwd: string }): GraphData; findDocs(root: string): string[] } => ({ ...req('./lib/parse.js'), ...req('./lib/build.js') });

// entity:install.system-library: `WYE_SYSTEM`, else `<install>/system` — read on every call, so a test points it at a scratch copy
export const systemRoot = () => path.resolve(process.env.WYE_SYSTEM || path.join(REPO_ROOT, 'system'));
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const exists = async (p: string) => { try { await stat(p); return true; } catch { return false; } };
const today = () => new Date().toISOString().slice(0, 10);

// value:install.refusal — the same words in the app and the CLI
export type Refusal = 'already-installed' | 'not-installed' | 'no-such-package' | 'no-such-project' | 'no-such-product' | 'shadowed' | 'invalid';
export class InstallRefused extends Error { constructor(public reason: Refusal, message: string) { super(message); } }
const refuse = (reason: Refusal, message: string): never => { throw new InstallRefused(reason, message); };

export type Item = { id: string; title: string; doc: string };
export type HookItem = Item & { on: string; agent: boolean };
export type TypeItem = { id: string; extends: string; purpose: string; card: string; there?: boolean };
export type Contents = { skills: Item[]; workflows: Item[]; hooks: HookItem[]; templates: Item[]; types: TypeItem[]; docs: string[] };
export type Package = { slug: string; title: string; description: string; dir: string; contents: Contents };

// ---- the library ------------------------------------------------------------------------------------------------

function frontmatter(md: string): Record<string, string> {
  const fm = md.match(/^---\n([\s\S]*?)\n---/); const out: Record<string, string> = {};
  if (fm) for (const l of fm[1].split('\n')) { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2'); }
  return out;
}
const cardValue = (body: string, key: string) => {
  const m = body.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm')); if (!m) return '';
  if (/^[>|]-?$/.test(m[1].trim())) { const rest = body.slice(m.index! + m[0].length + 1).split('\n'); const out: string[] = []; for (const l of rest) { if (!/^\s+\S/.test(l)) break; out.push(l.trim()); } return out.join(' '); }
  return m[1].trim();
};

// The type cards of a package's types.md as written there (each `- id: type:<slug>` chunk, a bare `id:` card made a
// list item) — the card goes into the product whole: props, purpose, extends, status, as the package author wrote it.
function typeCards(md: string): TypeItem[] {
  const out: TypeItem[] = [];
  for (const seg of splitDocument(md).segments) {
    if (seg.type !== 'yaml') continue;
    for (const c of seg.chunks as Chunk[]) {
      if (!c.id?.startsWith('type:')) continue;
      const card = c.list ? c.raw.replace(/^\s*-/, '-') : c.raw.split('\n').map((l, i) => (i ? '  ' : '- ') + l).join('\n');
      out.push({ id: c.id, extends: cardValue(c.body, 'extends') || 'type:node', purpose: cardValue(c.body, 'purpose'), card });
    }
  }
  return out;
}

// What a package holds (value:install.content-kind): its documents parsed on their own (types.md with them, so a card of
// the package's own types parses), the skill, workflow, hook and template nodes they define; each hook with its `on:` and
// whether an action starts an agent session (a skill run, a workflow, a task or assignment handed to a worker).
async function contents(dir: string): Promise<Contents> {
  const docsDir = path.join(dir, 'docs'); const typesFile = path.join(dir, 'types.md');
  const docs = (await exists(docsDir)) ? lib().findDocs(docsDir) : [];
  const typesMd = await readFile(typesFile, 'utf8').catch(() => '');
  const c: Contents = { skills: [], workflows: [], hooks: [], templates: [], types: typeCards(typesMd), docs: docs.map(f => path.relative(docsDir, f).replace(/\.md$/, '')) };
  if (!docs.length) return c;
  const g = lib().parseFiles(typesMd ? [...docs, typesFile] : docs, { cwd: dir });
  const seen = new Set<string>();
  for (const n of g.nodes) {
    if (!n.defined || seen.has(n.id) || !n.file.startsWith('docs/')) continue; seen.add(n.id);
    const it: Item = { id: n.id, title: n.title || n.id, doc: n.file.slice(5).replace(/\.md$/, '') };
    if (n.kind === 'skill') c.skills.push(it);
    else if (n.kind === 'workflow') c.workflows.push(it);
    else if (n.kind === 'template') c.templates.push(it);
    else if (n.kind === 'hook') {
      const h = parseHook(n);
      c.hooks.push({ ...it, on: h ? `${h.on.kind}.${h.on.event}` : cardValue(n.body, 'on'), agent: !!h?.actions.some(a => a.kind === 'run' || a.kind === 'workflow' || a.kind === 'dispatch' || ((a.kind === 'task' || a.kind === 'assign') && !!(a.worker || a.skill))) });
    }
  }
  return c;
}

export async function getPackage(slug: string, system = systemRoot()): Promise<Package | null> {
  if (!SLUG.test(slug)) return null;
  const dir = path.join(system, 'projects', slug);
  if (!(await exists(path.join(dir, 'docs'))) && !(await exists(path.join(dir, 'package.md')))) return null;
  const card = frontmatter(await readFile(path.join(dir, 'package.md'), 'utf8').catch(() => ''));
  return { slug, title: card.title || slug, description: card.description || '', dir, contents: await contents(dir) };
}
// op:install.library: every package of the library with what it holds
export async function listPackages(system = systemRoot()): Promise<Package[]> {
  let names: string[] = []; try { names = (await readdir(path.join(system, 'projects'), { withFileTypes: true })).filter(e => e.isDirectory() && SLUG.test(e.name)).map(e => e.name).sort(); } catch { /* no library */ }
  return (await Promise.all(names.map(n => getPackage(n, system)))).filter((p): p is Package => !!p);
}

// ---- the record (entity:install.record) -------------------------------------------------------------------------

// `projects/<p>/.wye/packages.yaml`, one entry per package: package, installed, by, and the types this install declared
// in the product (only those — a type the product already had is not the install's to remove)
export type RecordEntry = { package: string; installed: string; by: string; types: string[]; /** the seed pages this install copied into the project (once: a page deleted later is not copied again) */ seeded?: string[] };
const recordFile = (projectDir: string) => path.join(projectDir, '.wye', 'packages.yaml');
export const linkPath = (projectDir: string, pkg: string) => path.join(projectDir, '.wye', 'packages', pkg);

export function parseRecord(text: string): RecordEntry[] {
  const out: RecordEntry[] = []; let cur: RecordEntry | null = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^(-\s+|\s+)([a-z]+):\s*(.*)$/); if (!m) continue;
    if (m[1].startsWith('-')) { cur = { package: '', installed: '', by: '', types: [] }; out.push(cur); }
    if (!cur) continue;
    const v = m[3].trim();
    if (m[2] === 'types') cur.types = v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
    else if (m[2] === 'seeded') cur.seeded = v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
    else if (m[2] === 'package' || m[2] === 'installed' || m[2] === 'by') cur[m[2]] = v;
  }
  return out.filter(e => e.package);
}
export function formatRecord(entries: RecordEntry[]): string {
  return '# What this project has installed from the system library (entity:install.record) — wye install / uninstall write it\n' +
    entries.map(e => `- package: ${e.package}\n  installed: ${e.installed}\n  by: ${e.by}\n  types: [${e.types.join(', ')}]\n${e.seeded?.length ? `  seeded: [${e.seeded.join(', ')}]\n` : ''}`).join('');
}
export async function readRecord(projectDir: string): Promise<RecordEntry[]> { return parseRecord(await readFile(recordFile(projectDir), 'utf8').catch(() => '')); }

// The link's target: relative when the product folder is inside the install's repository (it survives a clone and a
// moved checkout), absolute otherwise — a product with `root:` elsewhere, a test's scratch folder (entity:install.link)
function linkTarget(link: string, target: string): string {
  const inRepo = (p: string) => !path.relative(REPO_ROOT, p).startsWith('..');
  return inRepo(link) && inRepo(target) ? path.relative(path.dirname(link), target) : target;
}
async function linkPackage(projectDir: string, pkg: string, system: string): Promise<void> {
  const link = linkPath(projectDir, pkg); const target = path.join(system, 'projects', pkg, 'docs');
  await mkdir(path.dirname(link), { recursive: true });
  try { const s = await lstat(link); if (s.isSymbolicLink()) await unlink(link); else return refuse('shadowed', `${path.relative(REPO_ROOT, link)} exists and is not a link`); } catch (e) { if (e instanceof InstallRefused) throw e; }
  await symlink(linkTarget(link, target), link, 'dir');
}
// op:install.restore-links: a record entry whose link is missing or points elsewhere gets it back; nothing else is written
export async function restoreLinks(productDir: string, system = systemRoot()): Promise<string[]> {
  const fixed: string[] = [];
  let projects: string[] = []; try { projects = (await readdir(path.join(productDir, 'projects'), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name); } catch { return fixed; }
  for (const p of projects) {
    const dir = path.join(productDir, 'projects', p);
    for (const e of await readRecord(dir)) {
      const link = linkPath(dir, e.package); const want = path.join(system, 'projects', e.package, 'docs');
      const ok = await readlink(link).then(t => path.resolve(path.dirname(link), t) === want, () => false);
      if (!ok && await exists(want)) { await linkPackage(dir, e.package, system); fixed.push(`${p}/${e.package}`); }
    }
  }
  return fixed;
}

// Seed pages (decision:ea.digest-is-a-page): `system/projects/<pkg>/seed/*.md` are pages the package gives the project
// once — copied into its docs as the person's own (not linked: they are meant to be edited), never over a page that is
// there, never again after the install recorded them (a seed deleted later stays deleted). `seed-pin: true` in a seed's
// front matter pins the page to the top of the rail. Returns the seeds copied.
export async function seedPages(productDir: string, projectDir: string, entry: RecordEntry, system = systemRoot()): Promise<string[]> {
  const dir = path.join(system, 'projects', entry.package, 'seed');
  let files: string[] = []; try { files = (await readdir(dir)).filter(f => f.endsWith('.md')); } catch { return []; }
  const copied: string[] = [];
  for (const f of files) {
    const name = f.replace(/\.md$/, ''); if (entry.seeded?.includes(name)) continue;
    const to = path.join(projectDir, 'docs', f);
    if (!(await exists(to))) {
      const md = await readFile(path.join(dir, f), 'utf8');
      await writeAtomic(to, md.replace(/^seed-pin:.*\n/m, '').replace(/^last-verified:.*$/m, `last-verified: ${today()}`));
      if (/^seed-pin:\s*true/m.test(md)) await pinDoc(productDir, `${path.basename(projectDir)}/${name}`);
      copied.push(name);
    }
    entry.seeded = [...new Set([...(entry.seeded ?? []), name])];
  }
  return copied;
}
async function pinDoc(productDir: string, ref: string): Promise<void> {
  const file = path.join(productDir, '_product.md');
  await withFileLock(file, async () => {
    const md = await readFile(file, 'utf8');
    const m = md.match(/^pinned:\s*\[(.*)\]\s*$/m); const list = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
    if (list.includes(ref)) return;
    const line = `pinned: [${[ref, ...list].join(', ')}]`;   // a package's page goes first
    await writeAtomic(file, m ? md.replace(m[0], line) : md.replace(/^---\n/, `---\n${line}\n`));
  });
}

// A package that grew a type after it was installed (the assistant's thread and email): each recorded install gets the
// package's types the product does not declare yet — declared the way an install declares them, and recorded so an
// uninstall takes them away again. Returns the ids declared. Nothing changes when there is nothing new.
export async function syncPackageTypes(productDir: string, system = systemRoot()): Promise<string[]> {
  const added: string[] = [];
  let projects: string[] = []; try { projects = (await readdir(path.join(productDir, 'projects'), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name); } catch { return added; }
  for (const p of projects) {
    const dir = path.join(productDir, 'projects', p);
    const record = await readRecord(dir); if (!record.length) continue;
    for (const e of record) {
      const pkg = await getPackage(e.package, system); if (!pkg) continue;
      const graph = parseProduct(productDir);
      const declared = new Set((graph.types ?? []).map(t => t.id));
      const fresh = pkg.contents.types.filter(t => !declared.has(t.id));
      if (!fresh.length) continue;
      const rel = ontologyDoc(graph) ?? path.relative(REPO_ROOT, path.join(dir, 'docs', 'ontology.md'));
      const abs = path.resolve(REPO_ROOT, rel);
      if (!(await exists(abs))) continue;   // no ontology page to declare into: the next install makes one
      await withFileLock(abs, async () => { let md = await readFile(abs, 'utf8'); for (const t of fresh) md = appendTypeCard(md, t.card); await writeAtomic(abs, md); });
      e.types = [...new Set([...e.types, ...fresh.map(t => t.id)])];
      added.push(...fresh.map(t => t.id));
    }
    // seed pages the package gained since (the assistant's Digest): copied once, recorded
    let seeded = false;
    for (const e of record) { const before = (e.seeded ?? []).join(','); const copied = await seedPages(productDir, dir, e, system); if (copied.length) added.push(...copied.map(c => `page:${c}`)); if ((e.seeded ?? []).join(',') !== before) seeded = true; }
    if (added.length || seeded) await writeAtomic(recordFile(dir), formatRecord(record));
  }
  if (added.length) await rebuild(productDir);
  return added;
}

// ---- install / uninstall ------------------------------------------------------------------------------------------

type Opts = { dataRoot?: string; system?: string };
async function productDirOf(product: string, dataRoot: string): Promise<string | null> {
  return (await listProducts(dataRoot)).find(p => p.slug === product)?.dir ?? null;
}
// The product's graph parsed now, in memory — nothing written (a dry run writes nothing, not even _build/)
function parseProduct(productDir: string): GraphData { return lib().parseFiles(lib().findDocs(productDir), { cwd: REPO_ROOT }); }

export type Preview = {
  product: string; project: string; package: string; title: string; description: string; createProduct?: string;
  skills: Item[]; workflows: Item[]; hooks: HookItem[]; templates: Item[];
  types: (TypeItem & { there: boolean })[];
};
export type InstallResult = Preview & { dryRun: boolean; installed: boolean; record?: RecordEntry; link?: string; typesFile?: string };

// op:install.preview + op:install.install. Refuses (InstallRefused) an unknown package, product or project, a package the
// project already has (req:install.install's unless: told so, nothing changes) and a package document that would define
// an id the project already defines (rule:install.no-shadowing). Each type card of the package is declared in the
// product's types home — its ontology document, as `wye type add` picks it (ontologyDoc), else a new ontology.md in this
// project — card whole, status as the package wrote it: the person chose to install, so nothing waits for review. A type
// the product already declares (its own or a base kind) is kept untouched and not recorded. `createProduct` makes the
// product first, with this project, when it does not exist (`wye install … --create-product "<title>"`).
export async function installPackage(product: string, project: string, pkg: string, o: Opts & { dryRun?: boolean; by?: string; createProduct?: string } = {}): Promise<InstallResult> {
  const dataRoot = o.dataRoot ?? DATA_ROOT; const system = o.system ?? systemRoot();
  if (!SLUG.test(product) || !SLUG.test(project)) refuse('invalid', 'product and project are lowercase slugs');
  const p = await getPackage(pkg, system); if (!p) return refuse('no-such-package', `no package ${pkg} in the system library (${system})`);
  let productDir = await productDirOf(product, dataRoot);
  const creating = !productDir && !!o.createProduct;
  if (!productDir && !creating) refuse('no-such-product', `no product ${product} — --create-product "<title>" makes it`);
  const projectDir = productDir ? path.join(productDir, 'projects', project) : '';
  if (productDir && !(await exists(projectDir))) refuse('no-such-project', `${product} has no project ${project}`);
  if (productDir && (await readRecord(projectDir)).some(e => e.package === pkg)) refuse('already-installed', `${pkg} is already installed in ${product}/${project} — nothing changed`);

  const graph: GraphData = productDir ? parseProduct(productDir) : lib().parseFiles([], { cwd: REPO_ROOT }); // a product still to be made has the base kinds
  const declared = new Set((graph.types ?? []).map(t => t.id));
  const types = p.contents.types.map(t => ({ ...t, there: declared.has(t.id) }));
  // rule:install.no-shadowing: an id the package's documents define that this project's own documents define already
  const own = new Set(graph.nodes.filter(n => n.defined && docRoute(n.file)?.project === project).map(n => n.id));
  const shadowed = [...p.contents.skills, ...p.contents.workflows, ...p.contents.hooks, ...p.contents.templates].map(i => i.id).filter(id => own.has(id));
  if (shadowed.length) refuse('shadowed', `${product}/${project} already defines ${shadowed.join(', ')} — ${pkg} would shadow it`);
  const preview: Preview = { product, project, package: pkg, title: p.title, description: p.description, ...(creating ? { createProduct: o.createProduct } : {}), skills: p.contents.skills, workflows: p.contents.workflows, hooks: p.contents.hooks, templates: p.contents.templates, types };
  if (o.dryRun) return { ...preview, dryRun: true, installed: false };

  if (creating) productDir = (await createProduct({ slug: product, title: o.createProduct!, project, dataRoot })).dir;
  const pdir = path.join(productDir!, 'projects', project);
  const added = types.filter(t => !t.there);
  let typesFile: string | undefined;
  if (added.length) {
    let rel = ontologyDoc(graph);
    if (!rel) {
      rel = path.relative(REPO_ROOT, path.join(pdir, 'docs', 'ontology.md'));
      if (!(await exists(path.join(REPO_ROOT, rel)))) {
        const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/blank.md'), 'utf8');
        await writeAtomic(path.join(REPO_ROOT, rel), instantiate(tpl, { title: 'Ontology', slug: 'ontology', parent: '', date: today() }).replace(/^part-of: \n/m, '').replace(/\npart-of: $/m, ''));
      }
    }
    const abs = path.resolve(REPO_ROOT, rel); typesFile = abs;
    await withFileLock(abs, async () => { let md = await readFile(abs, 'utf8'); for (const t of added) md = appendTypeCard(md, t.card); await writeAtomic(abs, md); });
  }
  const record: RecordEntry = { package: pkg, installed: today(), by: o.by || 'person', types: added.map(t => t.id) };
  await seedPages(productDir!, pdir, record, system);
  await writeAtomic(recordFile(pdir), formatRecord([...(await readRecord(pdir)), record]));
  await linkPackage(pdir, pkg, system);
  await rebuild(productDir!);
  return { ...preview, dryRun: false, installed: true, record, link: linkPath(pdir, pkg), typesFile };
}

// A type card cut out of its document: the chunk, or the whole fence when it was the fence's only card
function removeCard(md: string, id: string): string | null {
  for (const seg of splitDocument(md).segments) {
    if (seg.type !== 'yaml') continue;
    const c = (seg.chunks as Chunk[]).find(x => x.id === id); if (!c) continue;
    const alone = !(seg.chunks as Chunk[]).some(x => x.id && x.id !== id);
    const [a, b] = alone ? [seg.start, seg.end] : [c.start, c.end];
    return (md.slice(0, a).replace(/\n*$/, alone ? '\n\n' : '\n') + md.slice(b).replace(/^\n+/, '')).replace(/\n{3,}/g, '\n\n');
  }
  return null;
}

export type UninstallResult = { product: string; project: string; package: string; removedTypes: string[]; warnings: string[] };
// op:install.uninstall: the link, the record entry and the type cards this install declared (as recorded) go; nothing
// else is touched — blocks its hooks wrote and sessions in flight stay (unless:install.uninstall). A removed type that
// nodes of the product are still typed by is removed anyway, with a warning that counts them: the record says the install
// brought it, the install is undone, and the nodes stay as they are (their kind falls back to an undeclared one the check
// names) — keeping the card would leave a type no record owns and no uninstall ever removes. Declare it again with
// `wye type add` to keep it.
export async function uninstallPackage(product: string, project: string, pkg: string, o: Opts = {}): Promise<UninstallResult> {
  const dataRoot = o.dataRoot ?? DATA_ROOT;
  const productDir = await productDirOf(product, dataRoot); if (!productDir) return refuse('no-such-product', `no product ${product}`);
  const pdir = path.join(productDir, 'projects', project);
  if (!SLUG.test(project) || !(await exists(pdir))) refuse('no-such-project', `${product} has no project ${project}`);
  const record = await readRecord(pdir); const entry = record.find(e => e.package === pkg);
  if (!entry) return refuse('not-installed', `${pkg} is not installed in ${product}/${project}`);
  const link = linkPath(pdir, pkg);
  try { if ((await lstat(link)).isSymbolicLink()) await unlink(link); } catch { /* already gone */ }
  try { await rmdir(path.dirname(link)); } catch { /* other packages still linked */ }
  const graph = parseProduct(productDir); const warnings: string[] = []; const removedTypes: string[] = [];
  for (const id of entry.types) {
    const t = (graph.types ?? []).find(x => x.id === id); if (!t?.file) continue;
    const users = instancesOf(graph, id.slice(5)).length;
    const abs = path.resolve(REPO_ROOT, t.file);
    await withFileLock(abs, async () => { const md = await readFile(abs, 'utf8'); const next = removeCard(md, id); if (next !== null) { await writeAtomic(abs, next); removedTypes.push(id); } });
    if (users) warnings.push(`${id} removed, but ${users} node(s) of the product are still typed by it`);
  }
  const rest = record.filter(e => e !== entry);
  if (rest.length) await writeAtomic(recordFile(pdir), formatRecord(rest)); else await rm(recordFile(pdir), { force: true });
  await rebuild(productDir);
  return { product, project, package: pkg, removedTypes, warnings };
}

// op:install.list: what each project of the product has installed, from the records (never the folder)
export async function listInstalled(product: string, o: Opts = {}): Promise<{ project: string; packages: RecordEntry[] }[] | null> {
  const productDir = await productDirOf(product, o.dataRoot ?? DATA_ROOT); if (!productDir) return null;
  let projects: string[] = []; try { projects = (await readdir(path.join(productDir, 'projects'), { withFileTypes: true })).filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map(e => e.name).sort(); } catch { /* none */ }
  return Promise.all(projects.map(async p => ({ project: p, packages: await readRecord(path.join(productDir, 'projects', p)) })));
}
export async function productDirFor(product: string, dataRoot = DATA_ROOT) { return productDirOf(product, dataRoot); }
// value:install.refusal as an HTTP answer: the package, product or project is not there (404), it is installed already
// or would shadow a document of the project (409), a bad slug (422); anything else is not a refusal and is rethrown
export function refusalReply(e: unknown): { status: number; body: { error: Refusal; message: string } } {
  if (!(e instanceof InstallRefused)) throw e;
  return { status: e.reason.startsWith('no-such') ? 404 : e.reason === 'invalid' ? 422 : 409, body: { error: e.reason, message: e.message } };
}
