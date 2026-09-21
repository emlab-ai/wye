import { headers } from 'next/headers';

// Is this render for the router (a refresh or a client navigation — an RSC request) rather than a full page load?
// Next strips its own `rsc` header before `headers()`, so the fetch metadata tells: the router fetches with
// sec-fetch-dest "empty" (a document load says "document"), and accepts text/x-component. A plain curl counts as a
// full load. Used to leave the node index and the server-rendered reader out of a refresh (decision:wf2.parse-cache).
export async function isRscRequest(): Promise<boolean> {
  const h = await headers();
  const dest = h.get('sec-fetch-dest');
  if (dest) return dest !== 'document';
  return (h.get('accept') ?? '').includes('text/x-component');
}
