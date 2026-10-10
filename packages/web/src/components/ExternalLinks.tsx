'use client';
import { useEffect } from 'react';

// A link to another site opens outside the app: a new tab in the browser, the system browser in the desktop app
// (rule:app-link). Links the app or its editors render without target=_blank are caught here, before navigation.
export function ExternalLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      let u: URL; try { u = new URL(a.href, location.href); } catch { return; }
      if (!/^https?:$/.test(u.protocol) || u.origin === location.origin) return;
      e.preventDefault();
      window.open(u.href, '_blank', 'noopener,noreferrer');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
