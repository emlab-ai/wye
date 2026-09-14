import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkTags from '@/lib/remark-tags';
import { headingSlug, type SplitDoc, type IndexEntry } from '@/lib/doc';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import type { ReactNode } from 'react';

const text = (c: ReactNode): string => Array.isArray(c) ? c.map(text).join('') : typeof c === 'string' ? c : (c && typeof c === 'object' && 'props' in c ? text((c as { props: { children?: ReactNode } }).props.children) : '');

export function Document({ doc, index }: { doc: SplitDoc; index: Record<string, IndexEntry> }) {
  const components = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => href?.startsWith('#tag:') ? <SmartTag id={href.slice(5)} label={text(children)} /> : <a href={href}>{children}</a>,
    h2: ({ children }: { children?: ReactNode }) => <h2 id={headingSlug(text(children))}>{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 id={headingSlug(text(children))}>{children}</h3>,
    table: ({ children }: { children?: ReactNode }) => <div className="tbl"><table>{children}</table></div>,
  };
  return (
    <div className="doc">
      {doc.segments.map((s, i) => s.type === 'hr' ? <hr key={i} /> : s.type === 'markdown'
        ? <ReactMarkdown key={i} remarkPlugins={[remarkGfm, remarkTags]} components={components}>{s.text}</ReactMarkdown>
        : s.chunks.some(c => c.id && index[c.id]?.defined)
          ? <div key={i} className="cards">{s.chunks.map((c, j) => c.id && index[c.id] ? <NodeCard key={c.id + j} id={c.id} body={c.body} entry={index[c.id]} /> : <pre key={j} className="yaml">{c.body}</pre>)}</div>
          : <pre key={i} className="yaml">{s.raw}</pre>)}
    </div>
  );
}
