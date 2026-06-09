import type { ReactNode } from 'react';
import styles from './MetricCard.module.css';

export interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: { value: number; unit: string };
  tone?: 'neutral' | 'ok' | 'warn' | 'critical';
  icon?: ReactNode;
  onClick?: () => void;
}

function deltaMeta(value: number) {
  if (value > 0) return { symbol: '↑', className: styles.deltaPositive, label: 'positive change' };
  if (value < 0) return { symbol: '↓', className: styles.deltaNegative, label: 'negative change' };
  return { symbol: '—', className: styles.deltaNeutral, label: 'no change' };
}

export function MetricCard({ label, value, delta, tone = 'neutral', icon, onClick }: MetricCardProps) {
  const clickable = typeof onClick === 'function';
  const meta = delta ? deltaMeta(delta.value) : null;
  const content = (
    <>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
      </div>
      <div className={styles.value} key={String(value)}>
        {value}
      </div>
      {delta && meta ? (
        <div className={`${styles.delta} ${meta.className}`} aria-label={`${meta.label}: ${delta.value} ${delta.unit}`}>
          <span>{meta.symbol}</span>
          <span>{Math.abs(delta.value)}</span>
          <span>{delta.unit}</span>
        </div>
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button type="button" className={`${styles.card} ${styles[tone]} ${styles.clickable}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <section className={`${styles.card} ${styles[tone]}`}>{content}</section>;
}
