'use client';
import Link from 'next/link';

// The Inbox per project (req:wf2.inbox.per-project): chips — every project, then each one — narrow the changes and the
// review queue to one project's documents; notes (no document yet) show only under all. The choice is in the URL.
export function InboxProjects({ product, projects, current }: { product: string; projects: { slug: string; title: string }[]; current: string }) {
  return (
    <div className="chips inbox-projects">
      <span className="chips-label">in</span>
      <Link href={`/${product}/inbox`} className={`chip ${!current ? 'on' : ''}`}>all projects</Link>
      {projects.map(p => <Link key={p.slug} href={`/${product}/inbox?project=${encodeURIComponent(p.slug)}`} className={`chip ${current === p.slug ? 'on' : ''}`} title={p.slug}>{p.title}</Link>)}
    </div>
  );
}
