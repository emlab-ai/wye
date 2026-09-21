'use client';
import { useEffect, useState } from 'react';

// The app's theme (req:wf2.ui.theme): the person's choice — system, light or dark — in localStorage `wf-theme`, applied
// as `data-theme` on <html> (the CSS palette hangs on it). `system` follows prefers-color-scheme and moves with it.
// The inline script in the root layout applies it before first paint so a dark page never flashes light.
export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_KEY = 'wf-theme';
export const THEME_BOOT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})()`;

export function themeChoice(): ThemeChoice { try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } }
export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  window.dispatchEvent(new CustomEvent('wf:theme', { detail: dark ? 'dark' : 'light' }));
}
export function setThemeChoice(choice: ThemeChoice) { try { localStorage.setItem(THEME_KEY, choice); } catch { /* ignore */ } applyTheme(choice); }

// Is the page dark now? Components that pick a theme by name (Monaco, Excalidraw, BlockNote) re-render on change.
export function isDark(): boolean { return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'; }
export function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(isDark());
    const on = () => setDark(isDark());
    window.addEventListener('wf:theme', on);
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const sys = () => { if (themeChoice() === 'system') applyTheme('system'); };
    m.addEventListener('change', sys);
    return () => { window.removeEventListener('wf:theme', on); m.removeEventListener('change', sys); };
  }, []);
  return dark;
}
export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [c, setC] = useState<ThemeChoice>('system');
  useEffect(() => { setC(themeChoice()); }, []);
  return [c, (n: ThemeChoice) => { setC(n); setThemeChoice(n); }];
}
