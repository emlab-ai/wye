'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkTags from '@/lib/remark-tags';
import { appLink, appLinkLabel, docTitles } from '@/lib/app-link';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';

// The one markdown renderer for conversation and session text (rule:app-link): GFM, every kind:slug id a tag, and
// a link into this app shown as what it points at — `TODO › task:x` (the tag opens the peek), `session <id>`,
// `Wye` — navigating client-side so the right column keeps its stack; any other link leaves the app in a
// new tab (the desktop opens it in the system browser). The app's origin is read from the page, never hard-wired.
export function TranscriptMarkdown({ children }: { children: string }) {
  const { index } = usePeek();
  const titles = useMemo(() => docTitles(index), [index]);
  const [origin, setOrigin] = useState(''); // the page's origin, known after mount — the server render shows plain links
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      if (href?.startsWith('#tag:')) return <SmartTag id={href.slice(5)} label={text(children)} />;
      const l = href && origin ? appLink(href, origin) : null;
      if (!l) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
      const lab = appLinkLabel(l, titles);
      return <span className="app-link" title={href}><Link href={l.path + (lab.node ? '' : l.hash)}>{lab.text}</Link>{lab.node && <> › <SmartTag id={lab.node} /></>}</span>;
    },
  }), [titles, origin]);
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkTags]} components={components}>{children}</ReactMarkdown>;
}

function text(n: ReactNode): string { return typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : ''; }

// a single line break in what a person typed stays a line break in markdown
export function keepBreaks(t: string): string { return t.replace(/([^\n])\n(?!\n)/g, '$1  \n'); }
