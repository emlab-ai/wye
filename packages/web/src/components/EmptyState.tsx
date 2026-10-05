import type { ReactNode, JSX } from 'react';

// A page with nothing to show yet says what it is for and offers the one action that fills it
// (docs/superpowers/specs/2026-10-05-onboarding-design.md §3). No hooks: a server page can render it; the actions are
// passed in, so a client button (open the command box, a New page sheet) or a plain <a className="btn pri"> fits.
// The actions row is a `sec-actions`, so buttons and a.btn get the app's button styles.
export function EmptyState(p: { icon?: string; title: string; children?: ReactNode; actions?: ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="empty-state">
      {p.icon && <div className="empty-state-icon" aria-hidden>{p.icon}</div>}
      <h3 className="empty-state-title">{p.title}</h3>
      {p.children && <div className="empty-state-body">{p.children}</div>}
      {p.actions && <div className="sec-actions empty-state-actions">{p.actions}</div>}
      {p.hint && <p className="empty-state-hint">{p.hint}</p>}
    </div>
  );
}
