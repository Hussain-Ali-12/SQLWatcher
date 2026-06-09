import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Database, Loader2, Save, ServerCog, Wifi } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { DatabaseTestResponse, DeploymentConfigPayload } from './useSettings';
import { configValue, useDeploymentConfig, useSaveDeploymentConfig, useTestDatabaseUrl } from './useSettings';
import styles from './styles.module.css';

interface ConnectionFormState {
  proxy_address_mode: string;
  public_proxy_host: string;
  public_proxy_port: string;
  public_proxy_database: string;
  public_proxy_username: string;
  protected_database_url: string;
  deployment_notes: string;
}

function formFromConfig(config: ReturnType<typeof useDeploymentConfig>['data']): ConnectionFormState {
  return {
    proxy_address_mode: configValue(config?.config, 'proxy_address_mode', 'auto'),
    public_proxy_host: configValue(config?.config, 'public_proxy_host', config?.proxy_connection.public_host ?? ''),
    public_proxy_port: configValue(config?.config, 'public_proxy_port', String(config?.proxy_connection.public_port ?? '15432')),
    public_proxy_database: configValue(config?.config, 'public_proxy_database', config?.proxy_connection.database ?? ''),
    public_proxy_username: configValue(config?.config, 'public_proxy_username', config?.proxy_connection.username ?? ''),
    protected_database_url: '',
    deployment_notes: configValue(config?.config, 'deployment_notes', ''),
  };
}

function toPayload(form: ConnectionFormState): DeploymentConfigPayload {
  const parsedPort = Number(form.public_proxy_port);
  return {
    proxy_address_mode: form.proxy_address_mode,
    public_proxy_host: form.public_proxy_host.trim() || null,
    public_proxy_port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : null,
    public_proxy_database: form.public_proxy_database.trim() || null,
    public_proxy_username: form.public_proxy_username.trim() || null,
    protected_database_url: form.protected_database_url.trim() || null,
    deployment_notes: form.deployment_notes.trim() || null,
  };
}

function testStatus(result: DatabaseTestResponse | undefined, pending: boolean) {
  if (pending) return <StatusBadge status="loading" label="Testing" />;
  if (!result) return <StatusBadge status="idle" label="Not tested" />;
  return <StatusBadge status={result.ok ? 'ok' : 'error'} label={result.ok ? 'Connected' : 'Failed'} />;
}

