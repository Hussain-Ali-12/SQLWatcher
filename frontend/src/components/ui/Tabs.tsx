import type { ReactElement, ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (key: string) => void;
  children: ReactNode;
}

export interface TabPanelProps {
  tabKey: string;
  children: ReactNode;
}

function Panel({ children }: TabPanelProps) {
  return <>{children}</>;
}

export function Tabs({ tabs, activeTab, onChange, children }: TabsProps) {
  const panels = Array.isArray(children) ? children : [children];

  return (
    <div className={styles.tabsRoot}>
      <div className={styles.tabList} role="tablist">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tabButton} ${active ? styles.active : ''}`}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
            >
              {tab.icon ? <span className={styles.tabIcon}>{tab.icon}</span> : null}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.panelWrap}>
        {panels.map((panel, index) => {
          const candidate = panel as ReactElement<TabPanelProps>;
          if (!candidate || !candidate.props || candidate.props.tabKey !== activeTab) return null;
          return (
            <div key={`${candidate.props.tabKey}-${index}`} className={styles.panel} role="tabpanel">
              {candidate.props.children}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Tabs.Panel = Panel;
