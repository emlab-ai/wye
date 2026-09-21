// Import markdown files — one file or a folder tree — as documents of a project (req:wf2.import.markdown,
// decision:wf2.import-lands-first-agent-rewrites-in-place). `plan` is pure: given the files (path + text) and what
// the project already has, it says which documents to write with what front matter and where the tree's folders
// become parent documents. `write` puts them on disk. No model here: the agent comes after, through the hook on
// `module.created where status=imported`.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slugify } from './templates';
import { writeAtomic } from './write';

export interface ImportFile { path: string; text: string }          // path as given (a folder keeps its tree: "notes/2026/plan.md")
export interface ImportOptions {
  project: string;                                                 // the project's slug — front matter `node:` ids need nothing else
  parent?: string;                                                 // a document slug the import lands under (top level when empty)
  analyse?: boolean;                                               // true (default): status imported — the hook fires; false: raw
  existing: Set<string>;                                           // document slugs the project already has (never overwritten)
  date?: string;
}
export interface PlannedDoc { slug: string; file: string; title: string; md: string; from: string | null; parent: string | null; folder: boolean }
export interface ImportPlan { docs: PlannedDoc[]; skipped: { path: string; reason: string }[]; assets: { from: string; to: string }[] }

export const MAX_BYTES = 1_000_000;
const MD = /\.(md|markdown)$/i;

