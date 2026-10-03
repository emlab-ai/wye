// Typing a question in ⌘F asks it (decision:wf2.ask-in-search-panel): it ends with "?", or it starts with a question
// word and has at least one more word. Client-safe.
const QW = /^(why|how|what|who|whom|whose|when|where|which|does|do|did|is|are|was|were|can|could|should|would|will|has|have)\b/i;
export function isQuestion(q: string): boolean {
  const t = q.trim(); if (t.length < 3) return false;
  if (t.endsWith('?')) return true;
  return QW.test(t) && t.split(/\s+/).length >= 2;
}
