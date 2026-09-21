import './globals.css';
import type { ReactNode } from 'react';
import { THEME_BOOT } from '@/lib/theme';

export const metadata = { title: 'Wye' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body>{children}</body>
    </html>
  );
}
