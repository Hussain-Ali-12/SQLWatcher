import { type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, DatabaseZap, ShieldCheck, TerminalSquare } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useAuthStore } from '../../store/authStore';
import type { LoginRequest, LoginResponse } from '../../types';
import styles from './styles.module.css';

const identityPoints = [
  { icon: ShieldCheck, label: 'Policy enforcement', text: 'Blocks risky SQL before it reaches the protected PostgreSQL database.' },
  { icon: DatabaseZap, label: 'Wire-proxy telemetry', text: 'SecureShop queries are inspected, scored, logged, and replayed into analyst views.' },
  { icon: Activity, label: 'SOC triage loop', text: 'Alerts, rule triggers, audit actions, and performance signals stay in one console.' },
];

interface RedirectState {
  from?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Login failed. Check the username and password, then try again.';
}

export function LoginPage() {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError('Username and password are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await api.post<LoginResponse, LoginRequest>('/auth/login', {
        username: trimmedUsername,
        password,
      });

      setAuth(data.access_token, data.user, data.expires_at);

      const state = location.state as RedirectState | null;
      navigate(state?.from || '/overview', { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.identityPanel} aria-label="SQLWatcher project identity">
        <div className={styles.productLockup}>
          <div className={styles.productIcon} aria-hidden="true">
            <img src="/brand/sqlwatcher-icon.svg" alt="" />
          </div>
          <div>
            <p className={styles.productEyebrow}>PostgreSQL database firewall</p>
            <h1 className={styles.productName}>SQLWatcher</h1>
          </div>
        </div>

        <div className={styles.identityHeader}>
          <div className={styles.productKicker}>AI-powered database threat intelligence</div>
          <p className={styles.productSubtitle}>
            SQLWatcher sits between SecureShop and Neon PostgreSQL, inspects every query in real time, and gives analysts a focused triage console for risky database activity.
          </p>
        </div>

        <div className={styles.flow} aria-label="SQLWatcher request flow">
          <span>Application</span>
          <strong>Proxy</strong>
          <strong>Inspect</strong>
          <strong>Decide</strong>
          <span>Neon DB</span>
        </div>

        <div className={styles.identityGrid}>
          {identityPoints.map((item) => {
            const Icon = item.icon;
            return (
              <div className={styles.identityItem} key={item.label}>
                <Icon size={18} aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brandBlock}>
          <div className={styles.loginIcon} aria-hidden="true">
            <TerminalSquare size={24} />
          </div>
          <div>
            <p className={styles.eyebrow}>Database Firewall Console</p>
            <h2 id="login-title" className={styles.title}>Secure operator login</h2>
          </div>
        </div>

        <form className={styles.form} onSubmit={submitLogin}>
          <label className={styles.field}>
            <span>Username</span>
            <input
              autoComplete="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
            />
          </label>

          <label className={styles.field}>
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  );
}
