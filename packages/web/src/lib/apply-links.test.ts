import { describe, it, expect } from 'vitest';
import { applyLinks, blockText, blockLinked } from './apply-links';

// links applied in the editor (Jev auto-linking design §3): a paragraph or a prose node gets the ids as tags at its
// end; a yaml card gets them merged into related-to in its body; anything else is left alone
const p = (id: string, content: unknown[]) => ({ id, type: 'paragraph', props: {}, content });
const t = (text: string) => ({ type: 'text', text, styles: {} });
const tag = (id: string) => ({ type: 'tag', props: { id } });

describe('applyLinks', () => {
  it("reads a block's text and links", () => {
    const b = p('b1', [t('Checkout rounds '), tag('rule:round'), t(' always')]);
    expect(blockText(b as never)).toBe('Checkout rounds  always');
    expect(blockLinked(b as never)).toEqual(['rule:round']);
  });
  it('appends tags to a paragraph, once, with a space', () => {
    const r = applyLinks([p('b1', [t('Checkout rounds half-up')])] as never, { b1: ['rule:round', 'req:pay'] });
    expect(r.changed).toBe(true);
    expect(r.blocks[0].content).toEqual([t('Checkout rounds half-up'), t(' '), tag('rule:round'), t(' '), tag('req:pay')]);
    const again = applyLinks(r.blocks, { b1: ['rule:round'] });
    expect(again.changed).toBe(false);
  });
  it('merges into related-to on a yaml card, no duplicates', () => {
    const card = { id: 'c1', type: 'node', props: { kind: 'decision', slug: 'x', form: 'yaml', body: 'title: X\nrelated-to: [req:a]\nstatus: proposed' }, content: [] };
    const r = applyLinks([card] as never, { c1: ['req:a', 'rule:round'] });
    expect((r.blocks[0].props as { body: string }).body).toBe('title: X\nrelated-to: [req:a, rule:round]\nstatus: proposed');
    const fresh = applyLinks([{ ...card, props: { ...card.props, body: 'title: X' } }] as never, { c1: ['rule:round'] });
    expect((fresh.blocks[0].props as { body: string }).body).toBe('title: X\nrelated-to: [rule:round]');
  });
  it('leaves code, embeds and unknown keys alone', () => {
    const code = { id: 'k', type: 'codeBlock', props: {}, content: [t('x = 1')] };
    const r = applyLinks([code, p('b2', [t('hello there world')])] as never, { k: ['req:a'], nope: ['req:b'] });
    expect(r.changed).toBe(false); expect(r.blocks[0]).toBe(code);
  });
});
