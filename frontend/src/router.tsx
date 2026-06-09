import { lazy } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Shell } from './components/shell/Shell';

function ProtectedLayout() {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <Shell />;
}

const LoginPage = lazy(() => import('./pages/Login').then((module) => ({ default: module.LoginPage })));
const OverviewPage = lazy(() => import('./pages/Overview').then((module) => ({ default: module.OverviewPage })));
const AlertsPage = lazy(() => import('./pages/Alerts').then((module) => ({ default: module.AlertsPage })));
const LogsPage = lazy(() => import('./pages/Logs').then((module) => ({ default: module.LogsPage })));
const ConsolePage = lazy(() => import('./pages/Console').then((module) => ({ default: module.ConsolePage })));
const RulesPage = lazy(() => import('./pages/Rules').then((module) => ({ default: module.RulesPage })));
const MLPage = lazy(() => import('./pages/ML').then((module) => ({ default: module.MLPage })));
const ThreatMapPage = lazy(() => import('./pages/ThreatMap').then((module) => ({ default: module.ThreatMapPage })));
const PerformancePage = lazy(() => import('./pages/Performance').then((module) => ({ default: module.PerformancePage })));
const AuditPage = lazy(() => import('./pages/Audit').then((module) => ({ default: module.AuditPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((module) => ({ default: module.SettingsPage })));

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <Navigate to="/overview" replace />,
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        path: '/overview',
        element: <OverviewPage />,
      },
      {
        path: '/alerts',
        element: <AlertsPage />,
      },
      {
        path: '/logs',
        element: <LogsPage />,
      },
      {
        path: '/console',
        element: <ConsolePage />,
      },
      {
        path: '/rules',
        element: <RulesPage />,
      },
      {
        path: '/ml',
        element: <MLPage />,
      },
      {
        path: '/threat-map',
        element: <ThreatMapPage />,
      },
      {
        path: '/performance',
        element: <PerformancePage />,
      },
      {
        path: '/audit',
        element: <AuditPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
    ],
  },
]);
