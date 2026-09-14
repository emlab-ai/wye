import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkTags from '@/lib/remark-tags';
import { headingSlug, type SplitDoc, type IndexEntry } from '@/lib/doc';
import { SmartTag } from './SmartTag';
import { SectionEditor } from './SectionEditor';
import { CardEditor } from './CardEditor';
import { AddCard } from './AddCard';
import type { ReactNode } from 'react';

const text = (c: ReactNode): string => Array.isArray(c) ? c.map(text).join('') : typeof c === 'string' ? c : (c && typeof c === 'object' && 'props' in c ? text((c as { props: { children?: ReactNode } }).props.children) : '');

// hashes[i] is the sha256 of markdown segment i's text, or an array of chunk hashes for a yaml segment.
export function Document({ doc, index, project, slug, hashes }: { doc: SplitDoc; index: Record<string, IndexEntry>; project: string; slug: string; hashes: (string | string[] | null)[] }) {
  const components = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => href?.startsWith('#tag:') ? <SmartTag id={href.slice(5)} label={text(children)} /> : <a href={href}>{children}</a>,
    h2: ({ children }: { children?: ReactNode }) => <h2 id={headingSlug(text(children))}>{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 id={headingSlug(text(children))}>{children}</h3>,
    table: ({ children }: { children?: ReactNode }) => <div className="tbl"><table>{children}</table></div>,
  };
  return (
    <div className="doc">
      {doc.segments.map((s, i) => {
        if (s.type === 'hr') return <hr key={i} />;
        if (s.type === 'markdown') {
          return (
            <div key={i}>
              <SectionEditor project={project} slug={slug} index={i} text={s.text} ifMatch={hashes[i] as string}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkTags]} components={components}>{s.text}</ReactMarkdown>
              </SectionEditor>
              {doc.segments[i + 1]?.type !== 'yaml' && <AddCard project={project} slug={slug} segment={i} mode="insert-after" />}
            </div>
          );
        }
        const chunkHashes = (hashes[i] as string[] | null) ?? [];
        const anyDefined = s.chunks.some(c => c.id && index[c.id]?.defined);
        return (
          <div key={i} className="cards">
            {anyDefined ? s.chunks.map((c, j) => c.id && index[c.id]
              ? <CardEditor key={c.id + j} project={project} slug={slug} segment={i} chunk={j} id={c.id} body={c.body} ifMatch={chunkHashes[j]} entry={index[c.id]} />
              : <pre key={j} className="yaml">{c.body}</pre>)
              : <pre className="yaml">{s.raw}</pre>}
            <AddCard project={project} slug={slug} segment={i} mode="append" />
          </div>
        );
      })}
    </div>
  );
}
