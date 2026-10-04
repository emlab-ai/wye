// The import lane's shared brief and its sorting of files (decision:wf2.import-lane). One agent session takes a
// whole import, files arriving as messages; what every file needs — the product's types, the ids of the people,
// projects and the like it already has, the commands, one finished page — goes once into the session's system text,
// a stable prefix the model caches, instead of each file's agent looking it all up again (a third of its time).
// Pure: the caller hands in the graph's nodes and the pages.

export type BriefNode = { id: string; kind: string; title: string; body?: string; file?: string; defined?: boolean };
export type Triage = 'skip' | 'small' | 'dense';
export type LaneFile = { index: number; slug: string; ref: string; title: string; from: string; text: string };

// kinds that are statements or work, not things to link to: never in the id index
const NOT_ENTITIES = new Set(['block', 'prop', 'module', 'type', 'kind', 'skill', 'hook', 'workflow', 'stage', 'task', 'question', 'decision', 'constraint', 'req', 'rule', 'lesson', 'consequence', 'context', 'alternative', 'statement', 'choice', 'idea', 'goal', 'contribution', 'commitment', 'meeting', 'risk', 'test', 'pr', 'rationale', 'fact', 'customer-ask']);
const line = (body: string | undefined, key: string) => body?.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();

// Types: one line each — the purpose, where instances live, the fields.
export function typesSection(nodes: BriefNode[]): string {
  const types = nodes.filter(n => n.kind === 'type' && n.defined).sort((a, b) => a.id.localeCompare(b.id));
  if (!types.length) return '';
  const rows = types.map(t => {
    const props = (t.body ?? '').split('\n').reduce<{ on: boolean; out: string[] }>((acc, l) => {
      if (/^props:\s*$/.test(l)) return { on: true, out: acc.out };
      if (acc.on && /^\s{2}[\w-]+:/.test(l)) acc.out.push(l.trim().replace(/\s+#.*$/, '').replace(/\s*-\(inverse\)->.*$/, ''));
      else if (acc.on && /^\S/.test(l)) acc.on = false;
      return acc;
    }, { on: false, out: [] }).out;
    const home = line(t.body, 'home');
    return `- \`${t.id}\` — ${line(t.body, 'purpose') ?? t.title}${home ? ` · home ${home}` : ''}${props.length ? ` · ${props.join('; ')}` : ''}`;
  });
  return `## The product's types\n\nWrite instances of these with their fields; a type's \`home\` is the page its instances go on (\`wye node add <type>:<slug> --title "…"\` puts them there).\n\n${rows.join('\n')}`;
}

// The ids the product already has for things a note talks about — people, projects, customers, teams… — with the
// names they go by, so a mention is matched without a search. Capped so the brief stays a few thousand tokens.
export function idIndex(nodes: BriefNode[], cap = 900): string {
  const typed = new Set(nodes.filter(n => n.kind === 'type').map(n => n.id.slice(5)));
  const ents = nodes.filter(n => n.defined && typed.has(n.kind) && !NOT_ENTITIES.has(n.kind));
  if (!ents.length) return '';
  const byKind = new Map<string, BriefNode[]>();
  for (const e of ents) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind)!.push(e); }
  const parts: string[] = []; let n = 0;
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    const rows: string[] = [];
    for (const e of list.sort((a, b) => a.id.localeCompare(b.id))) {
      if (n++ >= cap) break;
      const aliases = line(e.body, 'aliases')?.replace(/^\[|\]$/g, '');
      const role = line(e.body, 'role');
      rows.push(`- ${e.id} ${e.title}${aliases ? ` (also: ${aliases})` : ''}${role ? ` — ${role}` : ''}`);
    }
    if (rows.length) parts.push(`### ${kind} (${list.length})\n${rows.join('\n')}`);
  }
  return `## What the product already has\n\nLink a mention to these ids; create a new one only when nobody here matches (the same person under a nickname is the same id — add the nickname to \`aliases\`).\n\n${parts.join('\n\n')}`;
}

