'use client';
import { useDark } from '@/lib/theme';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { createReactBlockSpec } from '@blocknote/react';
import dynamic from 'next/dynamic';
import '@excalidraw/excalidraw/index.css';
import { describeScene } from '@/lib/annotations';

// An embedded Excalidraw drawing. The markdown keeps a plain image link (![Title](drawings/x.excalidraw)); the scene
// and an SVG export live under docs/drawings/. The page shows the SVG; clicking it opens the full-screen editor.

type ExcalidrawAPI = { getSceneElements: () => readonly unknown[]; getAppState: () => Record<string, unknown>; getFiles: () => Record<string, unknown>; scrollToContent?: (target?: unknown, opts?: { fitToViewport?: boolean; viewportZoomFactor?: number; animate?: boolean }) => void };
type ExcalidrawMod = typeof import('@excalidraw/excalidraw');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Excalidraw = dynamic(() => import('@excalidraw/excalidraw').then(m => m.Excalidraw as unknown as ComponentType<any>), { ssr: false, loading: () => <p className="muted" style={{ padding: 20 }}>Loading the drawing tool…</p> });

export const newDrawingSlug = () => `drawing-${Date.now().toString(36)}`;

function docOf(el: HTMLElement | null): { product: string; project: string } | null {
  const host = el?.closest('.doc-editor') as HTMLElement | null;
  return host?.dataset.product && host.dataset.project ? { product: host.dataset.product, project: host.dataset.project } : null;
}
const api = (d: { product: string; project: string }, src: string) => `/api/${d.product}/${d.project}/drawing/${encodeURIComponent(src.split('/').pop()!)}`;

// Export the scene as SVG + JSON, plus what an agent reads: a flattened PNG and the annotations as text
// (lib/annotations.ts), and store them all beside the scene.
async function store(mod: ExcalidrawMod, d: { product: string; project: string }, src: string, elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>): Promise<boolean> {
  const exportState = { ...appState, exportBackground: false, exportWithDarkMode: false } as never;
  const svgEl = await mod.exportToSvg({ elements: elements as never, appState: exportState, files: files as never });
  const json = mod.serializeAsJSON(elements as never, appState as never, files as never, 'local');
  let png = '';
  try {
    const blob = await mod.exportToBlob({ elements: elements as never, appState: { ...appState, exportBackground: true, viewBackgroundColor: '#ffffff', exportWithDarkMode: false } as never, files: files as never, mimeType: 'image/png', exportPadding: 8 });
    png = await new Promise<string>(res => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(blob); });
  } catch { /* the SVG still shows; the agent gets the text */ }
  const description = describeScene(elements as unknown[]);
  const r = await fetch(api(d, src), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ json, svg: svgEl.outerHTML, png, description }) });
  return r.ok;
}

