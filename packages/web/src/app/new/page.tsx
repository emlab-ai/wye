import { AddProduct, type Way } from '@/components/AddProduct';

// the ways by key, kept here: a value exported from the client module would be a client reference on the server
const WAYS: Way[] = ['code', 'new', 'open', 'import'];

// Add a product: from a code folder, blank, an open folder or an imported file (components/AddProduct); `?way=` picks one
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ way?: string }> }) {
  const { way } = await searchParams;
  return (
    <div className="page" style={{ maxWidth: 600, margin: '60px auto' }}>
      <h1 className="prop-in h1" style={{ margin: '0 0 12px' }}>Add a product</h1>
      <AddProduct start={WAYS.includes(way as Way) ? way as Way : 'new'} />
    </div>
  );
}
