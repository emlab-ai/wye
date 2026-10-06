import { redirect } from 'next/navigation';
import { listProducts } from '@/lib/products';
import { workspaceView } from '@/lib/workspace';
import { Welcome } from '@/components/Welcome';
import { WorkspaceEmpty } from '@/components/WorkspaceEmpty';

// The app's first address: the first vault of the open workspace. A folder that holds no vault yet says so and offers
// to make one (req:wf2.workspace-open); no product anywhere is the Welcome.
export default async function Home() {
  const products = await listProducts();
  const ws = await workspaceView(products);
  if (ws.folder && !ws.vaults.length) return <WorkspaceEmpty workspace={{ folder: ws.folder, name: ws.name, recent: ws.recent }} />;
  if (!products.length) return <Welcome />;
  redirect(`/${(ws.vaults[0] ?? products[0]).slug}`);
}
