import { ChevronDown } from 'lucide-react';
import styles from './styles.module.css';

export interface ExampleQuery {
  name: string;
  sql: string;
}

const EXAMPLES: ExampleQuery[] = [
  {
    name: 'Legitimate SELECT',
    sql: "SELECT product_id, name FROM products WHERE category='electronics'",
  },
  {
    name: 'UNION injection',
    sql: 'SELECT id FROM users UNION SELECT username, password FROM users--',
  },
  {
    name: 'Stacked query',
    sql: 'SELECT 1; DROP TABLE users;--',
  },
  {
    name: 'Boolean tautology',
    sql: "SELECT * FROM users WHERE '1'='1'",
  },
  {
    name: 'Schema enumeration',
    sql: 'SELECT table_name FROM information_schema.tables',
  },
  {
    name: 'DDL attempt',
    sql: 'DROP TABLE orders CASCADE',
  },
  {
    name: 'Mass data dump',
    sql: 'SELECT * FROM users',
  },
  {
    name: 'Sensitive table access',
    sql: "SELECT salary, ssn FROM salary_records WHERE dept='finance'",
  },
];

export interface ExampleQueriesProps {
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (sql: string) => void;
}

export function ExampleQueries({ collapsed, onToggle, onSelect }: ExampleQueriesProps) {
  return (
    <section className={styles.examplesPanel} aria-label="Example SQL queries">
      <button type="button" className={styles.examplesHeader} onClick={onToggle} aria-expanded={!collapsed}>
        <span>
          <strong>Example Queries</strong>
          <span className={styles.headerHint}>Load into editor only. Nothing executes automatically.</span>
        </span>
        <ChevronDown className={collapsed ? styles.chevronCollapsed : styles.chevronOpen} size={16} aria-hidden="true" />
      </button>

      {!collapsed ? (
        <div className={styles.exampleGrid}>
          {EXAMPLES.map((example) => (
            <button key={example.name} type="button" className={styles.exampleButton} onClick={() => onSelect(example.sql)}>
              <span>{example.name}</span>
              <code>{example.sql}</code>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
