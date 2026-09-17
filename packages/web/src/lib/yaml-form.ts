// Form ↔ yaml for one node chunk. Pure; used by the card editor (client) and tested with vitest.
export interface FormField { key: string; value: string; kind: 'text' | 'prose' | 'list' | 'nested' }

const PROSE = new Set(['when', 'then', 'unless', 'statement', 'description', 'purpose', 'context', 'choice', 'consequences', 'intent', 'q', 'note', 'notes']);
const LIST = new Set(['satisfied-by', 'verified-by', 'requires-tests', 'refines', 'governed-by', 'gated-by', 'applies-to', 'governs', 'resolves', 'see', 'reads', 'writes', 'calls', 'contradicts', 'submodules', 'documents', 'projects', 'states', 'terminal', 'roles', 'affects']);

// Parse a chunk body into ordered fields. Nested blocks (fields:, transitions:, edges:, actions:, …) stay raw.
export function bodyToFields(body: string): { id: string; fields: FormField[] } {
  const lines = body.split('\n');
  let id = '';
  const fields: FormField[] = [];
  let cur: FormField | null = null; let block = false;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 ()|_-]*?):(?:\s+(.*))?$/);
    if (m && !/^\s/.test(line)) {
      if (cur) fields.push(finish(cur, block));
      const key = m[1].trim(); const raw = (m[2] ?? '').trim();
      if (key === 'id') { id = raw; cur = null; continue; }
      block = raw === '>' || raw === '|';
      const kind: FormField['kind'] = PROSE.has(key) ? 'prose' : LIST.has(key) || /^\[.*\]$/.test(raw) ? 'list' : raw === '' && !block ? 'nested' : 'text';
      cur = { key, value: block ? '' : raw, kind };
      continue;
    }
    if (!cur) continue;
    if (block) cur.value = cur.value ? cur.value + ' ' + line.trim() : line.trim();
    else { cur.kind = cur.kind === 'list' && cur.value === '' ? 'nested' : cur.kind; cur.value = cur.value ? cur.value + '\n' + line : line; }
  }
  if (cur) fields.push(finish(cur, block));
  return { id, fields };
}
function finish(f: FormField, wasBlock: boolean): FormField {
  if (f.kind === 'list') { const m = f.value.match(/^\[(.*)\]$/s); if (m) f.value = m[1].split(/,\s*(?![^()]*\))/).map(x => x.trim()).filter(Boolean).join(', '); }
  if (f.kind === 'text' && f.value.includes('\n')) f.kind = 'nested';
  void wasBlock;
  return f;
}

// Serialise fields back to a chunk body. Prose with newlines or over 100 chars becomes a `>` block; lists are flow lists.
export function fieldsToBody(id: string, fields: FormField[]): string {
  const out = [`id: ${id}`];
  for (const f of fields) {
    const v = f.value.trim();
    if (f.kind === 'list') { out.push(`${f.key}: [${v.split(/,\s*/).map(x => x.trim()).filter(Boolean).join(', ')}]`); continue; }
    if (f.kind === 'nested') { if (v) out.push(`${f.key}:`, ...v.split('\n').map(l => l.startsWith(' ') ? l : '  ' + l)); else out.push(`${f.key}:`); continue; }
    if (f.kind === 'prose' && (v.includes('\n') || v.length > 100)) { out.push(`${f.key}: >`, ...wrap(v, 110).map(l => '  ' + l)); continue; }
    if (v === '') continue;
    out.push(`${f.key}: ${v}`);
  }
  return out.join('\n');
}

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s*\n\s*/g, ' ').split(' ');
  const lines: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > width && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines;
}

// Set (or remove) one prose field of a chunk body, keeping every other field as written.
export function setBodyField(body: string, key: string, value: string): string {
  const { id, fields } = bodyToFields(body);
  const i = fields.findIndex(f => f.key === key);
  if (!value.trim()) { if (i >= 0) fields.splice(i, 1); }
  else if (i >= 0) fields[i] = { ...fields[i], value, kind: fields[i].kind === 'list' || fields[i].kind === 'nested' ? fields[i].kind : 'prose' };
  else { const at = fields.findIndex(f => f.key === 'status'); const f = { key, value, kind: 'prose' as const }; if (at >= 0) fields.splice(at, 0, f); else fields.push(f); }
  return fieldsToBody(id, fields);
}
