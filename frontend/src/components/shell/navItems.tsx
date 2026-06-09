import {
  BrainCircuit,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Map,
  ScrollText,
  Settings,
  ShieldAlert,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';

export interface ShellNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const shellNavItems: ShellNavItem[] = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/alerts', label: 'Alerts', icon: ShieldAlert },
  { path: '/logs', label: 'Logs', icon: ScrollText },
  { path: '/console', label: 'Console', icon: TerminalSquare },
  { path: '/rules', label: 'Rules', icon: ListChecks },
  { path: '/ml', label: 'ML Baseline', icon: BrainCircuit },
  { path: '/threat-map', label: 'Threat Map', icon: Map },
  { path: '/performance', label: 'Performance', icon: Gauge },
  { path: '/audit', label: 'Audit', icon: ClipboardList },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function getPageTitle(pathname: string): string {
  const exact = shellNavItems.find((item) => item.path === pathname);
  if (exact) return exact.label;

  const partial = shellNavItems.find((item) => pathname.startsWith(`${item.path}/`));
  return partial?.label ?? 'SQLWatcher';
}
