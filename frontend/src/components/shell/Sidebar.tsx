import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { usePreferenceStore } from '../../store/preferenceStore';
import { shellNavItems } from './navItems';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const collapsed = usePreferenceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = usePreferenceStore((state) => state.toggleSidebar);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const navigate = useNavigate();

  function handleLogout() {
    clearAuth();
    navigate('/login', { replace: true });
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : styles.expanded}`} aria-label="Primary navigation">
      <div className={styles.brandRow}>
        <div className={styles.brandMark} aria-hidden="true">
          <img src="/brand/sqlwatcher-icon.svg" alt="" />
        </div>
        {!collapsed && (
          <div className={styles.brandCopy}>
            <div className={styles.brandText}>SQLWatcher</div>
            <div className={styles.brandSubtext}>Database Firewall</div>
          </div>
        )}
      </div>

      <nav className={styles.navList}>
        {shellNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
              {collapsed && <span className={styles.tooltip}>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        <button className={styles.footerButton} type="button" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronLeft size={17} aria-hidden="true" />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && <div className={styles.version}>SQLWatcher v2.0</div>}
        <button className={styles.footerButton} type="button" onClick={handleLogout} aria-label="Log out">
          <LogOut size={17} aria-hidden="true" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
