'use client';
import { useEffect, useState } from 'react';
import { useBlockNoteEditor, useEditorSelectionChange } from '@blocknote/react';

// The menu over a text selection (component:selection-menu, req:wf2.editor.selection-menu): one compact popover instead of a
// row of buttons — the block's type on top (Normal text › heading, list, quote, code), the text styles, then Wye's
// own moves (⌁ node, ▣ block, a link), Comment on the block, and Ask an agent. Every action goes through the
// editor's own API; the parent supplies the three moves that need its state (link picker, make-block picker, ask,
// comment) as callbacks.
type Rect = { left: number; bottom: number };
export type SelectionMenuActions = {
  linkNode: (at: Rect) => void;
  makeBlock: (at: Rect) => void;
  ask: (at: Rect) => void;
  comment: (at: Rect) => void;
};

const TYPES: { key: string; label: string; type: string; props?: Record<string, unknown> }[] = [
  { key: 'p', label: 'Normal text', type: 'paragraph' },
  { key: 'h1', label: 'Heading 1', type: 'heading', props: { level: 1 } },
  { key: 'h2', label: 'Heading 2', type: 'heading', props: { level: 2 } },
  { key: 'h3', label: 'Heading 3', type: 'heading', props: { level: 3 } },
  { key: 'ul', label: 'Bullet list', type: 'bulletListItem' },
  { key: 'ol', label: 'Numbered list', type: 'numberedListItem' },
  { key: 'todo', label: 'Check list', type: 'checkListItem' },
  { key: 'quote', label: 'Quote', type: 'quote' },
  { key: 'code', label: 'Code block', type: 'codeBlock' },
];
const selRect = (): Rect => { const s = window.getSelection(); const r = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null; return r ? { left: r.left, bottom: r.bottom + 6 } : { left: 200, bottom: 200 }; };

export function SelectionMenu({ actions }: { actions: SelectionMenuActions }) {
  const editor = useBlockNoteEditor();
  const [, tick] = useState(0);
  useEditorSelectionChange(() => tick(n => n + 1), editor);
  const [types, setTypes] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => { setTypes(false); setLink(null); }, [editor]);

  type Blk = { id: string; type: string; props?: Record<string, unknown> };
  const blockAt = (): Blk | null => { try { return editor.getTextCursorPosition().block as unknown as Blk; } catch { return null; } };
  const block = blockAt();
  // BlockNote raises the toolbar for a node selection too — a click on a view, a card, an image selects the block —
  // and there is nothing to format then: the menu is for selected text only
  let selected = ''; try { selected = editor.getSelectedText(); } catch { selected = ''; }
  if (!selected.trim()) return null;
  const styles = editor.getActiveStyles() as Record<string, boolean | string | undefined>;
  const current = TYPES.find(t => block && t.type === block.type && (!t.props || (block.props as { level?: number })?.level === (t.props as { level?: number }).level)) ?? (block?.type === 'node' ? { key: 'node', label: 'Typed block', type: 'node' } : TYPES[0]);
  const typed = block?.type === 'node';
  const toggle = (name: string) => { editor.toggleStyles({ [name]: true } as never); editor.focus(); };
  const clear = () => { editor.removeStyles({ bold: true, italic: true, underline: true, strike: true, code: true, textColor: 'default', backgroundColor: 'default' } as never); editor.focus(); };
  const setType = (t: typeof TYPES[number]) => {
    if (block && !typed) {
      // a code block keeps its text in the `code` prop (component:code-block): the paragraph's text goes there
      const items = (editor.getBlock(block.id as never)?.content ?? []) as { type: string; text?: string; content?: { text?: string }[] }[];
      const plain = Array.isArray(items) ? items.map(i => i.type === 'text' ? i.text ?? '' : i.type === 'link' ? (i.content ?? []).map(c => c.text ?? '').join('') : '').join('') : '';
      const props = t.type === 'codeBlock' ? { code: plain } : t.props ?? {};
      editor.updateBlock(block as never, { type: t.type, props } as never);
    }
    setTypes(false); editor.focus();
  };
  const applyLink = () => { const url = (link ?? '').trim(); if (url) editor.createLink(/^[a-z][a-z0-9+.-]*:|^\//i.test(url) ? url : `https://${url}`); setLink(null); editor.focus(); };
  const on = (k: string) => (styles[k] ? 'on' : '');

  return (
    <div className="selmenu" role="toolbar" aria-label="Selection">
      <button className="selmenu-row selmenu-type" onClick={() => setTypes(v => !v)} aria-expanded={types} disabled={typed} title={typed ? 'A typed block keeps its shape; its kind is on the card' : 'Block type'}>
        <span className="selmenu-ico">T</span><span className="selmenu-label">{current.label}</span><span className="selmenu-chev">›</span>
      </button>
      {types && <div className="selmenu-types" role="menu">{TYPES.map(t => <button key={t.key} role="menuitem" className={t.key === current.key ? 'on' : ''} onClick={() => setType(t)}>{t.label}</button>)}</div>}
      <div className="selmenu-row selmenu-icons">
        <button className={on('bold')} onClick={() => toggle('bold')} title="Bold (⌘B)"><b>B</b></button>
        <button className={on('italic')} onClick={() => toggle('italic')} title="Italic (⌘I)"><i>I</i></button>
        <button className={on('underline')} onClick={() => toggle('underline')} title="Underline (⌘U)"><u>U</u></button>
        <button className={on('strike')} onClick={() => toggle('strike')} title="Strikethrough"><s>S</s></button>
        <button className={on('code')} onClick={() => toggle('code')} title="Code"><code>&lt;/&gt;</code></button>
        <button onClick={clear} title="Clear formatting"><span className="selmenu-tx">T<small>×</small></span></button>
      </div>
      <div className="selmenu-row selmenu-icons">
        <button onClick={() => setLink(v => (v === null ? '' : null))} title="Link to a URL" aria-expanded={link !== null}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg></button>
        <button className="selmenu-wide" onClick={() => actions.linkNode(selRect())} title="Link the selection to a node — or make a new node from it">⌁ node</button>
        <button className="selmenu-wide" onClick={() => actions.makeBlock(selRect())} title="Turn the selection into a typed block — a requirement, a decision, a task…">▣ block</button>
      </div>
      {link !== null && <form className="selmenu-link" onSubmit={e => { e.preventDefault(); applyLink(); }}><input autoFocus value={link} placeholder="https://… or a path" onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setLink(null); }} /><button type="submit" disabled={!link.trim()}>Link</button></form>}
      <button className="selmenu-row selmenu-action" onClick={() => actions.comment(selRect())} title="Comment on the selected words">
        <span className="selmenu-ico"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg></span><span className="selmenu-label">Comment</span>
      </button>
      <button className="selmenu-row selmenu-action" onClick={() => actions.ask(selRect())} title="Send the selection with a command to an agent">
        <span className="selmenu-ico">⇢</span><span className="selmenu-label">Ask an agent</span>
      </button>
    </div>
  );
}
