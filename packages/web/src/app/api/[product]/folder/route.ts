import { NextResponse } from 'next/server';
import { access, mkdir, readdir, rename, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getProduct, registryDir, resolveRoot } from '@/lib/products';
import { writeAtomic, rebuild } from '@/lib/write';

// op:api.folder (decision:wf2.product-folder) — GET → where the product's folder is (root, default or not, and what
// it holds). PUT { root } → moves everything but _product.md (projects, _build, _sessions, _changes, _hooks, inbox,
// _agent.md) from the current folder into `root` (created; `~` allowed; empty or absent), writes `root:` into the
// registry's _product.md and rebuilds; PUT { root: '' } moves it all back under <data>/products/<slug>.
const MOVED = ['projects', '_build', '_sessions', '_changes', '_hooks', '_impact', 'inbox', '_agent.md'];

export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let held: string[] = []; try { held = (await readdir(p.dir)).filter(n => MOVED.includes(n)); } catch { /* none */ }
  return NextResponse.json({ root: p.meta.settings.root ?? '', dir: p.dir, default: registryDir(product), isDefault: p.dir === registryDir(product), held });
}

export async function PUT(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { root?: string };
  const root = (body.root ?? '').trim();
  const target = root ? resolveRoot(root) : registryDir(product);
  if (target === p.dir) return NextResponse.json({ ok: true, dir: target, moved: [] });
  if (root && (target === registryDir(product) || target.startsWith(registryDir(product) + path.sep))) return NextResponse.json({ error: 'invalid', message: 'that is the registry folder itself' }, { status: 422 });
  if (root && p.dir.startsWith(target + path.sep)) return NextResponse.json({ error: 'invalid', message: 'the new folder cannot contain the current one' }, { status: 422 });
  // the target must be empty of anything that would collide
  await mkdir(target, { recursive: true });
  const there = (await readdir(target)).filter(n => MOVED.includes(n));
  if (there.length) return NextResponse.json({ error: 'conflict', message: `${target} already holds ${there.join(', ')} — pick an empty folder or move by hand` }, { status: 409 });
  const moved: string[] = [];
  for (const n of MOVED) {
    const from = path.join(p.dir, n); try { await access(from); } catch { continue; }
    try { await rename(from, path.join(target, n)); moved.push(n); }
    catch (e) { return NextResponse.json({ error: 'invalid', message: `could not move ${n}: ${e instanceof Error ? e.message : e} (a folder on another disk must be moved by hand)`, moved }, { status: 422 }); }
  }
  // the registry entry points at the folder
  const reg = path.join(registryDir(product), '_product.md');
  let md = ''; try { md = await readFile(reg, 'utf8'); } catch { md = `---\ntitle: ${p.meta.title}\n---\n`; }
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const lines = (fm ? fm[1] : '').split('\n').filter(l => !/^root:/.test(l));
  if (root) lines.push(`root: ${root}`);
  const next = `---\n${lines.filter(Boolean).join('\n')}\n---` + (fm ? md.slice(fm[0].length) : '\n');
  await mkdir(registryDir(product), { recursive: true });
  await writeAtomic(reg, next);
  try { await stat(path.join(target, 'projects')); await rebuild(target); } catch { /* nothing to build yet */ }
  return NextResponse.json({ ok: true, dir: target, moved });
}
