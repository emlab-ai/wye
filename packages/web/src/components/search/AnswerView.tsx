'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@/lib/ask/types';

// An answer with its [n] citations as buttons: hover previews the source, click opens it.
export function AnswerView({ text, cites, onCite, onHover }: { text: string; cites: Record<number, Citation>; onCite: (c: Citation) => void; onHover: (c: Citation) => void }) {
  const md = text.replace(/\[(\d+)\]/g, (m, n) => cites[Number(n)] ? `[${n}](#cite-${n})` : m);
  return (
    <div className="ask-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => {
        const n = href?.startsWith('#cite-') ? Number(href.slice(6)) : 0; const c = n ? cites[n] : undefined;
        return c ? <button type="button" className="ask-cite" title={c.title} onMouseEnter={() => onHover(c)} onClick={() => onCite(c)}>{n}</button> : <a href={href}>{children}</a>;
      } }}>{md}</ReactMarkdown>
    </div>
  );
}
