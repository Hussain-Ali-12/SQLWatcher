import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import styles from './HighlightedQuery.module.css';

export interface HighlightedQueryProps {
  sql: string;
  maxLines?: number;
  compact?: boolean;
}

type TokenType = 'keyword' | 'danger' | 'string' | 'number' | 'comment' | 'operator' | 'identifier';

interface Token {
  text: string;
  type: TokenType;
}

const SQL_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'and',
  'or',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'on',
  'group',
  'by',
  'order',
  'limit',
  'offset',
  'insert',
  'into',
  'values',
  'update',
  'set',
  'delete',
  'create',
  'alter',
  'drop',
  'table',
  'database',
  'schema',
  'union',
  'all',
  'distinct',
  'case',
  'when',
  'then',
  'else',
  'end',
  'as',
  'is',
  'null',
  'not',
  'like',
  'in',
  'between',
  'exists',
  'having',
  'returning',
]);

const DANGEROUS_KEYWORDS = new Set(['drop', 'truncate', 'delete', 'alter', 'union', 'grant', 'revoke', 'copy', 'execute']);
const TOKEN_PATTERN = /(--.*?$|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|[(),;=*<>!+-/]|\b[a-zA-Z_][a-zA-Z0-9_$]*\b|\s+|.)/gm;

function tokenize(sql: string): Token[] {
  return Array.from(sql.matchAll(TOKEN_PATTERN)).map((match) => {
    const text = match[0];
    const lower = text.toLowerCase();
    if (/^\s+$/.test(text)) return { text, type: 'identifier' };
    if (text.startsWith('--') || text.startsWith('/*')) return { text, type: 'comment' };
    if (text.startsWith("'") || text.startsWith('"')) return { text, type: 'string' };
    if (/^\d/.test(text)) return { text, type: 'number' };
    if (/^[(),;=*<>!+\-/]$/.test(text)) return { text, type: 'operator' };
    if (DANGEROUS_KEYWORDS.has(lower)) return { text, type: 'danger' };
    if (SQL_KEYWORDS.has(lower)) return { text, type: 'keyword' };
    return { text, type: 'identifier' };
  });
}

function firstLines(text: string, count: number): string {
  return text.split('\n').slice(0, count).join('\n');
}

export function HighlightedQuery({ sql, maxLines, compact = false }: HighlightedQueryProps) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = sql.split('\n').length;
  const shouldTruncate = typeof maxLines === 'number' && maxLines > 0 && lineCount > maxLines;
  const visibleSql = shouldTruncate && !expanded ? firstLines(sql, maxLines) : sql;
  const tokens = useMemo(() => tokenize(visibleSql), [visibleSql]);

  async function copySql() {
    await navigator.clipboard.writeText(sql);
  }

  return (
    <div className={`${styles.wrapper} ${compact ? styles.compact : ''}`}>
      <button type="button" className={styles.copyButton} onClick={copySql} aria-label="Copy SQL">
        <Copy size={14} aria-hidden="true" />
      </button>
      <code className={styles.code}>
        {tokens.map((token, index) => (
          <span key={`${index}-${token.text}`} className={styles[token.type]}>
            {token.text}
          </span>
        ))}
      </code>
      {shouldTruncate ? (
        <button type="button" className={styles.toggleButton} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : `Show ${lineCount - maxLines} more line${lineCount - maxLines === 1 ? '' : 's'}`}
        </button>
      ) : null}
    </div>
  );
}
