// No projects (decision:wf2.no-projects): a product's folders of documents — projects/<slug>/ on disk — are shown as
// top-level documents in the tree, each holding its own documents, and open the folder's page. Client-safe.
import type { TreeItem } from '@/components/DocTree';

export function folderItems(folders: { slug: string; title: string; icon: string; roots: TreeItem[] }[], base: string): TreeItem[] {
  return folders.map(f => ({ slug: `~folder:${f.slug}`, node: '', title: f.title, icon: f.icon || '📁', project: f.slug, href: `${base}/${f.slug}`, folder: true, children: f.roots }));
}
