import { NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getProduct, REPO_ROOT } from '@/lib/products';
import { loadScope } from '@/lib/scope';
import { rebuild } from '@/lib/write';
import { assignTask } from '@/lib/work-io';
import { agentSettings, readSettings } from '@/lib/settings';

// the repo's lib/init.js through a require anchored at the repo root (as lib/build.ts does): a literal relative path
// the bundler leaves alone, not a computed one
const repoRequire = createRequire(path.join(REPO_ROOT, 'package.json'));

// op:api.import-code — POST { name, path, analyse? } → a feature's definition read from code (lib/init.js
// `--feature`): a project named after it with the layered tree, every module / page / component / library /
// operation / test the folder shows, and a `#ready` describe task per module; with `analyse` (default) each describe
// task is handed to the default agent with skill:describe-module — the reverse-engineering the person asked for
// (req:wf2.import.code). `path` is a folder: absolute, or relative to the product's repo (`repo:` in _product.md).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { name?: string; path?: string; analyse?: boolean; brief?: string };
  const name = (body.name ?? '').trim(); const given = (body.path ?? '').trim();
  if (!name || !given) return NextResponse.json({ error: 'invalid', message: 'name and path required' }, { status: 422 });
  const repo = p.meta.repo ? path.resolve(p.meta.repo) : REPO_ROOT;
  const abs = path.isAbsolute(given) ? given : path.join(repo, given);
  try { if (!(await stat(abs)).isDirectory()) throw new Error(); } catch { return NextResponse.json({ error: 'invalid', message: `${abs} is not a folder` }, { status: 422 }); }
  // init scans `path` under `repo`; a folder outside the repo is its own repo
  const inside = abs.startsWith(repo + path.sep) || abs === repo;
  const { init } = repoRequire('./lib/init.js') as { init: (o: Record<string, unknown>) => { made: { written: string[]; skipped: string[]; counts: Record<string, number> }; areas: { slug: string; title: string; dir: string; files: string[] }[]; project: string } };
  const r = init({ dataRoot: path.join(REPO_ROOT, 'data'), product, repo: inside ? repo : abs, feature: name, path: inside && abs !== repo ? path.relative(repo, abs) : undefined });
  const built = await rebuild(p.dir);
  const tasks: { id: string; session?: string; error?: string }[] = [];
  if (body.analyse !== false && built.code === 0) {
    const scope = await loadScope(product, r.project);
    const settings = agentSettings(await readSettings());
    if (scope) for (const a of r.areas) {
      const id = `task:${r.project}.describe.${a.slug}`;
      const res = await assignTask(scope, id, { worker: settings.agent, wfUrl: new URL(req.url).origin, by: 'import', force: true, skills: ['skill:describe-module'], note: body.brief?.trim() ? `The person's brief for this import: ${body.brief.trim()}` : undefined });
      tasks.push(res.ok ? { id, session: res.session } : { id, error: res.message });
    }
  }
  return NextResponse.json({ ok: true, project: r.project, written: r.made.written.length, skipped: r.made.skipped.length, counts: r.made.counts, areas: r.areas.map(a => ({ slug: a.slug, title: a.title, dir: a.dir, files: a.files.length })), tasks, rebuilt: built.code === 0 });
}
