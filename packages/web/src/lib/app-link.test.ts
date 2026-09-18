import { describe, it, expect } from 'vitest';
import { appLink, appLinkLabel } from './app-link';

const origin = 'http://localhost:3456';

describe('appLink', () => {
  it('a node link on the page origin: document, node and the in-app path', () => {
    expect(appLink('http://localhost:3456/waterfall/v2/d/todo#n-task%3Anew-226', origin)).toEqual({
      kind: 'node', path: '/waterfall/v2/d/todo', hash: '#n-task%3Anew-226', product: 'waterfall', project: 'v2', doc: 'todo', node: 'task:new-226',
    });
  });
  it('a document link', () => {
    expect(appLink('http://localhost:3456/waterfall/v2/d/todo', origin)).toMatchObject({ kind: 'doc', doc: 'todo', node: undefined, hash: '' });
  });
  it('a session link', () => {
    expect(appLink('http://localhost:3456/waterfall/sessions/64813dfdab', origin)).toMatchObject({ kind: 'session', product: 'waterfall', session: '64813dfdab', path: '/waterfall/sessions/64813dfdab' });
  });
  it('the root', () => {
    expect(appLink('http://localhost:3456', origin)).toMatchObject({ kind: 'root', path: '/' });
    expect(appLink('http://localhost:3456/', origin)).toMatchObject({ kind: 'root', path: '/' });
  });
  it('any other path of the app is a page', () => {
    expect(appLink('http://localhost:3456/waterfall/types/team', origin)).toMatchObject({ kind: 'page', path: '/waterfall/types/team', product: 'waterfall' });
  });
  it('localhost and 127.0.0.1 on the same port count as the origin', () => {
    expect(appLink('http://localhost:3456/waterfall/v2/d/todo', 'http://192.168.1.5:3456')?.kind).toBe('doc');
    expect(appLink('http://127.0.0.1:3456/waterfall/v2/d/todo', 'http://192.168.1.5:3456')?.kind).toBe('doc');
    expect(appLink('http://localhost:3000/waterfall/v2/d/todo', origin)).toBeNull();
  });
  it('a foreign URL, a relative path and garbage are not app links', () => {
    expect(appLink('https://example.com/waterfall/v2/d/todo', origin)).toBeNull();
    expect(appLink('#tag:task:x', origin)).toBeNull();
    expect(appLink('mailto:x@y', origin)).toBeNull();
    expect(appLink('not a url', origin)).toBeNull();
  });
});

describe('appLinkLabel', () => {
  const titles = { todo: 'TODO' };
  it('a node: the document title and the node', () => {
    expect(appLinkLabel(appLink('http://localhost:3456/waterfall/v2/d/todo#n-task%3Anew-226', origin)!, titles)).toEqual({ text: 'TODO', node: 'task:new-226' });
  });
  it('a document the graph does not know: its slug', () => {
    expect(appLinkLabel(appLink('http://localhost:3456/waterfall/v2/d/nope', origin)!, titles)).toEqual({ text: 'nope' });
  });
  it('a session, the root and a page', () => {
    expect(appLinkLabel(appLink('http://localhost:3456/waterfall/sessions/64813dfdab', origin)!, titles)).toEqual({ text: 'session 64813dfdab' });
    expect(appLinkLabel(appLink('http://localhost:3456', origin)!, titles)).toEqual({ text: 'Waterfall' });
    expect(appLinkLabel(appLink('http://localhost:3456/waterfall/types/team', origin)!, titles)).toEqual({ text: 'types/team' });
  });
});

describe('docTitles', () => {
  it('maps every document node of the index to its title by slug, wherever the node is defined', async () => {
    const { docTitles } = await import('./app-link');
    const index = {
      'module:todo': { id: 'module:todo', kind: 'module', title: 'TODO', status: '', defined: true, file: 'data/products/waterfall/projects/v2/docs/todo.md' },
      'module:app-agents': { id: 'module:app-agents', kind: 'module', title: 'Agents and sessions', status: '', defined: true, file: 'data/products/waterfall/projects/v2/docs/app.md' },
      'task:x': { id: 'task:x', kind: 'task', title: 'x', status: 'open', defined: true, file: 'data/products/waterfall/projects/v2/docs/todo.md' },
    };
    expect(docTitles(index)).toEqual({ todo: 'TODO', 'app-agents': 'Agents and sessions' });
  });
});

describe('plainAppLinks', () => {
  it('replaces every app URL in a text with its label, other URLs untouched', async () => {
    const { plainAppLinks } = await import('./app-link');
    expect(plainAppLinks('See http://localhost:3456/waterfall/v2/d/todo#n-task%3Anew-226 and https://example.com/x.', origin, { todo: 'TODO' })).toBe('See TODO › task:new-226 and https://example.com/x.');
  });
});
