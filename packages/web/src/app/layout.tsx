import Script from 'next/script';
import './globals.css';
import type { ReactNode } from 'react';
import { THEME_BOOT } from '@/lib/theme';

export const metadata = { title: 'Wye' };
// Every page reads the products on disk when it is asked for, never at build time: a prerendered page would show the
// build machine's products — stale for whoever runs the app, and a leak in the published package.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* the theme before first paint, without a flash: next/script beforeInteractive (a raw <script> in a component warns in React 19) */}
      <head><Script id="theme-boot" strategy="beforeInteractive">{THEME_BOOT}</Script></head>
      <body>{children}</body>
    </html>
  );
}
