import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Eraser, Play, ShieldCheck } from 'lucide-react';
import { SqlEditor, type SqlEditorHandle } from '../../components/sql/SqlEditor';
import { useAuthStore } from '../../store/authStore';
import { ExampleQueries } from './ExampleQueries';
import { ResponsePanel } from './ResponsePanel';
import { useConsole } from './useConsole';
import styles from './styles.module.css';

const DEFAULT_SQL = '';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Query execution failed.';
}

export function ConsolePage() {
  const user = useAuthStore((state) => state.user);
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [examplesCollapsed, setExamplesCollapsed] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const editorRef = useRef<SqlEditorHandle | null>(null);
  const consoleState = useConsole();
  const viewerMode = user?.role === 'viewer';
  const canExecute = !viewerMode && sql.trim().length > 0 && !consoleState.isExecuting;
  const historyLabel = useMemo(() => `${consoleState.history.length} saved quer${consoleState.history.length === 1 ? 'y' : 'ies'}`, [consoleState.history.length]);

  function executeCurrentQuery() {
    const trimmed = sql.trim();
    if (!trimmed || viewerMode || consoleState.isExecuting) return;
    consoleState.executeQuery(trimmed);
  }

  function clearEditor() {
    setSql('');
    consoleState.reset();
    editorRef.current?.focus();
  }

  function loadSql(nextSql: string) {
    setSql(nextSql);
    editorRef.current?.focus();
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>SQL execution gateway</p>
          <h1>SQL Console</h1>
        </div>
        <div className={styles.roleChip} title={viewerMode ? 'Viewer role cannot execute queries' : 'Console execution is enabled'}>
          {viewerMode ? <AlertTriangle size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
          <span>{viewerMode ? 'Read-only viewer' : 'Execution enabled'}</span>
        </div>
      </header>

      <div className={styles.consoleStack}>
        <ExampleQueries
          collapsed={examplesCollapsed}
          onToggle={() => setExamplesCollapsed((value) => !value)}
          onSelect={loadSql}
        />

        <section className={styles.editorPanel} aria-label="SQL editor">
          <div className={styles.editorTopBar}>
            <span>Editor</span>
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Enter</kbd>
            <span>to inspect and execute</span>
          </div>
          <SqlEditor
            ref={editorRef}
            value={sql}
            onChange={setSql}
            onSubmit={executeCurrentQuery}
            placeholder="Write a PostgreSQL query to inspect through SQLWatcher..."
            minHeight={220}
            disabled={viewerMode}
          />
        </section>

        <section className={styles.actionPanel} aria-label="Console actions">
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={executeCurrentQuery}
              disabled={!canExecute}
              title={viewerMode ? 'Viewer role cannot execute queries' : undefined}
            >
              <Play size={14} aria-hidden="true" />
              {consoleState.isExecuting ? 'Inspecting...' : 'Inspect & Execute'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={clearEditor} disabled={consoleState.isExecuting}>
              <Eraser size={14} aria-hidden="true" />
              Clear
            </button>
          </div>

          <div className={styles.historyWrap}>
            <button
              type="button"
              className={styles.historyButton}
              onClick={() => setHistoryOpen((value) => !value)}
              aria-expanded={historyOpen}
            >
              <Clock3 size={14} aria-hidden="true" />
              History dropdown
              <span>{historyLabel}</span>
            </button>
            {historyOpen ? (
              <div className={styles.historyMenu} role="listbox" aria-label="Console query history">
                {consoleState.history.length > 0 ? (
                  <>
                    {consoleState.history.map((item) => (
                      <button key={item} type="button" role="option" className={styles.historyItem} onClick={() => loadSql(item)}>
                        {item}
                      </button>
                    ))}
                    <button type="button" className={styles.clearHistoryButton} onClick={consoleState.clearHistory}>
                      Clear history
                    </button>
                  </>
                ) : (
                  <p className={styles.emptyHistory}>No executed queries stored yet.</p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {viewerMode ? <p className={styles.viewerNotice}>Viewer role cannot execute queries.</p> : null}

        {consoleState.error ? <div className={styles.errorBox}>{errorMessage(consoleState.error)}</div> : null}
        {consoleState.result ? <ResponsePanel response={consoleState.result} /> : null}
      </div>
    </div>
  );
}
