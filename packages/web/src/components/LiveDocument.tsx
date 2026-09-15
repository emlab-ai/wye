'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';

const DocEditor = dynamic(() => import('./DocEditor'), { ssr: false });

// Shows the server-rendered reader until the client is ready, then the single-page editor takes over.
export function LiveDocument({ product, project, slug, body, ifMatch, children }: { product: string; project: string; slug: string; body: string; ifMatch: string; children: ReactNode }) {
  const [client, setClient] = useState(false);
  useEffect(() => { setClient(true); }, []);
  if (!client) return <>{children}</>;
  return <DocEditor product={product} project={project} slug={slug} body={body} ifMatch={ifMatch} fallback={children} />;
}
