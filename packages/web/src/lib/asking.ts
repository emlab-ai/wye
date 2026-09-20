// A live conversation waiting on the person (req:wf2.sessions.question-toast): the last permission request in its
// transcript that no `note` answered — an AskUserQuestion (the question's text) or another tool's permission.
export type Asking = { requestId?: string; kind: 'question' | 'permission'; text: string };
type Ev = { kind: string; requestId?: string; name?: string; text?: string; input?: unknown };
export function askingOf(transcript: Ev[]): Asking | undefined {
  const answered = new Set(transcript.filter(e => e.kind === 'note' && e.requestId).map(e => e.requestId));
  const open = transcript.filter(e => e.kind === 'permission' && !answered.has(e.requestId)).pop();
  if (!open) return undefined;
  if (open.name === 'AskUserQuestion') {
    const qs = (open.input as { questions?: { question?: string }[] } | undefined)?.questions ?? [];
    return { requestId: open.requestId, kind: 'question', text: qs.map(q => q.question).filter(Boolean).join(' · ') || 'a question' };
  }
  return { requestId: open.requestId, kind: 'permission', text: `${open.name ?? 'tool'}${open.text ? ' — ' + open.text : ''}` };
}