// How the lane works, for the agent: files come as messages, the pages inline; one reply per message.
export function laneProtocol(product: string): string {
  return `## This is an import lane

You import a whole batch of notes, one message at a time — sometimes several short notes in one message. Each message
carries the pages as they are now, so you do not need \`wye doc\` to read them. For each page:

1. Decide what it states, using the brief above: the types, and the ids that already exist. Do not list people,
   projects or types again with grep or \`wye graph\` — they are above. Look something up only when you need a detail
   the brief does not have (\`wye node <id>\`).
2. Rewrite it in place: \`wye doc write ${product}/<project>/<doc> --file <new.md>\` — every sentence kept, the blocks
   where they stood, all \`status: proposed\`, front matter \`status: analysed\`.
3. New things (a person, a project…) with \`wye node add <type>:<slug> --title "…"\`. Ids you created earlier in this
   conversation are known — reuse them, do not search for them.

After the last page of a message: \`wye check --root data/products/${product}\` once, fix the errors you made, then
reply with one line per page — \`done <doc> — <n> blocks\` or \`skipped <doc> — <why>\` — and nothing else. Do not run
\`wye session done\` and do not mark import tasks: the import closes this session and checks each file off itself.`;
}

export function laneSystem(opts: { product: string; skill: string; nodes: BriefNode[]; example?: { ref: string; text: string } }): string {
  const ex = opts.example ? `## A page this import already finished (\`${opts.example.ref}\`)\n\n\`\`\`markdown\n${opts.example.text.split('\n').slice(0, 90).join('\n')}\n\`\`\`` : '';
  return [opts.skill.trim(), laneProtocol(opts.product), typesSection(opts.nodes), idIndex(opts.nodes), ex].filter(Boolean).join('\n\n');
}

// What a file needs: nothing (a template, a prompt snippet, a drawing, a near-empty note — kept as written), a light
// pass (a short note; several go in one message, on the faster model), or a full one (a dense note, alone).
export function triage(from: string, text: string): Triage {
  if (/(^|\/)(copilot-custom-prompts|templates?|excalidraw)(\/|$)/i.test(from) || /\.excalidraw\.md$/i.test(from)) return 'skip';
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const plain = body.replace(/^#+\s.*$/gm, '').replace(/!?\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, '');
  if (plain.length < 40) return 'skip';
  return body.length < 2500 ? 'small' : 'dense';
}

// Messages: dense files one each; short ones up to `per` (and `chars` of text) together.
export function groupFiles(files: LaneFile[], kind: (f: LaneFile) => Triage, per = 4, chars = 8000): { kind: Exclude<Triage, 'skip'>; files: LaneFile[] }[] {
  const out: { kind: Exclude<Triage, 'skip'>; files: LaneFile[] }[] = [];
  let cur: LaneFile[] = []; let size = 0;
  const flush = () => { if (cur.length) out.push({ kind: 'small', files: cur }); cur = []; size = 0; };
  for (const f of files.filter(f => kind(f) === 'small')) {
    if (cur.length >= per || (cur.length && size + f.text.length > chars)) flush();
    cur.push(f); size += f.text.length;
  }
  flush();
  for (const f of files.filter(f => kind(f) === 'dense')) out.push({ kind: 'dense', files: [f] });
  return out;
}

export function laneMessage(title: string, group: LaneFile[]): string {
  const head = group.length === 1 ? `${title}: the next page.` : `${title}: the next ${group.length} pages.`;
  // the page verbatim, in a fence longer than any backtick run inside it
  const fenced = (t: string) => { const f = '`'.repeat(Math.max(2, ...(t.match(/`+/g) ?? []).map(m => m.length)) + 1); return `${f}markdown\n${t}\n${f}`; };
  return [head, ...group.map((f, i) => `### ${i + 1}. ${f.title} — \`${f.ref}\` (from \`${f.from}\`)\n\n${fenced(f.text)}`)].join('\n\n');
}
