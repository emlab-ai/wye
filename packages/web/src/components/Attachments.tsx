'use client';
import { useState } from 'react';

// Images a person pastes (or drops) into a message box before sending: the session composer and the command box
// take them the same way — up to 8, shown as thumbnails with a remove button, sent as data URLs and stored as the
// session's files (store:session-files). Claude Code takes pasted images the same way.
export type Attached = { name: string; dataUrl: string };
export const MAX_IMAGES = 8;

export function useImageAttachments() {
  const [images, setImages] = useState<Attached[]>([]);
  const addFiles = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const rd = new FileReader();
      rd.onload = () => setImages(im => [...im, { name: f.name || 'pasted.png', dataUrl: String(rd.result) }].slice(0, MAX_IMAGES));
      rd.readAsDataURL(f);
    }
  };
  // only an image paste is taken over; text pastes as usual
  const onPaste = (e: React.ClipboardEvent) => { const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); addFiles(files); } };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); addFiles(e.dataTransfer.files); };
  const remove = (i: number) => setImages(x => x.filter((_, k) => k !== i));
  const take = () => { const imgs = images; setImages([]); return imgs; };
  return { images, addFiles, onPaste, onDragOver, onDrop, remove, take, clear: () => setImages([]) };
}

export function AttachStrip({ images, remove }: { images: Attached[]; remove: (i: number) => void }) {
  if (!images.length) return null;
  return <div className="console-attach">{images.map((im, i) => <span key={i} className="console-thumb"><img src={im.dataUrl} alt={im.name} /><button type="button" onClick={() => remove(i)} title="Remove">×</button></span>)}</div>;
}
