import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkTags from '@/lib/remark-tags';
import { headingSlug, type SplitDoc, type IndexEntry } from '@/lib/doc';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import type { ReactNode } from 'react';

const text = (c: ReactNode): string => Array.isArray(c) ? c.map(text).join('') : typeof c === 'string' ? c : (c && typeof c === 'object' && 'props' in c ? text((c as { props: { children?: ReactNode } }).props.children) : '');

// Read-only rendering of a document (server component). Shown until the editor hydrates, and used by anything
// that needs the document as text without editing.
export function DocumentReader({ doc, index }: { doc: SplitDoc; index: Record<string, IndexEntry> }) {
  const components = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => href?.startsWith('#tag:') ? <SmartTag id={href.slice(5)} label={text(children)} /> : href && /^[a-z-]+:[A-Za-z0-9_./#-]+$/.test(href) && !href.includes('//') ? <SmartTag id={href} label={text(children)} /> : <a href={href}>{children}</a>,
    h2: ({ children }: { children?: ReactNode }) => <h2 id={headingSlug(text(children))}>{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 id={headingSlug(text(children))}>{children}</h3>,
    table: ({ children }: { children?: ReactNode }) => <div className="tbl"><table>{children}</table></div>,
  };
  return (
    <div className="doc">
      {doc.segments.map((s, i) => {
        if (s.type === 'hr') return <hr key={i} />;
        if (s.type === 'markdown') return <ReactMarkdown key={i} remarkPlugins={[remarkGfm, remarkTags]} components={components}>{s.text}</ReactMarkdown>;
        const anyDefined = s.chunks.some(c => c.id && index[c.id]?.defined);
        return <div key={i} className="cards">{anyDefined ? s.chunks.map((c, j) => c.id && index[c.id] ? <NodeCard key={c.id + j} id={c.id} body={c.body} entry={index[c.id]} /> : <pre key={j} className="yaml">{c.body}</pre>) : <pre className="yaml">{s.raw}</pre>}</div>;
      })}
    </div>
  );
}
