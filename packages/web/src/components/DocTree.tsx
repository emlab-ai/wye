'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type TreeItem = { slug: string; title: string; children: TreeItem[]; outline: { level: 2 | 3; text: string; slug: string }[] };

export function DocTree({ project, roots }: { project: string; roots: TreeItem[] }) {
  const path = usePathname();
  const Item = ({ d, depth }: { d: TreeItem; depth: number }) => {
    const href = `/p/${project}/d/${d.slug}`; const on = path === href;
    return (
      <li>
        <Link href={href} className={`dt-row ${on ? 'on' : ''}`} style={{ paddingLeft: 10 + depth * 12 }}>{d.title}</Link>
        {on && d.outline.length > 0 && <ul className="dt-outline">{d.outline.filter(h => h.level === 2).map(h => <li key={h.slug}><a href={`#${h.slug}`} style={{ paddingLeft: 22 + depth * 12 }}>{h.text}</a></li>)}</ul>}
        {d.children.length > 0 && <ul>{d.children.map(c => <Item key={c.slug} d={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  return <ul className="dt">{roots.map(r => <Item key={r.slug} d={r} depth={0} />)}</ul>;
}
