import { describe, it, expect } from 'vitest';
import { questionCards, withQuestions, questionsOf, withAnswer } from './pr-questions';
import type { GraphData, GraphNode } from './graph';

// a librarian's questions on the PR page (decision:wf2.pr-questions-on-the-page): cards with options, a Questions
// section, the answer written back on the card
const input = { questions: [{ question: 'When a type has no home, what happens?', header: 'Type home', options: [{ label: 'Auto-create the collection document', description: 'A document named after the type' }, { label: 'Ask once, then remember' }] }, { question: 'Comments: nested child or a Comments document?', header: 'Comments home', multiSelect: true, options: [{ label: 'Comments document' }, { label: 'Nested child' }] }] };

describe('pr questions', () => {
  it('makes one card per question with the options one per line and the request it came from', () => {
    const { yaml, ids } = questionCards('pr-26', 'b6c1', 'req_9', input, ['question:pr-26.type-home']);
    expect(ids).toEqual(['question:pr-26.type-home-2', 'question:pr-26.comments-home']);
    expect(yaml).toContain('- id: question:pr-26.type-home-2\n  q: When a type has no home, what happens?\n  header: Type home\n  options: Auto-create the collection document — A document named after the type | Ask once, then remember\n  asked-by: session:b6c1#req_9\n  status: open');
    expect(yaml).toContain('  multi: true');
  });
  it('adds the Questions section before Tasks once, then appends to it', () => {
    const md = '# X\n\n## Definition\n\nd\n\n## Tasks\n\n- [ ] task:pr-26 X #todo\n';
    const one = withQuestions(md, '```yaml\n- id: question:pr-26.a\n  q: A?\n  status: open\n```');
    expect(one).toContain('## Definition\n\nd\n\n## Questions\n\n_What the librarian needs from you');
    expect(one.indexOf('## Questions')).toBeLessThan(one.indexOf('## Tasks'));
    const two = withQuestions(one, '```yaml\n- id: question:pr-26.b\n  q: B?\n  status: open\n```');
    expect(two.match(/## Questions/g)).toHaveLength(1); expect(two).toContain('question:pr-26.a'); expect(two).toContain('question:pr-26.b');
    expect(two.indexOf('question:pr-26.b')).toBeLessThan(two.indexOf('## Tasks'));
  });
  it('reads the questions back from the graph and writes an answer on the card', () => {
    const node = (id: string, body: string): GraphNode => ({ id, kind: 'question', title: '', status: 'open', section: '', subsection: '', file: 'p/pr-26.md', line: 1, body, defined: true });
    const g: GraphData = { generatedAt: '', modules: [], files: [], nodes: [node('question:pr-26.a', 'q: A?\nheader: H\noptions: Yes — because | No\nasked-by: session:b6c1#req_9\nstatus: open')], edges: [], fieldIndex: {} };
    const qs = questionsOf(g, 'p/pr-26.md');
    expect(qs).toEqual([{ id: 'question:pr-26.a', q: 'A?', header: 'H', options: [{ label: 'Yes', description: 'because' }, { label: 'No', description: undefined }], multi: false, status: 'open', answer: undefined, by: undefined, askedBy: 'session:b6c1#req_9' }]);
    const md = '## Questions\n\n```yaml\n- id: question:pr-26.a\n  q: A?\n  asked-by: session:b6c1#req_9\n  status: open\n```\n';
    const out = withAnswer(md, 'question:pr-26.a', 'Yes', 'alex');
    expect(out).toContain('  status: resolved'); expect(out).toContain('  answer: Yes'); expect(out).toContain('  by: alex');
  });
});
