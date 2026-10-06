import { FileView } from '@/components/FileView';

// A file of the open folder as a tab (req:wf2.workspace-files, decision:wf2.files-are-code-tabs): the address names
// the file under the workspace's folder; the page is the code view and nothing else.
export default async function FilePage({ params }: { params: Promise<{ product: string; path: string[] }> }) {
  const { product, path } = await params;
  return <FileView product={product} file={path.map(decodeURIComponent).join('/')} />;
}
