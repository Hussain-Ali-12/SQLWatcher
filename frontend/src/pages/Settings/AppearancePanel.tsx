import { ChevronsLeftRight, Rows3, Type } from 'lucide-react';
import { usePreferenceStore } from '../../store/preferenceStore';
import type { Density, FontScale } from '../../store/preferenceStore';
import styles from './styles.module.css';

const DENSITIES: Array<{ value: Density; label: string; description: string }> = [
  { value: 'comfortable', label: 'Comfortable', description: 'Largest spacing: 34px page padding, 60px table rows, 46px controls.' },
  { value: 'standard', label: 'Standard', description: 'Balanced spacing: 20px page padding, 44px rows, 34px controls.' },
  { value: 'compact', label: 'Compact', description: 'Dense mode: 10px page padding, 30px rows, 28px controls.' },
];

const FONT_SCALES: Array<{ value: FontScale; label: string; description: string }> = [
  { value: 'small', label: 'Small', description: '11px base UI text.' },
  { value: 'default', label: 'Default', description: '13px base UI text.' },
  { value: 'large', label: 'Large', description: '15px base UI text.' },
];

export function AppearancePanel() {
  const density = usePreferenceStore((state) => state.density);
  const sidebarCollapsed = usePreferenceStore((state) => state.sidebarCollapsed);
  const fontScale = usePreferenceStore((state) => state.fontScale);
  const setDensity = usePreferenceStore((state) => state.setDensity);
  const toggleSidebar = usePreferenceStore((state) => state.toggleSidebar);
  const setFontScale = usePreferenceStore((state) => state.setFontScale);

  return (
    <section className={styles.panel} aria-label="Appearance settings">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Operator workspace</p>
          <h2>Appearance</h2>
          <span>Adjust density, sidebar behaviour, and readable UI font size without changing backend behaviour.</span>
        </div>
      </div>

      <div className={styles.appearanceGrid}>
        <div className={styles.formCard}>
          <div className={styles.sectionTitle}>
            <Rows3 size={16} />
            <span>Density</span>
          </div>
          <div className={styles.optionStack}>
            {DENSITIES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`${styles.choiceCard} ${density === item.value ? styles.choiceActive : ''}`}
                onClick={() => setDensity(item.value)}
                aria-pressed={density === item.value}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formCard}>
          <div className={styles.sectionTitle}>
            <Type size={16} />
            <span>Font Size</span>
          </div>
          <div className={styles.optionStack}>
            {FONT_SCALES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`${styles.choiceCard} ${fontScale === item.value ? styles.choiceActive : ''}`}
                onClick={() => setFontScale(item.value)}
                aria-pressed={fontScale === item.value}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formCard}>
          <div className={styles.sectionTitle}>
            <ChevronsLeftRight size={16} />
            <span>Sidebar</span>
          </div>
          <label className={styles.toggleField}>
            <span>
              <strong>Collapse sidebar</strong>
              <small>Keep only the icon rail visible for more table space.</small>
            </span>
            <input type="checkbox" checked={sidebarCollapsed} onChange={toggleSidebar} />
          </label>
        </div>
      </div>

      <div className={styles.previewPanel} data-preview-density={density}>
        <div className={styles.previewHeader}>Density preview</div>
        <div className={styles.previewRow}>
          <span>2026-06-07 17:40</span>
          <strong>web_app</strong>
          <code>SELECT id FROM orders WHERE id = $1</code>
          <em>ALLOW</em>
        </div>
        <div className={styles.previewRow}>
          <span>2026-06-07 17:41</span>
          <strong>finance_user</strong>
          <code>SELECT salary FROM salary_records</code>
          <em>FLAG</em>
        </div>
      </div>
    </section>
  );
}
