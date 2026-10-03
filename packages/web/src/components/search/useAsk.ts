'use client';
import { useCallback, useRef, useState } from 'react';
import { askReducer, initialAsk, type AskState } from '@/lib/ask/reducer';
import type { AskEvent } from '@/lib/ask/types';

// One question at a time per panel: asking again, or reset, aborts the one in flight (the server kills both lanes).
export function useAsk(product: string) {
  const [state, setState] = useState<AskState | null>(null);
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const ac = useRef<AbortController | null>(null);
  const last = useRef<AskState | null>(null); last.current = state;
  const ask = useCallback((q: string) => {
    ac.current?.abort(); const c = new AbortController(); ac.current = c;
    const prev = last.current;   // the answered question becomes context for the follow-up
    const h = prev?.fastDone && prev.fast ? [...history, { q: prev.q, a: prev.fast }].slice(-3) : history;
    setHistory(h); setState(initialAsk(q));
    (async () => {
      try {
        const r = await fetch(`/api/${product}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, history: h }), signal: c.signal });
        if (!r.ok || !r.body) { setState(s => s && askReducer(s, { type: 'error', lane: 'retrieve', message: `ask failed (${r.status})` })); return; }
        const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); const d = block.split('\n').find(l => l.startsWith('data: ')); if (d) { const e = JSON.parse(d.slice(6)) as AskEvent; setState(s => s && askReducer(s, e)); } }
        }
      } catch (e) { if (!c.signal.aborted) setState(s => s && askReducer(s, { type: 'error', lane: 'retrieve', message: String(e) })); }
    })();
  }, [product, history]);
  const reset = useCallback(() => { ac.current?.abort(); setState(null); setHistory([]); }, []);
  return { state, history, ask, reset };
}