const fmSplit = (md: string): { fm: Record<string, string>; order: string[]; body: string } => {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, order: [], body: md };
  const fm: Record<string, string> = {}; const order: string[] = [];
  for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^([\w-]+):\s*(.*)$/); if (k) { fm[k[1]] = k[2]; order.push(k[1]); } }
  return { fm, order, body: md.slice(m[0].length) };
};
const yamlStr = (s: string) => (/[:#'"\[\]{}|>&*!%@`]|^\s|\s$/.test(s) ? JSON.stringify(s) : s);

// The title: the front matter's, else the first `# heading`, else the file name.
export function titleOf(md: string, filePath: string): string {
  const { fm, body } = fmSplit(md);
  if (fm.title) return fm.title.replace(/^["']|["']$/g, '');
  const h = body.match(/^#\s+(.+?)\s*$/m);
  if (h) return h[1].replace(/\s+#+$/, '').trim();
  return path.basename(filePath).replace(MD, '').replace(/[-_]+/g, ' ').trim() || 'Imported';
}

// A slug nobody has yet: the title's, else the file name's, `-2`, `-3`… on a clash (with the project or the plan).
function freeSlug(base: string, taken: Set<string>): string {
  const root = slugify(base) || 'doc';
  let s = root; let n = 2;
  while (taken.has(s)) s = `${root}-${n++}`;
  taken.add(s); return s;
}

// The document for one file: existing front matter kept (its own node line wins when it has one), the import's
// keys added — status, source, part-of, type module — and the body untouched.
function docFor(f: ImportFile, slug: string, title: string, parent: string | null, o: ImportOptions): string {
  const { fm, order, body } = fmSplit(f.text);
  const keys = new Map<string, string>();
  for (const k of order) keys.set(k, fm[k]);
  if (!keys.has('node')) keys.set('node', `module:${slug}`);
  if (!keys.has('type')) keys.set('type', 'module');
  keys.set('title', yamlStr(title));
  keys.set('status', o.analyse === false ? 'raw' : 'imported');
  if (!keys.has('owner')) keys.set('owner', 'unassigned');
  keys.set('last-verified', o.date ?? new Date().toISOString().slice(0, 10));
  keys.set('source', yamlStr(`import/${f.path}`));
  if (parent) keys.set('part-of', parent); else keys.delete('part-of');
  const head = [...keys].map(([k, v]) => `${k}: ${v}`).join('\n');
  const text = body.replace(/^\s*\n/, '');
  // a body without a heading gets the title as one, so the page reads like every other
  const withHeading = /^#\s/m.test(text) ? text : `# ${title}\n\n${text}`;
  return `---\n${head}\n---\n\n${withHeading.replace(/\s*$/, '\n')}`;
}

// The relative images a body refers to: `![alt](rel/path.png)` — not http, not data:, not assets/ already.
export function imageRefs(md: string): string[] {
  const out: string[] = []; const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(md))) { const u = m[1]; if (!/^(https?:|data:|\/|assets\/)/i.test(u) && !u.endsWith('.excalidraw')) out.push(u); }
  return [...new Set(out)];
}

export function plan(files: ImportFile[], o: ImportOptions): ImportPlan {
  const taken = new Set(o.existing);
  const docs: PlannedDoc[] = []; const skipped: ImportPlan['skipped'] = []; const assets: ImportPlan['assets'] = [];
  const folders = new Map<string, string>();                       // folder path → document slug (its parent page)
  const parentOf = (rel: string): string | null => {
    const dir = path.posix.dirname(rel.replace(/\\/g, '/'));
    if (dir === '.' || dir === '') return o.parent ? `module:${o.parent}` : null;
    if (!folders.has(dir)) {
      const up = parentOf(dir);                                     // the folder's own parent (dirname of the folder), made first
      const name = path.posix.basename(dir);
      const slug = freeSlug(name, taken);
      folders.set(dir, slug);
      const title = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      docs.push({ slug, file: `${slug}.md`, title, from: null, parent: up, folder: true,
        md: docFor({ path: dir, text: `# ${title}\n\nImported folder \`${dir}\`; its files are the pages under this one.\n` }, slug, title, up, { ...o, analyse: false }) });
    }
    return `module:${folders.get(dir)}`;
  };
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    const rel = f.path.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (!MD.test(rel)) { skipped.push({ path: f.path, reason: 'not markdown' }); continue; }
    if (Buffer.byteLength(f.text, 'utf8') > MAX_BYTES) { skipped.push({ path: f.path, reason: 'larger than 1 MB' }); continue; }
    if (!f.text.trim()) { skipped.push({ path: f.path, reason: 'empty' }); continue; }
    const parent = parentOf(rel);
    const title = titleOf(f.text, rel);
    const slug = freeSlug(title, taken);
    let md = docFor({ ...f, path: rel }, slug, title, parent, o);
    // relative images → the project's assets folder, the body rewritten to assets/<name>
    for (const u of imageRefs(md)) {
      const src = path.posix.join(path.posix.dirname(rel), u);
      const to = `assets/${slug}-${path.posix.basename(u)}`;
      assets.push({ from: src, to });
      md = md.split(`](${u})`).join(`](${to})`);
    }
    docs.push({ slug, file: `${slug}.md`, title, md, from: rel, parent, folder: false });
  }
  return { docs, skipped, assets };
}

// Write a plan into a project's docs folder. `readAsset` fetches an image the plan refers to (by its import path);
// a missing one is skipped, not fatal. Returns what was written.
export async function write(docsDir: string, p: ImportPlan, readAsset?: (from: string) => Promise<Buffer | null>): Promise<{ written: string[]; assets: string[] }> {
  await mkdir(docsDir, { recursive: true });
  const written: string[] = [];
  for (const d of p.docs) { await writeAtomic(path.join(docsDir, d.file), d.md); written.push(d.file); }
  const assets: string[] = [];
  if (p.assets.length && readAsset) {
    await mkdir(path.join(docsDir, 'assets'), { recursive: true });
    for (const a of p.assets) { const buf = await readAsset(a.from); if (!buf) continue; await writeFile(path.join(docsDir, a.to), buf); assets.push(a.to); }
  }
  return { written, assets };
}

// The files under a folder on disk (for `wye import <dir>` and the code-side reader): markdown only, the tree kept,
// node_modules and dot-folders skipped. A single file gives one entry.
export async function readTree(root: string): Promise<ImportFile[]> {
  const st = await stat(root);
  if (st.isFile()) return [{ path: path.basename(root), text: await readFile(root, 'utf8') }];
  const out: ImportFile[] = [];
  const walk = async (dir: string, rel: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), r);
      else if (MD.test(e.name)) out.push({ path: r, text: await readFile(path.join(dir, e.name), 'utf8') });
    }
  };
  await walk(root, '');
  return out;
}

export async function copyAssetFrom(root: string): Promise<(from: string) => Promise<Buffer | null>> {
  const st = await stat(root); const base = st.isFile() ? path.dirname(root) : root;
  return async (from: string) => { try { return await readFile(path.join(base, from)); } catch { return null; } };
}