export function ConnectionPanel() {
  const deploymentQuery = useDeploymentConfig();
  const saveDeployment = useSaveDeploymentConfig();
  const testDatabase = useTestDatabaseUrl();
  const [form, setForm] = useState<ConnectionFormState>(() => formFromConfig(undefined));
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const config = deploymentQuery.data;

  useEffect(() => {
    if (config) setForm(formFromConfig(config));
  }, [config]);

  const generatedUrl = useMemo(() => {
    const host = form.public_proxy_host || config?.proxy_connection.public_host || 'localhost';
    const port = form.public_proxy_port || String(config?.proxy_connection.public_port ?? '15432');
    const database = form.public_proxy_database || config?.proxy_connection.database || 'appdb';
    const username = encodeURIComponent(form.public_proxy_username || config?.proxy_connection.username || 'appuser');
    return `postgresql://${username}:<password>@${host}:${port}/${database}?sslmode=${config?.proxy_connection.sslmode ?? 'disable'}`;
  }, [config, form]);

  function updateField<K extends keyof ConnectionFormState>(field: K, value: ConnectionFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  async function handleSave() {
    setMessage(null);
    try {
      const response = await saveDeployment.mutateAsync(toPayload(form));
      setMessage(response.message || 'Deployment draft saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save deployment configuration.');
    }
  }

  async function handleTest() {
    setMessage(null);
    if (!form.protected_database_url.trim()) {
      setMessage('Enter a protected database URL before running the connection test.');
      return;
    }
    try {
      await testDatabase.mutateAsync({ database_url: form.protected_database_url.trim() });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to test database URL.');
    }
  }

  async function copyGeneratedUrl() {
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className={styles.panel} aria-label="Connection settings">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Data plane</p>
          <h2>Connection Configuration</h2>
          <span>Draft the public proxy connection details and test protected database connectivity.</span>
        </div>
        {deploymentQuery.isFetching ? <StatusBadge status="loading" label="Refreshing" /> : <StatusBadge status="ok" label="Loaded" />}
      </div>

      <div className={styles.connectionGrid}>
        <div className={styles.formCard}>
          <div className={styles.sectionTitle}>
            <ServerCog size={16} />
            <span>Proxy Address</span>
          </div>

          <label className={styles.field}>
            <span>Proxy address mode</span>
            <select
              value={form.proxy_address_mode}
              onChange={(event) => updateField('proxy_address_mode', event.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>

          <div className={styles.twoColumnFields}>
            <label className={styles.field}>
              <span>Public proxy host</span>
              <input
                value={form.public_proxy_host}
                onChange={(event) => updateField('public_proxy_host', event.target.value)}
                placeholder="localhost"
              />
            </label>

            <label className={styles.field}>
              <span>Public proxy port</span>
              <input
                value={form.public_proxy_port}
                onChange={(event) => updateField('public_proxy_port', event.target.value)}
                inputMode="numeric"
                placeholder="15432"
              />
            </label>
          </div>

          <div className={styles.twoColumnFields}>
            <label className={styles.field}>
              <span>Public proxy database</span>
              <input
                value={form.public_proxy_database}
                onChange={(event) => updateField('public_proxy_database', event.target.value)}
                placeholder="appdb"
              />
            </label>

            <label className={styles.field}>
              <span>Public proxy username</span>
              <input
                value={form.public_proxy_username}
                onChange={(event) => updateField('public_proxy_username', event.target.value)}
                placeholder="appuser"
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Deployment notes</span>
            <textarea
              value={form.deployment_notes}
              onChange={(event) => updateField('deployment_notes', event.target.value)}
              rows={4}
              placeholder="Document restart notes, deployment owner, or environment-specific proxy instructions."
            />
          </label>
        </div>

        <div className={styles.formCard}>
          <div className={styles.sectionTitle}>
            <Database size={16} />
            <span>Protected Database</span>
          </div>

          <label className={styles.field}>
            <span>Protected database URL</span>
            <textarea
              value={form.protected_database_url}
              onChange={(event) => updateField('protected_database_url', event.target.value)}
              rows={5}
              placeholder="postgresql://user:password@host:5432/database?sslmode=require"
            />
          </label>

          <div className={styles.testRow}>
            {testStatus(testDatabase.data, testDatabase.isPending)}
            <button className={styles.secondaryButton} type="button" onClick={handleTest} disabled={testDatabase.isPending}>
              {testDatabase.isPending ? <Loader2 size={15} className={styles.spin} /> : <Wifi size={15} />}
              Test database URL
            </button>
          </div>

          {testDatabase.data ? (
            <div className={testDatabase.data.ok ? styles.successBox : styles.errorBox}>
              <strong>{testDatabase.data.ok ? 'Connection successful' : 'Connection failed'}</strong>
              <span>{testDatabase.data.latency_ms}ms · {testDatabase.data.masked_url}</span>
              {testDatabase.data.error ? <span>{testDatabase.data.error}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.codePanel}>
        <div className={styles.codeHeader}>
          <div>
            <span>Generated proxy connection string</span>
            <p>Give this URL to the application deployment team as DATABASE_URL. Replace &lt;password&gt; with the application database password.</p>
          </div>
          <button className={styles.iconTextButton} type="button" onClick={copyGeneratedUrl}>
            {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <code>{generatedUrl}</code>
      </div>

      {config?.target_db_policy ? <p className={styles.policyNote}>{config.target_db_policy}</p> : null}

      <div className={styles.actionFooter}>
        {message ? <span className={styles.statusMessage}>{message}</span> : <span />}
        <button className={styles.primaryButton} type="button" onClick={handleSave} disabled={saveDeployment.isPending}>
          {saveDeployment.isPending ? <Loader2 size={15} className={styles.spin} /> : <Save size={15} />}
          Save connection draft
        </button>
      </div>
    </section>
  );
}
