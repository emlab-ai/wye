'use client';
import { useDark, useThemeChoice, type ThemeChoice } from '@/lib/theme';

// Appearance (req:wf2.ui.theme): three choices on the Settings page; the rail's ☾/☀ button flips between light and dark.
export function ThemeSettings() {
  const [choice, set] = useThemeChoice();
  const opt = (v: ThemeChoice, label: string) => <button type="button" className={`seg ${choice === v ? 'on' : ''}`} aria-pressed={choice === v} onClick={() => set(v)}>{label}</button>;
  return (
    <section className="kind-section settings-section">
      <h2>Appearance</h2>
      <p className="lede">Light or dark, or whatever the system says. Kept in this browser.</p>
      <div className="seg-group" role="group" aria-label="Theme">{opt('system', 'System')}{opt('light', 'Light')}{opt('dark', 'Dark')}</div>
    </section>
  );
}

export function ThemeButton() {
  const dark = useDark();
  const [, set] = useThemeChoice();
  return <button type="button" className="rail-theme" onClick={() => set(dark ? 'light' : 'dark')} title={dark ? 'Switch to light' : 'Switch to dark'} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? '☀' : '☾'}</button>;
}
