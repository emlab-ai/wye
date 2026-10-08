import { cookies } from 'next/headers';
import './globals.css';
import type { ReactNode } from 'react';
import { ThemeSync } from '@/components/ThemeSync';
import { ExternalLinks } from '@/components/ExternalLinks';

export const metadata = { title: 'Wye' };
// Every page reads the products on disk when it is asked for, never at build time: a prerendered page would show the
// build machine's products — stale for whoever runs the app, and a leak in the published package.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  // the theme before first paint, with no script: a light or dark choice is a cookie the server reads (lib/theme);
  // `system` sets nothing and the CSS follows prefers-color-scheme
  const choice = (await cookies()).get('wf-theme')?.value;
  return (
    <html lang="en" suppressHydrationWarning data-theme={choice === 'dark' || choice === 'light' ? choice : undefined}>
      <body><ThemeSync /><ExternalLinks />{children}</body>
    </html>
  );
}
