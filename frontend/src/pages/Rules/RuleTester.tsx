import { useMemo, useState } from 'react';
import styles from './styles.module.css';

interface RuleTesterProps {
  ruleType: string;
  pattern: string;
}

function normaliseSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function RuleTester({ ruleType, pattern }: RuleTesterProps) {
  const [testSql, setTestSql] = useState('SELECT username, password FROM users');

  const result = useMemo(() => {
    const cleanedPattern = pattern.trim();
    const normalisedSql = normaliseSql(testSql);
    const normalisedPattern = normaliseSql(cleanedPattern);

    if (!cleanedPattern || !testSql.trim()) {
      return { status: 'idle' as const, message: 'Enter a pattern and sample SQL to test this rule.' };
    }

    if (ruleType.toUpperCase() === 'REGEX') {
      try {
        const regex = new RegExp(cleanedPattern, 'i');
        return regex.test(normalisedSql)
          ? { status: 'match' as const, message: 'MATCH' }
          : { status: 'miss' as const, message: 'NO MATCH' };
      } catch (error) {
        return {
          status: 'invalid' as const,
          message: error instanceof Error ? `Invalid regex: ${error.message}` : 'Invalid regex pattern.',
        };
      }
    }

    if (ruleType.toUpperCase() === 'KEYWORD') {
      return normalisedSql.includes(normalisedPattern)
        ? { status: 'match' as const, message: 'MATCH' }
        : { status: 'miss' as const, message: 'NO MATCH' };
    }

    return { status: 'idle' as const, message: 'Built-in rules are evaluated by the backend detection engine.' };
  }, [pattern, ruleType, testSql]);

  return (
    <section className={styles.tester} aria-label="Client-side rule tester">
      <div className={styles.testerHeader}>
        <div>
          <h3>Rule Tester</h3>
          <p>Client-side preview only. Backend remains the source of truth.</p>
        </div>
        <span className={`${styles.testResult} ${styles[`testResult_${result.status}`]}`}>{result.message}</span>
      </div>
      <label className={styles.fieldLabel} htmlFor="rule-test-sql">
        Test SQL
      </label>
      <textarea
        id="rule-test-sql"
        className={styles.testInput}
        value={testSql}
        onChange={(event) => setTestSql(event.target.value)}
        rows={3}
        spellCheck={false}
      />
    </section>
  );
}