// A scene whose canvas is an image (assets/<name>): the image sits locked at 0,0 and the annotations go on top.
export async function sceneFromImage(product: string, project: string, slug: string, url: string): Promise<boolean> {
  const mod = await import('@excalidraw/excalidraw');
  const blob = await (await fetch(url)).blob();
  const dataURL = await new Promise<string>(res => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(blob); });
  const { width, height } = await new Promise<{ width: number; height: number }>((res, rej) => { const im = new Image(); im.onload = () => res({ width: im.naturalWidth, height: im.naturalHeight }); im.onerror = rej; im.src = dataURL; });
  const fileId = 'img-' + slug;
  const files = { [fileId]: { id: fileId, dataURL, mimeType: blob.type || 'image/png', created: Date.now() } };
  const elements = mod.convertToExcalidrawElements([{ type: 'image', fileId, x: 0, y: 0, width, height, locked: true, customData: { asset: url.replace(/^.*\/d\//, '') } } as never]);
  return store(mod, { product, project }, `drawings/${slug}.excalidraw`, elements, { viewBackgroundColor: '#ffffff' }, files);
}

// A scene holding one monospace text element — the starting point when a code block (ASCII diagram) is converted.
export async function sceneFromText(product: string, project: string, slug: string, text: string): Promise<boolean> {
  const mod = await import('@excalidraw/excalidraw');
  const elements = mod.convertToExcalidrawElements([{ type: 'text', x: 0, y: 0, text, fontFamily: 3, fontSize: 16 } as never]);
  return store(mod, { product, project }, `drawings/${slug}.excalidraw`, elements, { viewBackgroundColor: '#ffffff' }, {});
}

function DrawingEditor({ doc, src, title, onClose, onSaved }: { doc: { product: string; project: string }; src: string; title: string; onClose: () => void; onSaved: () => void }) {
  const [initial, setInitial] = useState<Record<string, unknown> | null | undefined>(undefined);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const [busy, setBusy] = useState(false);
  const dark = useDark();
  useEffect(() => { fetch(api(doc, src)).then(r => r.ok ? r.json() : null).then(j => setInitial(j ? { elements: j.elements ?? [], appState: { ...(j.appState ?? {}), collaborators: new Map() }, files: j.files ?? {}, scrollToContent: true } : null)); }, [doc, src]);
  const done = async () => {
    const a = apiRef.current; if (!a) { onClose(); return; }
    setBusy(true);
    const mod = await import('@excalidraw/excalidraw');
    const ok = await store(mod, doc, src, a.getSceneElements(), a.getAppState(), a.getFiles());
    setBusy(false);
    if (ok) { onSaved(); onClose(); } else alert('saving the drawing failed');
  };
  return createPortal(
    <div className="drawing-modal" role="dialog" aria-label={title}>
      <div className="drawing-modal-bar"><strong>{title}</strong><span className="muted">{src}</span><button className="pri" disabled={busy} onClick={done}>{busy ? 'Saving…' : 'Done'}</button><button onClick={onClose}>Cancel</button></div>
      <div className="drawing-modal-canvas">{initial !== undefined && <Excalidraw initialData={initial ?? undefined} excalidrawAPI={(a: ExcalidrawAPI) => { apiRef.current = a; setTimeout(() => a.scrollToContent?.(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 }), 50); }} theme={dark ? 'dark' : 'light'} />}</div>
    </div>, document.body);
}

export const DrawingBlock = createReactBlockSpec(
  { type: 'drawing', propSchema: { src: { default: '' }, title: { default: 'Drawing' } }, content: 'none' },
  {
    render: props => {
      const p = props.block.props as { src: string; title: string };
      const ref = useRef<HTMLDivElement>(null);
      const [doc, setDoc] = useState<{ product: string; project: string } | null>(null);
      const [version, setVersion] = useState(0);
      const [exists, setExists] = useState<boolean | null>(null);
      const [editing, setEditing] = useState(false);
      useEffect(() => { setDoc(docOf(ref.current)); }, []);
      // a block converted from an image asks to open the editor straight away (window event from the editor)
      useEffect(() => { const h = (e: Event) => { if ((e as CustomEvent<string>).detail === p.src) setEditing(true); }; window.addEventListener('wf:drawing-edit', h); return () => window.removeEventListener('wf:drawing-edit', h); }, [p.src]);
      useEffect(() => { if (!doc) return; let live = true; fetch(api(doc, p.src) + '?fmt=svg', { method: 'HEAD' }).then(r => { if (live) setExists(r.ok); }); return () => { live = false; }; }, [doc, p.src, version]);
      const set = (patch: Partial<typeof p>) => props.editor.updateBlock(props.block, { props: { ...p, ...patch } } as never);
      return (
        <div className="drawing" ref={ref} contentEditable={false} data-src={p.src}>
          <div className="drawing-head">
            <span>✎ drawing</span>
            <input value={p.title} onChange={e => set({ title: e.target.value })} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} placeholder="title" />
            <button onClick={() => setEditing(true)} disabled={!doc}>Edit</button>
          </div>
          {exists ? (
            <a className="drawing-preview" onClick={() => setEditing(true)} title="Click to edit">{doc && <img src={`${api(doc, p.src)}?fmt=svg&v=${version}`} alt={p.title} />}</a>
          ) : (
            <div className="drawing-preview empty" onClick={() => setEditing(true)}>{exists === null ? '…' : 'Empty drawing — click to draw'}</div>
          )}
          {editing && doc && <DrawingEditor doc={doc} src={p.src} title={p.title} onClose={() => setEditing(false)} onSaved={() => setVersion(v => v + 1)} />}
        </div>
      );
    },
  },
);
