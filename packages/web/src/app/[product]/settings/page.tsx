import { readSettings, publicSettings } from '@/lib/settings';
import { SettingsJev } from '@/components/SettingsJev';
import { SettingsAgents } from '@/components/SettingsAgents';
import { SettingsFolder } from '@/components/SettingsFolder';
import { ThemeSettings } from '@/components/ThemeSwitch';

// The app's settings (Jev auto-linking design §0). Reached from every product's rail but not about one product: what is
// stored here applies to the whole app on this machine.
export default async function SettingsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const s = publicSettings(await readSettings());
  return (
    <div className="page">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Settings</h1><p className="sub">the app on this machine — and where this product keeps its folder</p></header>
      <ThemeSettings />
      <SettingsFolder product={product} />
      <SettingsAgents initial={s.agents} />
      <SettingsJev initial={s.jev} />
    </div>
  );
}
