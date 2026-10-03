// Pinned documents (decision:wf2.pinned-documents): `pinned: [project/doc, …]` in the product's _product.md, shown at
// the top of the rail in pin order. Pure.
export type PinDoc = { project: string; slug: string; title: string; icon: string };
export type Pin = PinDoc & { ref: string };

export const parsePins = (v?: string): string[] => (v ?? '').trim().replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
export const formatPins = (list: string[]): string => `[${list.join(', ')}]`;
export function togglePin(list: string[], ref: string, on: boolean): string[] {
  const rest = list.filter(r => r !== ref);
  return on ? (list.includes(ref) ? list : [...rest, ref]) : rest;
}
// a pin whose document is gone is not shown (and goes from the file the next time the list is written)
export function resolvePins(list: string[], docs: PinDoc[]): Pin[] {
  const by = new Map(docs.map(d => [`${d.project}/${d.slug}`, d]));
  return list.map(ref => { const d = by.get(ref); return d ? { ref, ...d } : null; }).filter((p): p is Pin => !!p);
}
