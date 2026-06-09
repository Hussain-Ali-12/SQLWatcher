import { useMemo, useState } from 'react';
import { Database, Palette, ShieldCheck, Wrench } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { useAuthStore } from '../../store/authStore';
import { AnomalyPolicy } from './AnomalyPolicy';
import { AppearancePanel } from './AppearancePanel';
import { ConnectionPanel } from './ConnectionPanel';
import { DemoTools } from './DemoTools';
import styles from './styles.module.css';

type SettingsTab = 'connection' | 'anomaly' | 'appearance' | 'demo';

function tabsForRole(role: string | undefined) {
  if (role === 'admin') {
    return [
      { key: 'connection', label: 'Connection', icon: <Database size={15} /> },
      { key: 'anomaly', label: 'Anomaly Detection', icon: <ShieldCheck size={15} /> },
      { key: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
      { key: 'demo', label: 'Demo Tools', icon: <Wrench size={15} /> },
    ];
  }

  if (role === 'analyst') {
    return [
      { key: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
      { key: 'demo', label: 'Demo Tools', icon: <Wrench size={15} /> },
    ];
  }

  return [{ key: 'appearance', label: 'Appearance', icon: <Palette size={15} /> }];
}

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const visibleTabs = useMemo(() => tabsForRole(user?.role), [user?.role]);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => visibleTabs[0]?.key as SettingsTab);
  const safeActiveTab = visibleTabs.some((tab) => tab.key === activeTab) ? activeTab : (visibleTabs[0]?.key as SettingsTab);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Settings</h1>
          <p>Configure SQLWatcher deployment drafts, anomaly policy, workspace appearance, and demo workflows.</p>
        </div>
        <span className={styles.roleBadge}>{user?.role ?? 'viewer'}</span>
      </header>

      <Tabs tabs={visibleTabs} activeTab={safeActiveTab} onChange={(key) => setActiveTab(key as SettingsTab)}>
        <Tabs.Panel tabKey="connection">
          <ConnectionPanel />
        </Tabs.Panel>
        <Tabs.Panel tabKey="anomaly">
          <AnomalyPolicy />
        </Tabs.Panel>
        <Tabs.Panel tabKey="appearance">
          <AppearancePanel />
        </Tabs.Panel>
        <Tabs.Panel tabKey="demo">
          <DemoTools user={user} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
