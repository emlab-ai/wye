import Link from 'next/link';
import { readSettings, publicSettings } from '@/lib/settings';
import { SettingsJev } from '@/components/SettingsJev';
import { SettingsAgents } from '@/components/SettingsAgents';
import { ThemeSettings } from '@/components/ThemeSwitch';

// The app's settings: what is stored here is about this machine, not about one product — the theme, the key Jev links
// with, how many agents build at once. All of it lives in <data>/_settings.json. A product's own settings — where its
// folder is, deleting it — are at /<product>/settings.
export default async function AppSettingsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const s = publicSettings(await readSettings());
  return (
    <div className="page" style={{ maxWidth: 720, margin: '40px auto' }}>
      <header className="doc-head">
        <p className="sub"><Link href={from ? `/${from}` : '/'}>← {from ?? 'back'}</Link></p>
        <h1 className="prop-in h1" style={{ margin: 0 }}>App settings</h1>
        <p className="sub">the app on this machine — for one product&apos;s own settings, open it and press ⚙</p>
      </header>
      <ThemeSettings />
      <SettingsAgents initial={s.agents} />
      <SettingsJev initial={s.jev} />
    </div>
  );
}
