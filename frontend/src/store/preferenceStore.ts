import { create } from 'zustand';

const STORAGE_KEY = 'sqlwatcher_prefs';

export type Density = 'comfortable' | 'standard' | 'compact';
export type FontScale = 'small' | 'default' | 'large';
export type RulesSeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type RulesActionFilter = 'ALL' | 'BLOCK' | 'FLAG' | 'ALLOW';
export type RulesSort = 'name' | 'triggers' | 'severity';

export interface PreferenceState {
  density: Density;
  sidebarCollapsed: boolean;
  rulesSeverityFilter: RulesSeverityFilter;
  rulesActionFilter: RulesActionFilter;
  rulesSort: RulesSort;
  fontScale: FontScale;
  setDensity(d: PreferenceState['density']): void;
  toggleSidebar(): void;
  setRulesSeverityFilter(value: RulesSeverityFilter): void;
  setRulesActionFilter(value: RulesActionFilter): void;
  setRulesSort(value: RulesSort): void;
  setFontScale(value: FontScale): void;
}

interface StoredPreferenceState {
  density: Density;
  sidebarCollapsed: boolean;
  rulesSeverityFilter: RulesSeverityFilter;
  rulesActionFilter: RulesActionFilter;
  rulesSort: RulesSort;
  fontScale: FontScale;
}

function isDensity(value: unknown): value is Density {
  return value === 'comfortable' || value === 'standard' || value === 'compact';
}

function isRulesSeverityFilter(value: unknown): value is RulesSeverityFilter {
  return value === 'ALL' || value === 'CRITICAL' || value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}

function isRulesActionFilter(value: unknown): value is RulesActionFilter {
  return value === 'ALL' || value === 'BLOCK' || value === 'FLAG' || value === 'ALLOW';
}

function isRulesSort(value: unknown): value is RulesSort {
  return value === 'name' || value === 'triggers' || value === 'severity';
}

function isFontScale(value: unknown): value is FontScale {
  return value === 'small' || value === 'default' || value === 'large';
}

function fallbackPrefs(): StoredPreferenceState {
  return {
    density: 'standard',
    sidebarCollapsed: false,
    rulesSeverityFilter: 'ALL',
    rulesActionFilter: 'ALL',
    rulesSort: 'triggers',
    fontScale: 'default',
  };
}

function readStoredPrefs(): StoredPreferenceState {
  const fallback = fallbackPrefs();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<StoredPreferenceState>;
    return {
      density: isDensity(parsed.density) ? parsed.density : fallback.density,
      sidebarCollapsed: typeof parsed.sidebarCollapsed === 'boolean' ? parsed.sidebarCollapsed : fallback.sidebarCollapsed,
      rulesSeverityFilter: isRulesSeverityFilter(parsed.rulesSeverityFilter)
        ? parsed.rulesSeverityFilter
        : fallback.rulesSeverityFilter,
      rulesActionFilter: isRulesActionFilter(parsed.rulesActionFilter) ? parsed.rulesActionFilter : fallback.rulesActionFilter,
      rulesSort: isRulesSort(parsed.rulesSort) ? parsed.rulesSort : fallback.rulesSort,
      fontScale: isFontScale(parsed.fontScale) ? parsed.fontScale : fallback.fontScale,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return fallback;
  }
}

function persistPrefs(state: StoredPreferenceState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toStoredState(state: PreferenceState): StoredPreferenceState {
  return {
    density: state.density,
    sidebarCollapsed: state.sidebarCollapsed,
    rulesSeverityFilter: state.rulesSeverityFilter,
    rulesActionFilter: state.rulesActionFilter,
    rulesSort: state.rulesSort,
    fontScale: state.fontScale,
  };
}

const initialPrefs = readStoredPrefs();

export const usePreferenceStore = create<PreferenceState>((set) => ({
  ...initialPrefs,
  setDensity: (density) =>
    set((state) => {
      const nextState = { ...toStoredState(state), density };
      persistPrefs(nextState);
      return { density };
    }),
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      const nextState = { ...toStoredState(state), sidebarCollapsed };
      persistPrefs(nextState);
      return { sidebarCollapsed };
    }),
  setRulesSeverityFilter: (rulesSeverityFilter) =>
    set((state) => {
      const nextState = { ...toStoredState(state), rulesSeverityFilter };
      persistPrefs(nextState);
      return { rulesSeverityFilter };
    }),
  setRulesActionFilter: (rulesActionFilter) =>
    set((state) => {
      const nextState = { ...toStoredState(state), rulesActionFilter };
      persistPrefs(nextState);
      return { rulesActionFilter };
    }),
  setRulesSort: (rulesSort) =>
    set((state) => {
      const nextState = { ...toStoredState(state), rulesSort };
      persistPrefs(nextState);
      return { rulesSort };
    }),
  setFontScale: (fontScale) =>
    set((state) => {
      const nextState = { ...toStoredState(state), fontScale };
      persistPrefs(nextState);
      return { fontScale };
    }),
}));
