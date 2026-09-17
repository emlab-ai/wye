// Annotations as text: what an Excalidraw scene says about the image under it, for an agent that reads words —
// labelled regions with their place on the image, arrows by what they connect, free labels. Regenerated on every
// save of a drawing (drawings/<slug>.md), never hand-edited.
type El = { id: string; type: string; x: number; y: number; width: number; height: number; text?: string; containerId?: string | null; isDeleted?: boolean; points?: number[][]; startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null; boundElements?: { id: string; type: string }[] | null; fileId?: string; customData?: Record<string, unknown> };

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);

export function describeScene(elements: unknown[]): string {
  const els = (elements as El[]).filter(e => e && !e.isDeleted);
  const byId = new Map(els.map(e => [e.id, e]));
  const image = els.find(e => e.type === 'image');
  const frame = image ? { x: image.x, y: image.y, w: image.width, h: image.height } : null;
  const labelOf = (e: El): string => {
    const t = (e.boundElements ?? []).map(b => byId.get(b.id)).find(b => b && b.type === 'text');
    return (t?.text ?? '').replace(/\s+/g, ' ').trim();
  };
  const pct = (v: number, of: number) => Math.round(Math.max(0, Math.min(1, v / of)) * 100);
  const where = (e: El): string => {
    if (!frame) return `at (${Math.round(e.x)}, ${Math.round(e.y)}) ${Math.round(e.width)}×${Math.round(e.height)}`;
    const x1 = pct(e.x - frame.x, frame.w), x2 = pct(e.x - frame.x + e.width, frame.w), y1 = pct(e.y - frame.y, frame.h), y2 = pct(e.y - frame.y + e.height, frame.h);
    return `${zone((x1 + x2) / 2, (y1 + y2) / 2)} (x ${x1}–${x2}%, y ${y1}–${y2}%)`;
  };
  const point = (x: number, y: number): string => frame ? `(${pct(x - frame.x, frame.w)}%, ${pct(y - frame.y, frame.h)}%)` : `(${Math.round(x)}, ${Math.round(y)})`;
  const centre = (e: El) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
  const regions = els.filter(e => SHAPES.has(e.type));
  const nearest = (x: number, y: number): El | undefined => {
    let best: El | undefined, d = Infinity;
    for (const r of regions) { const c = centre(r); const dd = Math.hypot(c.x - x, c.y - y); if (dd < d) { d = dd; best = r; } }
    return best && labelOf(best) ? best : undefined;
  };
  const out: string[] = [];
  if (image) out.push(`image ${String(image.customData?.asset ?? image.fileId ?? '')}, ${Math.round(image.width)}×${Math.round(image.height)}`.replace(/ ,/, ','));
  for (const r of regions) { const l = labelOf(r); if (l) out.push(`region "${l}" — ${r.type}, ${where(r)}`); }
  for (const a of els.filter(e => e.type === 'arrow' || e.type === 'line')) {
    const from = a.startBinding && byId.get(a.startBinding.elementId), to = a.endBinding && byId.get(a.endBinding.elementId);
    const l = labelOf(a); const tag = l ? `arrow "${l}"` : 'arrow';
    if (from && to && labelOf(from) && labelOf(to)) { out.push(`${tag} from "${labelOf(from)}" to "${labelOf(to)}"`); continue; }
    const pts = a.points && a.points.length ? a.points : [[0, 0], [a.width, a.height]];
    const p0 = pts[0], p1 = pts[pts.length - 1];
    const sx = a.x + p0[0], sy = a.y + p0[1], ex = a.x + p1[0], ey = a.y + p1[1];
    const near = (to && labelOf(to)) || (from && labelOf(from)) || labelOf(nearest(ex, ey) ?? nearest(sx, sy) ?? ({} as El));
    out.push(`${tag} from ${from && labelOf(from) ? `"${labelOf(from)}"` : point(sx, sy)} to ${to && labelOf(to) ? `"${labelOf(to)}"` : point(ex, ey)}${near && !(from && labelOf(from)) && !(to && labelOf(to)) ? ` — near "${near}"` : ''}`);
  }
  for (const t of els.filter(e => e.type === 'text' && !e.containerId && (e.text ?? '').trim())) out.push(`label "${(t.text ?? '').replace(/\s+/g, ' ').trim()}" at ${point(t.x, t.y)}`);
  const marks = els.filter(e => e.type === 'freedraw').length;
  if (marks) out.push(`${marks} freehand mark${marks === 1 ? '' : 's'}`);
  return out.join('\n');
}

// "top-left" … "centre" from a point in image percentages
function zone(x: number, y: number): string {
  const col = x < 33 ? 'left' : x > 66 ? 'right' : 'centre', row = y < 33 ? 'top' : y > 66 ? 'bottom' : 'middle';
  return row === 'middle' && col === 'centre' ? 'centre' : row === 'middle' ? `${col} middle` : col === 'centre' ? `${row} centre` : `${row}-${col}`;
}
