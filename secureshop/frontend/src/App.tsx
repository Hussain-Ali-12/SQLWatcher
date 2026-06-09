import { useEffect, useMemo, useState, type ReactNode } from "react";

declare global {
  interface Window {
    SECURESHOP_API_BASE?: string;
    SQLWATCHER_UI_BASE?: string;
  }
}

import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Filter,
  Gauge,
  Layers3,
  LineChart,
  Play,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Table2,
  TerminalSquare,
  Timer,
  XCircle,
  Workflow,
  Wifi,
  Users,
  Zap,
} from "lucide-react";

const cleanBaseUrl = (value?: string) => value?.trim().replace(/\/+$/, "");

// In production Vercel builds, prefer Vite's build-time variables.
// public/config.js is only a runtime override for Docker/local deployments.
const API_BASE =
  cleanBaseUrl(import.meta.env.VITE_API_BASE_URL) ||
  cleanBaseUrl(window.SECURESHOP_API_BASE) ||
  "http://localhost:9000";
const SQLWATCHER_UI_BASE =
  cleanBaseUrl(import.meta.env.VITE_SQLWATCHER_UI_BASE) ||
  cleanBaseUrl(window.SQLWATCHER_UI_BASE) ||
  "http://localhost:5173";

const FALLBACK_PERSONAS = [
  {
    id: "web_app",
    label: "Web App",
    role: "normal customer-facing application",
  },
  {
    id: "admin_user",
    label: "Admin User",
    role: "privileged administrative user",
  },
  {
    id: "finance_user",
    label: "Finance User",
    role: "finance reporting persona",
  },
  {
    id: "reporting_bot",
    label: "Reporting Bot",
    role: "scheduled reporting service account",
  },
];

type Mode = "direct" | "proxy";
type Health = {
  service: string;
  default_mode: string;
  direct_db: string;
  sqlwatcher_proxy: string;
  direct_latency_ms: number;
  proxy_latency_ms: number;
  direct_error?: string | null;
  proxy_error?: string | null;
};

type ConnectionPath = {
  mode: Mode;
  ok: boolean;
  latency_ms: number;
  connection: {
    username?: string;
    host?: string;
    port?: string;
    database?: string;
    sslmode?: string;
    masked_url?: string;
  };
  server?: {
    database?: string;
    db_user?: string;
    server_addr?: string;
    server_port?: number;
  };
  error?: string;
};

type ConnectionTest = {
  direct: ConnectionPath;
  proxy: ConnectionPath;
  path: { direct: string; proxy: string };
};

type Benchmark = {
  mode: string;
  profile?: string;
  requested?: number;
  total_requests: number;
  successful_requests?: number;
  failed_requests?: number;
  blocked_requests?: number;
  flagged_requests?: number;
  concurrency: number;
  duration_sec?: number;
  throughput_qps: number;
  avg_latency_ms: number;
  median_latency_ms: number;
  p50_latency_ms?: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  min_latency_ms?: number;
  max_latency_ms?: number;
  actions?: Record<string, number>;
  errors: number;
  sample_error?: string | null;
};

type CompareRun = {
  run: number;
  direct: Benchmark;
  proxy: Benchmark;
  comparison: {
    added_avg_latency_ms: number;
    added_p95_latency_ms: number;
    throughput_reduction_percent: number;
  };
};

type Compare = {
  direct: Benchmark;
  proxy: Benchmark;
  comparison: {
    added_avg_latency_ms: number;
    added_p95_latency_ms: number;
    throughput_reduction_percent: number;
  };
  runs?: CompareRun[];
  repeats?: number;
  requests: number;
  concurrency: number;
  profile?: string;
  requested_per_path?: number;
  total_requests_sent?: number;
  status: string;
};

type QueryResult = {
  ok: boolean;
  mode?: string;
  app_user?: string;
  latency_ms: number;
  row_count: number;
  total?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
  rows: Record<string, unknown>[];
  error?: string;
};

type SecurityResult = {
  scenario: string;
  category?: string;
  title: string;
  description: string;
  expected_proxy: string;
  mode: Mode;
  app_user?: string;
  sql?: string;
  result: QueryResult;
};

type Persona = { id: string; label: string; role: string };
type ScenarioMeta = {
  id: string;
  category: string;
  app_user: string;
  title: string;
  description: string;
  expected_proxy: string;
};
type ScenarioCatalog = {
  categories: { id: string; label: string }[];
  scenarios: ScenarioMeta[];
};
type BaselineTrafficResult = {
  mode: string;
  users: string[];
  cycles: number;
  count: number;
  ok_count: number;
  per_user: Record<string, { attempted: number; ok: number; errors: number }>;
  next_step: string;
  results: Record<string, unknown>[];
};
type BatchResult = {
  mode: string;
  category: string;
  count: number;
  executed: number;
  blocked_or_error: number;
  results: Array<{
    scenario: string;
    category: string;
    title: string;
    expected_proxy: string;
    app_user: string;
    ok: boolean;
    row_count: number;
    latency_ms: number;
    error?: string;
  }>;
};
type ControlResult = Record<string, any>;

type Analytics = {
  mode: string;
  summary: Record<string, any>;
  sales_by_day: Record<string, any>[];
  category_revenue: Record<string, any>[];
  city_customers: Record<string, any>[];
  status_distribution: Record<string, any>[];
  top_products: Record<string, any>[];
  salary_by_department: Record<string, any>[];
};

type SqlExampleGroup = "safe" | "suspicious" | "attack";
type SqlExample = {
  id: string;
  group: SqlExampleGroup;
  title: string;
  description: string;
  expected: "ALLOW" | "FLAG" | "BLOCK";
  persona: string;
  sql: string;
};

const SQL_GROUPS: Array<{
  id: SqlExampleGroup;
  label: string;
  description: string;
}> = [
  {
    id: "safe",
    label: "Safe Business Queries",
    description: "Normal commerce reads that should pass through SQLWatcher.",
  },
  {
    id: "suspicious",
    label: "Suspicious Access",
    description:
      "High-signal queries that should be flagged for analyst review.",
  },
  {
    id: "attack",
    label: "Attack Payloads",
    description: "Queries that should be blocked in SQLWatcher Proxy mode.",
  },
];

const SQL_EXAMPLES: SqlExample[] = [
  {
    id: "safe-products",
    group: "safe",
    title: "Product catalog lookup",
    description: "Reads product metadata for a normal storefront page.",
    expected: "ALLOW",
    persona: "web_app",
    sql: "SELECT product_id, name, category, price, stock_quantity FROM products ORDER BY product_id LIMIT 25;",
  },
  {
    id: "safe-revenue",
    group: "safe",
    title: "Revenue summary",
    description: "Aggregates order revenue without touching sensitive tables.",
    expected: "ALLOW",
    persona: "reporting_bot",
    sql: "SELECT status, COUNT(*) AS orders, ROUND(SUM(order_total), 2) AS revenue FROM orders GROUP BY status ORDER BY revenue DESC;",
  },
  {
    id: "safe-category",
    group: "safe",
    title: "Category distribution",
    description: "Groups products by category for analytics widgets.",
    expected: "ALLOW",
    persona: "reporting_bot",
    sql: "SELECT category, COUNT(*) AS products, ROUND(AVG(price), 2) AS avg_price FROM products GROUP BY category ORDER BY products DESC;",
  },
  {
    id: "suspicious-customer-dump",
    group: "suspicious",
    title: "Customer table dump",
    description: "Broad customer access that should be visible to analysts.",
    expected: "FLAG",
    persona: "web_app",
    sql: "SELECT * FROM customers;",
  },
  {
    id: "suspicious-salary",
    group: "suspicious",
    title: "Salary records access",
    description: "Reads a sensitive HR table used for anomaly/security demos.",
    expected: "FLAG",
    persona: "finance_user",
    sql: "SELECT employee_id, monthly_salary, bonus FROM salary_records LIMIT 25;",
  },
  {
    id: "suspicious-employees",
    group: "suspicious",
    title: "Employee directory sweep",
    description:
      "Bulk employee data access that may be unusual for a web app persona.",
    expected: "FLAG",
    persona: "web_app",
    sql: "SELECT employee_id, full_name, department, email FROM employees LIMIT 50;",
  },
  {
    id: "attack-union",
    group: "attack",
    title: "UNION SQL injection",
    description:
      "Classic UNION SELECT attempt to combine product and customer data.",
    expected: "BLOCK",
    persona: "web_app",
    sql: "SELECT product_id, name FROM products UNION SELECT customer_id, email FROM customers;",
  },
  {
    id: "attack-stacked",
    group: "attack",
    title: "Stacked query attack",
    description: "Multiple SQL statements in one request should be blocked.",
    expected: "BLOCK",
    persona: "web_app",
    sql: "SELECT product_id, name FROM products; SELECT * FROM customers;",
  },
  {
    id: "attack-schema",
    group: "attack",
    title: "Schema enumeration",
    description: "Attempts to inspect database metadata/catalog tables.",
    expected: "BLOCK",
    persona: "web_app",
    sql: "SELECT * FROM information_schema.tables WHERE table_schema = 'public';",
  },
  {
    id: "attack-delete",
    group: "attack",
    title: "Unsafe DELETE",
    description: "Destructive operation without a WHERE clause.",
    expected: "BLOCK",
    persona: "admin_user",
    sql: "DELETE FROM customers;",
  },
  {
    id: "attack-time",
    group: "attack",
    title: "Time-based injection probe",
    description: "Uses pg_sleep to test blind SQL injection behavior.",
    expected: "BLOCK",
    persona: "web_app",
    sql: "SELECT pg_sleep(0.1);",
  },
];

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function intFormat(value: unknown): string {
  return Math.round(toNumber(value)).toLocaleString();
}

function decimalFormat(value: unknown, digits = 2): string {
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function money(value: unknown): string {
  return `$${toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatLatencyDelta(value: unknown): string {
  const delta = toNumber(value);
  if (Math.abs(delta) < 0.001) return "No measurable difference";
  return delta >= 0
    ? `Proxy slower by ${delta.toFixed(3)} ms`
    : `Proxy faster by ${Math.abs(delta).toFixed(3)} ms`;
}

function formatThroughputDelta(value: unknown): string {
  const delta = toNumber(value);
  if (Math.abs(delta) < 0.001) return "No measurable difference";
  return delta >= 0
    ? `${delta.toFixed(3)}% lower through proxy`
    : `${Math.abs(delta).toFixed(3)}% higher through proxy`;
}

function benchmarkRows(compare: Compare): Record<string, unknown>[] {
  return (compare.runs || []).map((run) => ({
    run: run.run,
    direct_requests: run.direct.total_requests,
    proxy_requests: run.proxy.total_requests,
    direct_success: run.direct.successful_requests ?? run.direct.total_requests - run.direct.errors,
    proxy_success: run.proxy.successful_requests ?? run.proxy.total_requests - run.proxy.errors,
    direct_avg_ms: run.direct.avg_latency_ms,
    proxy_avg_ms: run.proxy.avg_latency_ms,
    avg_delta: formatLatencyDelta(run.comparison.added_avg_latency_ms),
    direct_p95_ms: run.direct.p95_latency_ms,
    proxy_p95_ms: run.proxy.p95_latency_ms,
    p95_delta: formatLatencyDelta(run.comparison.added_p95_latency_ms),
    direct_qps: run.direct.throughput_qps,
    proxy_qps: run.proxy.throughput_qps,
    throughput_delta: formatThroughputDelta(
      run.comparison.throughput_reduction_percent,
    ),
  }));
}

function outcomeTotal(benchmark: Benchmark, key: string): number {
  return toNumber(benchmark.actions?.[key]);
}

function Metric({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  hint?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong className="metric-value">{value}</strong>
        {hint && <small className="metric-hint">{hint}</small>}
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  ok,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  ok?: boolean;
  icon: ReactNode;
}) {
  return (
    <div className={ok === false ? "status-card bad" : "status-card good"}>
      <div className="status-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function DataBlock({ data }: { data: unknown }) {
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

type TableColumn = {
  key: string;
  label: string;
  format?: (value: unknown, row: Record<string, unknown>) => string;
};

function ResultTable({
  result,
  title,
  columns: declaredColumns,
  onRowClick,
  selectedRow,
  rowIdKey,
  maxHeight = 420,
}: {
  result: QueryResult | null;
  title?: string;
  columns?: TableColumn[];
  onRowClick?: (row: Record<string, unknown>) => void;
  selectedRow?: Record<string, unknown> | null;
  rowIdKey?: string;
  maxHeight?: number;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const rows = result?.rows || [];
  const inferredColumns = useMemo(() => {
    const keys = new Set<string>();
    rows
      .slice(0, 20)
      .forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
    return Array.from(keys)
      .slice(0, 9)
      .map((key) => ({ key, label: key }));
  }, [rows]);
  const columns: TableColumn[] = declaredColumns?.length ? declaredColumns : inferredColumns;

  if (!result) {
    return <div className="empty-state">No data loaded yet.</div>;
  }

  function isSelected(row: Record<string, unknown>) {
    if (!selectedRow) return false;
    if (rowIdKey) return String(row[rowIdKey]) === String(selectedRow[rowIdKey]);
    return row === selectedRow;
  }

  return (
    <div className="query-viewer">
      <div className="query-viewer-head">
        <div>
          {title && <strong>{title}</strong>}
          <span>
            {result.row_count} returned rows
            {result.total !== undefined ? ` • ${result.total} total` : ""} •{" "}
            {result.latency_ms} ms
          </span>
        </div>
        <button className="ghost" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? "Show Table" : "Show Raw JSON"}
        </button>
      </div>

      {result.error && (
        <div className="result blocked">
          <strong>Query error</strong>
          <pre>{result.error}</pre>
        </div>
      )}

      {showRaw ? (
        <DataBlock data={result} />
      ) : rows.length > 0 ? (
        <div className="data-table-wrap" style={{ maxHeight }}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className={`${onRowClick ? "clickable" : ""} ${isSelected(row) ? "selected" : ""}`.trim()}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} title={String(row[col.key] ?? "")}>
                      {col.format
                        ? col.format(row[col.key], row)
                        : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          Query executed successfully but returned no rows.
        </div>
      )}
    </div>
  );
}

function BarList({
  title,
  data,
  labelKey,
  valueKey,
  valueFormat = "number",
}: {
  title: string;
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
  valueFormat?: "number" | "money";
}) {
  const max = Math.max(1, ...data.map((item) => toNumber(item[valueKey])));
  return (
    <div className="chart-card">
      <strong>{title}</strong>
      <div className="bar-list">
        {data.length === 0 && <span className="small">No chart data yet.</span>}
        {data.map((item, idx) => {
          const value = toNumber(item[valueKey]);
          return (
            <div className="bar-row" key={`${item[labelKey]}-${idx}`}>
              <span>{String(item[labelKey] ?? "-")}</span>
              <div>
                <i style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
              </div>
              <b>
                {valueFormat === "money"
                  ? money(value)
                  : value.toLocaleString()}
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuerySourceBadge({
  label,
  result,
  mode,
}: {
  label: string;
  result: QueryResult | null;
  mode: Mode;
}) {
  const ok = result?.ok !== false;
  const rowText = result
    ? `${result.row_count}${result.total !== undefined ? ` / ${result.total}` : ""} rows`
    : "not loaded";
  const latencyText = result ? `${result.latency_ms} ms` : "—";
  return (
    <div className={ok ? "query-source-badge ok" : "query-source-badge bad"}>
      <span>{label}</span>
      <strong>{mode === "proxy" ? "SQLWatcher Proxy" : "Direct Neon"}</strong>
      <small>
        {ok ? "ALLOW" : "BLOCKED / ERROR"} · {latencyText} · {rowText}
      </small>
    </div>
  );
}

function PathModeCard({
  modeName,
  title,
  description,
  path,
  status,
  active,
  onActivate,
}: {
  modeName: Mode;
  title: string;
  description: string;
  path: string;
  status?: ConnectionPath;
  active: boolean;
  onActivate: () => void;
}) {
  const ok = status?.ok;
  const server = status?.server || {};
  const connection = status?.connection || {};
  return (
    <div
      className={`path-card ${active ? "active" : ""} ${ok === false ? "bad" : ok ? "good" : "unknown"}`}
    >
      <div className="path-card-head">
        <div className="path-icon">
          {modeName === "proxy" ? (
            <ShieldCheck size={20} />
          ) : (
            <Database size={20} />
          )}
        </div>
        <div>
          <span>
            {active ? "Active database path" : "Available database path"}
          </span>
          <strong>{title}</strong>
        </div>
        <b
          className={
            ok === false
              ? "pill-status bad"
              : ok
                ? "pill-status good"
                : "pill-status"
          }
        >
          {ok === false ? "Offline" : ok ? "Connected" : "Checking"}
        </b>
      </div>
      <p>{description}</p>
      <div className="path-line">
        <Route size={16} />
        <span>{path}</span>
      </div>
      <div className="path-meta-grid">
        <div>
          <span>Latency</span>
          <b>{status ? `${status.latency_ms} ms` : "—"}</b>
        </div>
        <div>
          <span>DB</span>
          <b>{server.database || connection.database || "—"}</b>
        </div>
        <div>
          <span>User</span>
          <b>{server.db_user || connection.username || "—"}</b>
        </div>
        <div>
          <span>TLS</span>
          <b>
            {connection.sslmode || (modeName === "proxy" ? "internal" : "—")}
          </b>
        </div>
      </div>
      {status?.error && <pre className="path-error">{status.error}</pre>}
      <button
        type="button"
        className={active ? "ghost path-button active" : "ghost path-button"}
        onClick={onActivate}
      >
        {active
          ? "Currently Active"
          : `Switch to ${modeName === "proxy" ? "Proxy" : "Direct"}`}
      </button>
    </div>
  );
}

function expectedTone(expected: SqlExample["expected"]): string {
  if (expected === "BLOCK") return "danger";
  if (expected === "FLAG") return "warn";
  return "good";
}

function resultDecision(result: QueryResult | null): {
  label: string;
  tone: string;
  detail: string;
} {
  if (!result)
    return {
      label: "Not executed",
      tone: "neutral",
      detail: "Run a query to see SQLWatcher decision context.",
    };
  if (result.ok)
    return {
      label: "ALLOW",
      tone: "good",
      detail: `${result.row_count} rows · ${result.latency_ms} ms`,
    };
  const error = (result.error || "").toLowerCase();
  if (error.includes("blocked") || error.includes("sqlwatcher"))
    return {
      label: "BLOCK",
      tone: "danger",
      detail: `${result.latency_ms} ms · blocked before/at execution`,
    };
  return {
    label: "ERROR",
    tone: "danger",
    detail: `${result.latency_ms} ms · database/API error`,
  };
}

function SqlExampleCard({
  example,
  active,
  onLoad,
  onRun,
}: {
  example: SqlExample;
  active: boolean;
  onLoad: () => void;
  onRun: () => void;
}) {
  return (
    <article className={`sql-example-card ${active ? "active" : ""}`}>
      <div className="sql-example-head">
        <div>
          <span className={`expected-pill ${expectedTone(example.expected)}`}>
            Expected {example.expected}
          </span>
          <strong>{example.title}</strong>
        </div>
        <small>{example.persona}</small>
      </div>
      <p>{example.description}</p>
      <code>{example.sql}</code>
      <div className="sql-example-actions">
        <button className="ghost" type="button" onClick={onLoad}>
          Load
        </button>
        <button type="button" onClick={onRun}>
          Run
        </button>
      </div>
    </article>
  );
}

const FALLBACK_SCENARIOS: ScenarioMeta[] = [
  {
    id: "normal_product_lookup",
    title: "Normal Product Lookup",
    category: "normal",
    app_user: "web_app",
    expected_proxy: "ALLOW",
    description:
      "A normal customer-facing product lookup that should pass through SQLWatcher cleanly.",
  },
  {
    id: "mass_customer_access",
    title: "Mass Customer Access",
    category: "anomalies",
    app_user: "web_app",
    expected_proxy: "FLAG",
    description:
      "A broad customer data read that should remain visible in SQLWatcher logs and anomaly evidence.",
  },
  {
    id: "salary_records_access",
    title: "Sensitive Salary Access",
    category: "anomalies",
    app_user: "finance_user",
    expected_proxy: "FLAG",
    description:
      "A sensitive HR table access scenario for anomaly and sensitive-table monitoring.",
  },
  {
    id: "schema_enumeration",
    title: "Schema Enumeration",
    category: "attacks",
    app_user: "web_app",
    expected_proxy: "BLOCK",
    description: "Attempts to inspect database metadata and catalog tables.",
  },
  {
    id: "boolean_tautology",
    title: "Boolean Tautology",
    category: "attacks",
    app_user: "web_app",
    expected_proxy: "FLAG",
    description:
      "A classic always-true predicate used in SQL injection probes.",
  },
  {
    id: "union_injection",
    title: "UNION Injection",
    category: "attacks",
    app_user: "web_app",
    expected_proxy: "BLOCK",
    description:
      "Combines product and customer data through a UNION SELECT payload.",
  },
];

const FALLBACK_SCENARIO_CATEGORIES = [
  { id: "normal", label: "Normal" },
  { id: "anomalies", label: "Anomalies" },
  { id: "attacks", label: "Attacks" },
];

const SCENARIO_SQL_PREVIEWS: Record<string, string> = {
  normal_product_lookup:
    "SELECT product_id, name, category, price FROM products WHERE product_id = $1;",
  mass_customer_access: "SELECT * FROM customers;",
  salary_records_access:
    "SELECT employee_id, monthly_salary, bonus FROM salary_records;",
  schema_enumeration:
    "SELECT * FROM information_schema.tables WHERE table_schema = 'public';",
  boolean_tautology: "SELECT * FROM customers WHERE '1' = '1';",
  union_injection:
    "SELECT product_id, name FROM products UNION SELECT customer_id, email FROM customers;",
  stacked_query:
    "SELECT product_id, name FROM products; SELECT * FROM customers;",
  unsafe_delete: "DELETE FROM customers;",
  time_based_probe: "SELECT pg_sleep(0.1);",
};

function scenarioTone(expected: string): "good" | "warn" | "danger" {
  const normalized = expected.toUpperCase();
  if (normalized.includes("BLOCK")) return "danger";
  if (normalized.includes("FLAG") || normalized.includes("ERROR"))
    return "warn";
  return "good";
}

function scenarioActualDecision(result?: SecurityResult | null): {
  label: string;
  tone: "good" | "warn" | "danger" | "neutral";
  detail: string;
} {
  if (!result) {
    return {
      label: "Not run",
      tone: "neutral",
      detail: "Run this scenario to collect local evidence.",
    };
  }
  if (result.result.ok) {
    return {
      label: "EXECUTED",
      tone: "good",
      detail: `${result.result.row_count} rows · ${result.result.latency_ms} ms`,
    };
  }
  const error = (result.result.error || "").toLowerCase();
  if (error.includes("blocked") || error.includes("sqlwatcher")) {
    return {
      label: "BLOCKED",
      tone: "danger",
      detail: `${result.result.latency_ms} ms · stopped by proxy/firewall`,
    };
  }
  return {
    label: "ERROR",
    tone: "warn",
    detail: `${result.result.latency_ms} ms · database/API error`,
  };
}

function ScenarioCard({
  scenario,
  result,
  isLoading,
  onRunCurrent,
  onRunProxy,
  onRunDirect,
}: {
  scenario: ScenarioMeta;
  result?: SecurityResult;
  isLoading: boolean;
  onRunCurrent: () => void;
  onRunProxy: () => void;
  onRunDirect: () => void;
}) {
  const expectedToneValue = scenarioTone(scenario.expected_proxy);
  const actual = scenarioActualDecision(result);
  const sqlPreview =
    result?.sql ||
    SCENARIO_SQL_PREVIEWS[scenario.id] ||
    "Scenario SQL is generated by the SecureShop backend.";
  return (
    <article
      className={`security-scenario-card ${scenario.category} expected-${expectedToneValue}`}
    >
      <div className="security-card-head">
        <div>
          <span className="scenario-category">{scenario.category}</span>
          <strong>{scenario.title}</strong>
        </div>
        <span className={`scenario-expected ${expectedToneValue}`}>
          Expected {scenario.expected_proxy}
        </span>
      </div>
      <p>
        {scenario.description ||
          "Run this scenario to generate SQLWatcher evidence."}
      </p>
      <div className="scenario-sql-preview">
        <span>SQL preview</span>
        <code>{sqlPreview}</code>
      </div>
      <div className="scenario-meta-strip">
        <span>
          <b>Persona</b>
          {scenario.app_user}
        </span>
        <span>
          <b>Current result</b>
          <i className={`actual-${actual.tone}`}>{actual.label}</i>
        </span>
        <span>
          <b>Evidence</b>
          {actual.detail}
        </span>
      </div>
      <div className="scenario-actions">
        <button type="button" onClick={onRunCurrent} disabled={isLoading}>
          {isLoading ? "Running..." : "Run Current Mode"}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={onRunProxy}
          disabled={isLoading}
        >
          Run Proxy
        </button>
        <button
          className="ghost"
          type="button"
          onClick={onRunDirect}
          disabled={isLoading}
        >
          Run Direct
        </button>
        <a
          className="ghost scenario-link"
          href={`${SQLWATCHER_UI_BASE}/logs`}
          target="_blank"
          rel="noreferrer"
        >
          View SQLWatcher Logs
        </a>
      </div>
    </article>
  );
}

function ScenarioEvidencePanel({ result }: { result: SecurityResult | null }) {
  if (!result) {
    return (
      <div className="scenario-evidence empty">
        <strong>No scenario evidence yet</strong>
        <p>
          Run a scenario card to compare expected behavior with the actual
          SecureShop/SQLWatcher result.
        </p>
      </div>
    );
  }
  const actual = scenarioActualDecision(result);
  return (
    <div className={`scenario-evidence ${actual.tone}`}>
      <div className="scenario-evidence-head">
        <div>
          <span>Last scenario evidence</span>
          <strong>{result.title}</strong>
        </div>
        <b>{actual.label}</b>
      </div>
      <p>{result.description}</p>
      <div className="scenario-evidence-grid">
        <span>
          <b>Mode</b>
          {result.mode}
        </span>
        <span>
          <b>Persona</b>
          {result.app_user || "-"}
        </span>
        <span>
          <b>Expected</b>
          {result.expected_proxy}
        </span>
        <span>
          <b>Latency</b>
          {result.result.latency_ms} ms
        </span>
        <span>
          <b>Rows</b>
          {result.result.row_count}
        </span>
        <span>
          <b>Outcome</b>
          {actual.detail}
        </span>
      </div>
      {result.sql && <pre className="scenario-sql-block">{result.sql}</pre>}
      <ResultTable result={result.result} title="Scenario result rows" />
      <div className="scenario-evidence-actions">
        <a
          className="ghost scenario-link"
          href={`${SQLWATCHER_UI_BASE}/alerts`}
          target="_blank"
          rel="noreferrer"
        >
          Open SQLWatcher Alerts
        </a>
        <a
          className="ghost scenario-link"
          href={`${SQLWATCHER_UI_BASE}/logs`}
          target="_blank"
          rel="noreferrer"
        >
          Open SQLWatcher Logs
        </a>
      </div>
    </div>
  );
}

function MiniDataTable({
  title,
  subtitle,
  rows,
  columns,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: Record<string, unknown>[];
  columns: {
    key: string;
    label: string;
    format?: (value: unknown, row: Record<string, unknown>) => string;
  }[];
  emptyText: string;
}) {
  return (
    <div className="dashboard-table-card">
      <div className="dashboard-table-head">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state compact">{emptyText}</div>
      ) : (
        <div className="mini-table-wrap">
          <table className="mini-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.format
                        ? col.format(row[col.key], row)
                        : String(row[col.key] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InsightTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return (
    <div className={`insight-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function countUnique(rows: Record<string, unknown>[], key: string): number {
  return new Set(rows.map((row) => String(row[key] ?? "")).filter(Boolean)).size;
}

function BusinessMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return (
    <div className={`business-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function RecordDetail({
  title,
  subtitle,
  row,
  fields,
  footer,
}: {
  title: string;
  subtitle: string;
  row: Record<string, unknown> | null;
  fields: TableColumn[];
  footer?: ReactNode;
}) {
  return (
    <aside className="record-detail-card">
      <div className="record-detail-head">
        <span>Selected record</span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      {!row ? (
        <div className="empty-state compact">Select a row to inspect details.</div>
      ) : (
        <div className="record-field-grid">
          {fields.map((field) => (
            <div key={field.key}>
              <span>{field.label}</span>
              <b>
                {field.format
                  ? field.format(row[field.key], row)
                  : String(row[field.key] ?? "-")}
              </b>
            </div>
          ))}
        </div>
      )}
      {footer && <div className="record-detail-footer">{footer}</div>}
    </aside>
  );
}


function buildHighValueCustomers(
  orderRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const map = new Map<
    string,
    { customer: string; city: string; orders: number; revenue: number }
  >();
  orderRows.forEach((row) => {
    const customer = String(row.customer || "Unknown customer");
    const current = map.get(customer) || {
      customer,
      city: String(row.city || "-"),
      orders: 0,
      revenue: 0,
    };
    current.orders += 1;
    current.revenue += toNumber(row.order_total);
    map.set(customer, current);
  });
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
}


type DemoReadinessItem = {
  label: string;
  detail: string;
  ok: boolean;
  actionLabel?: string;
  href?: string;
};

function DemoReadinessPanel({
  items,
  score,
  onRefresh,
  onRunSafe,
  onRunAttack,
}: {
  items: DemoReadinessItem[];
  score: number;
  onRefresh: () => void;
  onRunSafe: () => void;
  onRunAttack: () => void;
}) {
  const status = score >= 90 ? "ready" : score >= 65 ? "nearly-ready" : "needs-work";
  return (
    <section id="demo-readiness" className={`demo-readiness-panel ${status}`}>
      <div className="demo-readiness-head">
        <div>
          <p className="eyebrow">Final demo readiness</p>
          <h2>
            <ClipboardCheck size={22} /> SecureShop presentation checklist
          </h2>
          <p>
            Use this panel before recording or presenting. It confirms that the protected path,
            target dataset, SQLWatcher evidence flow, and attack scenarios are ready.
          </p>
        </div>
        <div className="readiness-score" aria-label={`Demo readiness score ${score} percent`}>
          <span>{score}%</span>
          <small>{score >= 90 ? "Demo ready" : score >= 65 ? "Almost ready" : "Needs setup"}</small>
        </div>
      </div>

      <div className="readiness-grid">
        {items.map((item) => (
          <div key={item.label} className={item.ok ? "readiness-item ok" : "readiness-item warn"}>
            {item.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <div>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
              {item.href && (
                <a href={item.href} target="_blank" rel="noreferrer">
                  {item.actionLabel || "Open"}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="demo-sequence">
        <div>
          <span>1</span>
          <strong>Refresh state</strong>
          <small>Confirm Direct + Proxy paths and dashboard counts.</small>
        </div>
        <div>
          <span>2</span>
          <strong>Run safe query</strong>
          <small>Show normal commerce traffic is allowed.</small>
        </div>
        <div>
          <span>3</span>
          <strong>Run attack query</strong>
          <small>Show SQLWatcher blocks risky SQL and creates evidence.</small>
        </div>
        <div>
          <span>4</span>
          <strong>Open SQLWatcher</strong>
          <small>Verify logs, alerts, risk score, and detection method.</small>
        </div>
      </div>

      <div className="demo-readiness-actions">
        <button onClick={onRefresh}>
          <RefreshCw size={15} /> Refresh demo state
        </button>
        <button className="ghost" onClick={onRunSafe}>
          Run safe query
        </button>
        <button className="ghost danger-action" onClick={onRunAttack}>
          Run attack query
        </button>
      </div>
    </section>
  );
}


function BenchmarkPathCard({
  title,
  tone,
  benchmark,
}: {
  title: string;
  tone: "direct" | "proxy";
  benchmark: Benchmark;
}) {
  const success = benchmark.successful_requests ?? Math.max(0, benchmark.total_requests - benchmark.errors);
  const failed = benchmark.failed_requests ?? benchmark.errors;
  return (
    <div className={`bench ${tone}`}>
      <div className="bench-title-row">
        <h3>{title}</h3>
        <span className="small-pill">{intFormat(benchmark.total_requests)} sent</span>
      </div>
      <div className="bench-kpi-grid">
        <div>
          <span>Throughput</span>
          <b>{decimalFormat(benchmark.throughput_qps)} qps</b>
        </div>
        <div>
          <span>Avg</span>
          <b>{decimalFormat(benchmark.avg_latency_ms)} ms</b>
        </div>
        <div>
          <span>P95</span>
          <b>{decimalFormat(benchmark.p95_latency_ms)} ms</b>
        </div>
        <div>
          <span>P99</span>
          <b>{decimalFormat(benchmark.p99_latency_ms)} ms</b>
        </div>
      </div>
      <div className="outcome-strip">
        <span>Success {intFormat(success)}</span>
        <span>Blocked {intFormat(benchmark.blocked_requests ?? outcomeTotal(benchmark, "BLOCK"))}</span>
        <span>Flagged {intFormat(benchmark.flagged_requests ?? outcomeTotal(benchmark, "FLAG"))}</span>
        <span>Failed {intFormat(failed)}</span>
      </div>
      {benchmark.sample_error && <small className="benchmark-error">Sample error: {benchmark.sample_error}</small>}
    </div>
  );
}

function BenchmarkRunCards({ runs }: { runs: CompareRun[] }) {
  if (!runs.length) return null;

  return (
    <div className="benchmark-run-grid">
      {runs.map((run) => (
        <div className="benchmark-run-card" key={run.run}>
          <div className="run-card-head">
            <strong>Run {run.run}</strong>
            <span>
              {formatLatencyDelta(run.comparison.added_avg_latency_ms)}
            </span>
          </div>
          <div className="run-mini-metrics">
            <div>
              <span>Direct avg</span>
              <b>{run.direct.avg_latency_ms} ms</b>
            </div>
            <div>
              <span>Proxy avg</span>
              <b>{run.proxy.avg_latency_ms} ms</b>
            </div>
            <div>
              <span>Direct QPS</span>
              <b>{run.direct.throughput_qps}</b>
            </div>
            <div>
              <span>Proxy QPS</span>
              <b>{run.proxy.throughput_qps}</b>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({
  title,
  data,
}: {
  title: string;
  data: Record<string, any>[];
}) {
  const values = data.map((row) => toNumber(row.revenue || row.orders));
  const max = Math.max(1, ...values);
  const points = values
    .map((value, idx) => {
      const x = data.length <= 1 ? 0 : (idx / (data.length - 1)) * 100;
      const y = 100 - (value / max) * 88 - 6;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-card">
      <strong>{title}</strong>
      <svg
        viewBox="0 0 100 110"
        className="trend-chart"
        preserveAspectRatio="none"
      >
        <polyline points={points} fill="none" strokeWidth="3" />
        {values.map((value, idx) => {
          const x = data.length <= 1 ? 0 : (idx / (data.length - 1)) * 100;
          const y = 100 - (value / max) * 88 - 6;
          return <circle key={idx} cx={x} cy={y} r="1.8" />;
        })}
      </svg>
      <div className="trend-labels">
        {data.map((row, idx) => (
          <span key={idx}>{String(row.day ?? idx + 1)}</span>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    const stored = window.localStorage.getItem("secureshop_mode");
    return stored === "direct" || stored === "proxy" ? stored : "proxy";
  });
  const [health, setHealth] = useState<Health | null>(null);
  const [connectionTest, setConnectionTest] = useState<ConnectionTest | null>(
    null,
  );
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const [products, setProducts] = useState<QueryResult | null>(null);
  const [customers, setCustomers] = useState<QueryResult | null>(null);
  const [orders, setOrders] = useState<QueryResult | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Record<string, unknown> | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Record<string, unknown> | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);

  const [manualSql, setManualSql] = useState(
    "SELECT product_id, name, category, price FROM products ORDER BY product_id LIMIT 25;",
  );
  const [manualResult, setManualResult] = useState<QueryResult | null>(null);
  const [selectedSqlGroup, setSelectedSqlGroup] =
    useState<SqlExampleGroup>("safe");
  const [activeSqlExampleId, setActiveSqlExampleId] = useState("safe-products");

  const [security, setSecurity] = useState<SecurityResult | null>(null);
  const [scenarioResults, setScenarioResults] = useState<
    Record<string, SecurityResult>
  >({});
  const [compare, setCompare] = useState<Compare | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [scenarioCatalog, setScenarioCatalog] =
    useState<ScenarioCatalog | null>(null);
  const [selectedPersona, setSelectedPersona] = useState("web_app");
  const [selectedCategory, setSelectedCategory] = useState("anomalies");
  const [baselineCycles, setBaselineCycles] = useState(8);
  const [baselineTraffic, setBaselineTraffic] =
    useState<BaselineTrafficResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [sqlWatcherControl, setSqlWatcherControl] =
    useState<ControlResult | null>(null);
  const [controlledSetup, setControlledSetup] = useState<ControlResult | null>(
    null,
  );
  const [enrichResult, setEnrichResult] = useState<ControlResult | null>(null);
  const [requests, setRequests] = useState(1000);
  const [concurrency, setConcurrency] = useState(25);
  const [repeats, setRepeats] = useState(5);
  const [benchmarkProfile, setBenchmarkProfile] = useState("mixed_business");
  const [loading, setLoading] = useState("");
  const [appError, setAppError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  function switchMode(nextMode: Mode) {
    window.localStorage.setItem("secureshop_mode", nextMode);
    setMode(nextMode);
    setAppError("");
    setActionMessage(
      nextMode === "proxy"
        ? "Switched to SQLWatcher Proxy mode. Queries will be inspected by SQLWatcher."
        : "Switched to Direct DB mode. Queries bypass SQLWatcher for comparison only.",
    );
  }

  async function safeLoad<T>(fn: () => Promise<T>, setter: (value: T) => void) {
    try {
      const value = await fn();
      setter(value);
      setAppError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    }
  }

  async function loadHealth() {
    await safeLoad(() => api<Health>("/api/health"), setHealth);
  }

  async function loadConnectionTest() {
    await safeLoad(
      () => api<ConnectionTest>("/api/connection-test", { method: "POST" }),
      setConnectionTest,
    );
  }

  async function loadAnalytics(nextMode = mode) {
    await safeLoad(
      () =>
        api<Analytics>(
          `/api/analytics?mode=${nextMode}&app_user=reporting_bot`,
        ),
      setAnalytics,
    );
  }

  async function loadProducts(nextMode = mode) {
    const params = new URLSearchParams({
      mode: nextMode,
      app_user: selectedPersona,
      page_size: "50",
    });
    if (productSearch) params.set("search", productSearch);
    if (productCategory) params.set("category", productCategory);
    await safeLoad(
      () => api<QueryResult>(`/api/products?${params}`),
      setProducts,
    );
  }

  async function loadCustomers(nextMode = mode) {
    const params = new URLSearchParams({
      mode: nextMode,
      app_user: selectedPersona,
      page_size: "50",
    });
    if (customerSearch) params.set("search", customerSearch);
    if (customerCity) params.set("city", customerCity);
    await safeLoad(
      () => api<QueryResult>(`/api/customers?${params}`),
      setCustomers,
    );
  }

  async function loadOrders(nextMode = mode) {
    const params = new URLSearchParams({
      mode: nextMode,
      app_user: selectedPersona,
      page_size: "50",
    });
    if (orderStatus) params.set("status", orderStatus);
    await safeLoad(() => api<QueryResult>(`/api/orders?${params}`), setOrders);
  }

  async function refreshAll(nextMode = mode) {
    setActionMessage("Refreshing SecureShop dashboard data...");
    await Promise.all([
      loadHealth(),
      loadConnectionTest(),
      loadAnalytics(nextMode),
      loadProducts(nextMode),
      loadCustomers(nextMode),
      loadOrders(nextMode),
    ]);
    setActionMessage("Dashboard refreshed.");
  }

  async function executeSql(sql = manualSql, persona = selectedPersona) {
    setLoading("manual-query");
    try {
      const result = await api<QueryResult>("/api/manual-query", {
        method: "POST",
        body: JSON.stringify({ mode, sql, app_user: persona }),
      });
      setManualResult(result);
      setAppError("");
      setActionMessage(
        result.ok
          ? `SQL Lab query completed: ${result.row_count} row(s) returned.`
          : "SQL Lab query was blocked or failed. See result details.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function runManualQuery() {
    await executeSql();
  }

  function loadSqlExample(example: SqlExample) {
    setManualSql(example.sql);
    setSelectedPersona(example.persona);
    setSelectedSqlGroup(example.group);
    setActiveSqlExampleId(example.id);
    setActionMessage(
      `Loaded ${example.title}. Expected SQLWatcher decision in proxy mode: ${example.expected}.`,
    );
  }

  async function runSqlExample(example: SqlExample) {
    loadSqlExample(example);
    await executeSql(example.sql, example.persona);
  }

  async function runSecurityTest(
    scenario: string,
    nextMode: Mode = mode,
    appUser = selectedPersona,
  ) {
    setLoading(`security-${scenario}-${nextMode}`);
    try {
      const result = await api<SecurityResult>("/api/security-test", {
        method: "POST",
        body: JSON.stringify({ mode: nextMode, scenario, app_user: appUser }),
      });
      setSecurity(result);
      setScenarioResults((previous) => ({ ...previous, [scenario]: result }));
      setAppError("");
      setActionMessage(
        `${result.title} executed in ${nextMode === "proxy" ? "SQLWatcher Proxy" : "Direct Neon"} mode. Expected proxy decision: ${result.expected_proxy}.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function runCompare() {
    setLoading("benchmark");
    try {
      const result = await api<Compare>("/api/compare", {
        method: "POST",
        body: JSON.stringify({
          mode: "comparison",
          requests,
          concurrency,
          repeats,
          profile: benchmarkProfile,
        }),
      });
      setCompare(result);
      setAppError("");
      setActionMessage(
        `Benchmark completed: ${intFormat(result.total_requests_sent || (result.requests * (result.repeats || repeats) * 2))} total request attempts across Direct and Proxy.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function refreshBenchmarkContext() {
    setActionMessage("Refreshing path health before benchmark review...");
    await Promise.all([loadHealth(), loadConnectionTest()]);
    setActionMessage("Benchmark context refreshed.");
  }

  async function loadDemoCatalog() {
    await safeLoad(() => api<Persona[]>("/api/personas"), setPersonas);
    await safeLoad(
      () => api<ScenarioCatalog>("/api/security-scenarios"),
      setScenarioCatalog,
    );
  }

  async function generateBaselineTraffic() {
    setLoading("baseline-traffic");
    try {
      const result = await api<BaselineTrafficResult>(
        "/api/anomaly-demo/baseline-traffic",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "proxy",
            include_all_users: true,
            cycles: baselineCycles,
          }),
        },
      );
      setBaselineTraffic(result);
      setAppError("");
      setActionMessage(
        `Baseline traffic generated: ${result.ok_count}/${result.count} query executions succeeded.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function runScenarioBatch(category = selectedCategory) {
    setLoading(`batch-${category}`);
    try {
      const result = await api<BatchResult>("/api/security-test-batch", {
        method: "POST",
        body: JSON.stringify({ mode, category }),
      });
      setBatchResult(result);
      setAppError("");
      setActionMessage(
        `Scenario batch completed: ${result.count} scenario(s), ${result.executed} executed.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function checkSqlWatcherControl() {
    setLoading("sqlwatcher-control-status");
    try {
      const result = await api<ControlResult>("/api/sqlwatcher-control/status");
      setSqlWatcherControl(result);
      setAppError("");
      setActionMessage("SQLWatcher control connection checked successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function enrichTargetDatabase(reset = true) {
    if (
      reset &&
      !window.confirm(
        "Reset and enrich the protected database with a larger SecureShop dataset? This refreshes demo rows in products, customers, orders, employees, and salary_records.",
      )
    )
      return;
    setLoading(reset ? "target-enrich-reset" : "target-enrich-append");
    try {
      const result = await api<ControlResult>("/api/target-db/enrich", {
        method: "POST",
        body: JSON.stringify({
          reset,
          customers: 600,
          products: 250,
          employees: 120,
          orders: 8000,
          sslmode: "require",
        }),
      });
      setEnrichResult(result);
      setAppError("");
      setActionMessage(
        `Protected database enriched. Products: ${result.after_counts?.products ?? "-"}, Customers: ${result.after_counts?.customers ?? "-"}, Orders: ${result.after_counts?.orders ?? "-"}.`,
      );
      await refreshAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function resetSqlWatcherData() {
    if (
      !window.confirm(
        "Reset SQLWatcher logs, alerts, anomaly scores, feedback, and baselines? Users, rules, and deployment settings are preserved.",
      )
    )
      return;
    setLoading("sqlwatcher-reset");
    try {
      const result = await api<ControlResult>(
        "/api/sqlwatcher-control/reset-data",
        {
          method: "POST",
          body: JSON.stringify({
            include_audit_events: true,
            include_auth_sessions: false,
            reset_rule_trigger_counts: true,
            reason: "Manual reset from SecureShop UI",
          }),
        },
      );
      setSqlWatcherControl(result);
      setControlledSetup(null);
      setBaselineTraffic(null);
      setBatchResult(null);
      setAppError("");
      setActionMessage(
        "SQLWatcher logs, alerts, anomaly scores, feedback, and baselines were reset.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  async function runSecureShopControlledSetup(runAnomalies = false) {
    setLoading(runAnomalies ? "controlled-full-demo" : "controlled-baseline");
    try {
      const result = await api<ControlResult>(
        "/api/anomaly-demo/secure-shop-controlled-setup",
        {
          method: "POST",
          body: JSON.stringify({
            cycles: baselineCycles,
            reset_sqlwatcher: true,
            enable_anomaly: true,
            anomaly_min_score: 70,
            train_baseline: true,
            run_anomaly_batch: runAnomalies,
            auto_confirm_top_anomaly: false,
            enrich_target_database: false,
            reset_target_database: false,
          }),
        },
      );
      setControlledSetup(result);
      setAppError("");
      setActionMessage(
        runAnomalies
          ? "Full SecureShop-controlled anomaly demo completed."
          : "SQLWatcher baselines were reset and trained from SecureShop traffic.",
      );
      await refreshAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAppError(message);
      setActionMessage(`Action failed: ${message}`);
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    refreshAll(mode);
  }, [mode, selectedPersona]);

  useEffect(() => {
    setSelectedProduct(products?.rows?.[0] || null);
  }, [products]);

  useEffect(() => {
    setSelectedCustomer(customers?.rows?.[0] || null);
  }, [customers]);

  useEffect(() => {
    setSelectedOrder(orders?.rows?.[0] || null);
  }, [orders]);

  const summary = analytics?.summary || {};
  const categories =
    analytics?.category_revenue?.map((row) => String(row.category)) || [];
  const cities =
    analytics?.city_customers?.map((row) => String(row.city)) || [];
  const statuses =
    analytics?.status_distribution?.map((row) => String(row.status)) || [];
  const visiblePersonas = personas.length > 0 ? personas : FALLBACK_PERSONAS;
  const hasSeedOnlyData =
    toNumber(summary.products) <= 10 ||
    toNumber(summary.customers) <= 10 ||
    toNumber(summary.orders) <= 20;
  const productRows = products?.rows || [];
  const customerRows = customers?.rows || [];
  const orderRows = orders?.rows || [];
  const filteredOrderRows = orderSearch
    ? orderRows.filter((row) =>
        ["order_id", "customer", "city", "product", "category", "status"].some((key) =>
          String(row[key] ?? "").toLowerCase().includes(orderSearch.toLowerCase()),
        ),
      )
    : orderRows;
  const productInventoryValue = productRows.reduce(
    (sum, row) => sum + toNumber(row.price) * toNumber(row.stock_quantity),
    0,
  );
  const productCategoryCount = countUnique(productRows, "category");
  const customerCityCount = countUnique(customerRows, "city");
  const customerSegmentCount = countUnique(customerRows, "segment");
  const orderStatusCount = countUnique(orderRows, "status");
  const loadedOrderRevenue = orderRows.reduce(
    (sum, row) => sum + toNumber(row.order_total),
    0,
  );
  const pendingOrders = orderRows.filter((row) =>
    String(row.status || "").toLowerCase().includes("pending"),
  ).length;
  const recentOrders = orderRows.slice(0, 6);
  const lowStockProducts = [...productRows]
    .sort((a, b) => toNumber(a.stock_quantity) - toNumber(b.stock_quantity))
    .slice(0, 6);
  const highValueCustomers = buildHighValueCustomers(orderRows);
  const totalRevenue = toNumber(summary.total_revenue);
  const totalOrders = toNumber(summary.orders);
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const lowStockCount = productRows.filter(
    (row) => toNumber(row.stock_quantity) <= 25,
  ).length;
  const proxyLatency = toNumber(
    connectionTest?.proxy?.latency_ms ?? health?.proxy_latency_ms,
  );
  const directLatency = toNumber(
    connectionTest?.direct?.latency_ms ?? health?.direct_latency_ms,
  );
  const proxyOverhead =
    proxyLatency && directLatency
      ? Math.max(0, proxyLatency - directLatency)
      : 0;
  const activeConnection =
    mode === "proxy" ? connectionTest?.proxy : connectionTest?.direct;
  const inactiveConnection =
    mode === "proxy" ? connectionTest?.direct : connectionTest?.proxy;
  const activePathText =
    mode === "proxy"
      ? "SecureShop API → SQLWatcher Proxy → Neon PostgreSQL"
      : "SecureShop API → Neon PostgreSQL";
  const visibleSqlExamples = SQL_EXAMPLES.filter(
    (example) => example.group === selectedSqlGroup,
  );
  const activeSqlExample =
    SQL_EXAMPLES.find((example) => example.id === activeSqlExampleId) ||
    SQL_EXAMPLES[0];
  const manualDecision = resultDecision(manualResult);
  const scenarioCategories = scenarioCatalog?.categories?.length
    ? scenarioCatalog.categories
    : FALLBACK_SCENARIO_CATEGORIES;
  const allScenarios = scenarioCatalog?.scenarios?.length
    ? scenarioCatalog.scenarios
    : FALLBACK_SCENARIOS;
  const visibleScenarios = allScenarios.filter(
    (scenario) => scenario.category === selectedCategory,
  );
  const scenarioCounts = scenarioCategories.map((category) => ({
    ...category,
    count: allScenarios.filter((scenario) => scenario.category === category.id)
      .length,
  }));
  const directReady = Boolean(connectionTest?.direct?.ok || health?.direct_db === "connected");
  const proxyReady = Boolean(connectionTest?.proxy?.ok || health?.sqlwatcher_proxy === "connected");
  const datasetReady = !hasSeedOnlyData;
  const sqlWatcherEvidenceReady = Boolean(
    sqlWatcherControl?.status === "ok" || sqlWatcherControl?.ok === true || security || batchResult,
  );
  const benchmarkReady = Boolean(compare?.direct && compare?.proxy);
  const demoReadinessItems: DemoReadinessItem[] = [
    {
      label: "Direct Neon path",
      ok: directReady,
      detail: directReady
        ? `Connected at ${directLatency || "-"} ms.`
        : "Recheck the Direct path before comparing baseline performance.",
    },
    {
      label: "SQLWatcher Proxy path",
      ok: proxyReady,
      detail: proxyReady
        ? `Protected route connected at ${proxyLatency || "-"} ms.`
        : "Proxy path must be connected for the main demo story.",
    },
    {
      label: "Realistic dataset",
      ok: datasetReady,
      detail: datasetReady
        ? `${intFormat(summary.products)} products, ${intFormat(summary.customers)} customers, ${intFormat(summary.orders)} orders loaded.`
        : "Run Reset + Enrich Protected DB before final screenshots.",
    },
    {
      label: "Security evidence flow",
      ok: sqlWatcherEvidenceReady,
      detail: sqlWatcherEvidenceReady
        ? "A scenario/control check has produced SQLWatcher-side evidence."
        : "Run one security scenario, then open SQLWatcher Logs/Alerts.",
      href: `${SQLWATCHER_UI_BASE}/logs`,
      actionLabel: "Open SQLWatcher Logs",
    },
    {
      label: "Benchmark comparison",
      ok: benchmarkReady,
      detail: benchmarkReady
        ? `${intFormat(compare?.total_requests_sent || 0)} benchmark attempts recorded.`
        : "Run Benchmark Lab once to capture Direct vs Proxy evidence.",
    },
  ];
  const demoReadinessScore = Math.round(
    (demoReadinessItems.filter((item) => item.ok).length / demoReadinessItems.length) * 100,
  );

  return (
    <div className={`secure-app mode-${mode}`}>
      <aside className="app-sidebar" aria-label="SecureShop navigation">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ShoppingBag size={24} />
          </div>
          <div>
            <strong>SecureShop</strong>
            <span>Protected Commerce Analytics</span>
          </div>
        </div>

        <nav className="side-nav">
          <a href="#dashboard">
            <Gauge size={17} /> Dashboard
          </a>
          <a href="#data">
            <Table2 size={17} /> Data Explorer
          </a>
          <a href="#sql-lab">
            <TerminalSquare size={17} /> SQL Lab
          </a>
          <a href="#demo-readiness">
            <ClipboardCheck size={17} /> Demo Readiness
          </a>
          <a href="#demo">
            <BrainCircuit size={17} /> Anomaly Demo
          </a>
          <a href="#scenarios">
            <ShieldAlert size={17} /> Security Tests
          </a>
          <a href="#benchmark">
            <BarChart3 size={17} /> Benchmark
          </a>
        </nav>

        <div className="sidebar-status">
          <span
            className={mode === "proxy" ? "status-dot good" : "status-dot warn"}
          />
          <div>
            <strong>
              {mode === "proxy" ? "Protected path active" : "Direct DB mode"}
            </strong>
            <small>
              {mode === "proxy"
                ? "Queries inspected before Neon"
                : "Firewall bypass for baseline"}
            </small>
          </div>
        </div>
      </aside>

      <div className="app-frame">
        <header className="topbar">
          <div className="active-path-summary">
            <span className="topbar-label">Current database path</span>
            <strong>
              {mode === "proxy"
                ? "SQLWatcher Proxy Protected Path"
                : "Direct Neon Baseline Path"}
            </strong>
            <small>{activePathText}</small>
          </div>
          <div className="topbar-controls">
            <div
              className="toggle mode-toggle"
              role="group"
              aria-label="Connection mode"
            >
              <button
                type="button"
                className={mode === "direct" ? "active direct" : ""}
                onClick={() => switchMode("direct")}
              >
                Direct
              </button>
              <button
                type="button"
                className={mode === "proxy" ? "active proxy" : ""}
                onClick={() => switchMode("proxy")}
              >
                Proxy
              </button>
            </div>
            <label className="persona-inline">
              Persona
              <select
                value={selectedPersona}
                onChange={(e) => {
                  setSelectedPersona(e.target.value);
                  setActionMessage(
                    `Persona changed to ${e.target.options[e.target.selectedIndex].text}.`,
                  );
                }}
              >
                {visiblePersonas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ghost top-refresh"
              onClick={() => refreshAll()}
              disabled={!!loading}
            >
              Refresh
            </button>
          </div>
        </header>

        <main className="content-shell">
          <section id="dashboard" className="hero hero-pro">
            <div className="hero-copy">
              <p className="eyebrow">
                SecureShop + SQLWatcher live client application
              </p>
              <h1>Protected commerce operations portal</h1>
              <p>
                SecureShop is the PostgreSQL-backed business app protected by
                SQLWatcher. Use it to run normal commerce workflows, compare
                direct versus proxy paths, and generate realistic
                database-threat evidence.
              </p>
              <div className="system-flow" aria-label="SecureShop traffic flow">
                <span>SecureShop</span>
                <i />
                <span>SQLWatcher Proxy</span>
                <i />
                <span>Inspect</span>
                <i />
                <span>Decision</span>
                <i />
                <span>Neon PostgreSQL</span>
              </div>
              <div className="hero-actions">
                <button onClick={() => refreshAll()}>Refresh Dashboard</button>
                <button className="ghost-light" onClick={runManualQuery}>
                  <TerminalSquare size={16} /> Run Manual Query
                </button>
              </div>
            </div>
            <div className="hero-panel">
              <span className="panel-kicker">Live protection state</span>
              <strong>
                {mode === "proxy"
                  ? "SQLWatcher is enforcing query inspection"
                  : "Direct database comparison mode"}
              </strong>
              <p>
                {mode === "proxy"
                  ? "Queries are scored, logged, and blocked/flagged before reaching Neon."
                  : "Queries bypass SQLWatcher. Use only for baseline comparison and performance checks."}
              </p>
              <div className="hero-status-grid">
                <span>
                  <b>
                    {connectionTest?.proxy?.ok
                      ? "connected"
                      : health?.sqlwatcher_proxy || "checking"}
                  </b>{" "}
                  Proxy path
                </span>
                <span>
                  <b>
                    {connectionTest?.direct?.ok
                      ? "connected"
                      : health?.direct_db || "checking"}
                  </b>{" "}
                  Direct path
                </span>
                <span>
                  <b>{proxyLatency || "-"}</b> ms proxy
                </span>
                <span>
                  <b>{directLatency || "-"}</b> ms direct
                </span>
              </div>
            </div>
          </section>

          {appError && (
            <section className="result blocked">
              <strong>SecureShop frontend/API warning</strong>
              <pre>{appError}</pre>
            </section>
          )}
          {actionMessage && !appError && (
            <section className="action-banner">
              <strong>Last action</strong>
              <span>{actionMessage}</span>
            </section>
          )}

          <section className="metrics metrics-pro">
            <Metric
              label="Products"
              value={toNumber(summary.products).toLocaleString()}
              icon={<ShoppingBag />}
              hint="catalog rows"
            />
            <Metric
              label="Customers"
              value={toNumber(summary.customers).toLocaleString()}
              icon={<Users />}
              hint="customer rows"
            />
            <Metric
              label="Orders"
              value={toNumber(summary.orders).toLocaleString()}
              icon={<Store />}
              hint="transaction rows"
            />
            <Metric
              label="Revenue"
              value={money(summary.total_revenue)}
              icon={<Gauge />}
              hint="total order value"
            />
          </section>

          <section className="connection-grid">
            <StatusCard
              label="Active path"
              value={mode === "proxy" ? "SQLWatcher Proxy" : "Direct Neon"}
              detail={
                activeConnection?.ok === false
                  ? "connection check failed"
                  : "ready for SecureShop traffic"
              }
              ok={activeConnection?.ok !== false}
              icon={mode === "proxy" ? <ShieldCheck /> : <Database />}
            />
            <StatusCard
              label="Inactive path"
              value={mode === "proxy" ? "Direct Neon" : "SQLWatcher Proxy"}
              detail={
                inactiveConnection?.ok === false
                  ? "connection check failed"
                  : "available for comparison"
              }
              ok={inactiveConnection?.ok !== false}
              icon={mode === "proxy" ? <Database /> : <ShieldCheck />}
            />
            <StatusCard
              label="Direct latency"
              value={`${directLatency || "-"} ms`}
              detail="latest path check"
              ok={connectionTest?.direct?.ok !== false}
              icon={<Timer />}
            />
            <StatusCard
              label="Proxy overhead"
              value={
                proxyLatency && directLatency
                  ? `${proxyOverhead.toFixed(2)} ms`
                  : "-"
              }
              detail="proxy minus direct latency"
              ok={true}
              icon={<Activity />}
            />
          </section>

          <DemoReadinessPanel
            items={demoReadinessItems}
            score={demoReadinessScore}
            onRefresh={() => refreshAll()}
            onRunSafe={() => runSqlExample(SQL_EXAMPLES.find((example) => example.id === "safe-products") || SQL_EXAMPLES[0])}
            onRunAttack={() => runSecurityTest("attack-union", "proxy", "web_app")}
          />

          <section className="mode-command-center">
            <div className="mode-command-head">
              <div>
                <p className="eyebrow">Database path control</p>
                <h2>
                  <Workflow size={22} /> Direct vs SQLWatcher Proxy
                </h2>
                <p>
                  Switch the active path deliberately. Direct mode is for
                  baseline comparison; Proxy mode is the protected route that
                  lets SQLWatcher inspect, score, block, and record queries.
                </p>
              </div>
              <button
                className="ghost"
                onClick={() => {
                  setActionMessage(
                    "Rechecking direct and proxy database paths...",
                  );
                  loadConnectionTest();
                }}
              >
                <RefreshCw size={16} /> Recheck Paths
              </button>
            </div>
            <div className="path-card-grid">
              <PathModeCard
                modeName="direct"
                title="Direct Neon baseline"
                description="SecureShop connects straight to the protected database. Use this only to compare baseline latency and behavior without SQLWatcher enforcement."
                path={
                  connectionTest?.path?.direct ||
                  "SecureShop API → Protected PostgreSQL"
                }
                status={connectionTest?.direct}
                active={mode === "direct"}
                onActivate={() => switchMode("direct")}
              />
              <PathModeCard
                modeName="proxy"
                title="SQLWatcher protected route"
                description="SecureShop traffic flows through the PostgreSQL wire proxy. SQLWatcher can observe normal traffic and block high-risk SQL before Neon executes it."
                path={
                  connectionTest?.path?.proxy ||
                  "SecureShop API → SQLWatcher Proxy → Protected PostgreSQL"
                }
                status={connectionTest?.proxy}
                active={mode === "proxy"}
                onActivate={() => switchMode("proxy")}
              />
            </div>
          </section>

          <section
            className={
              hasSeedOnlyData ? "panel data-prep warning" : "panel data-prep"
            }
          >
            <div>
              <p className="eyebrow">Demo Data Readiness</p>
              <h2>
                <Database size={22} /> Protected Database Dataset
              </h2>
              <p>
                {hasSeedOnlyData
                  ? "The current database still looks like the small seed dataset. Enrich it before final demo screenshots, filters, charts, and anomaly baselines."
                  : "The protected database has enough rows for a realistic SecureShop demo."}
              </p>
              <div className="dataset-stats">
                <span>
                  <b>{toNumber(summary.products).toLocaleString()}</b> products
                </span>
                <span>
                  <b>{toNumber(summary.customers).toLocaleString()}</b>{" "}
                  customers
                </span>
                <span>
                  <b>{toNumber(summary.orders).toLocaleString()}</b> orders
                </span>
                <span>
                  <b>{money(summary.total_revenue)}</b> revenue
                </span>
              </div>
            </div>
            <div className="data-prep-actions">
              <button
                onClick={() => enrichTargetDatabase(true)}
                disabled={!!loading}
              >
                {loading === "target-enrich-reset"
                  ? "Enriching protected DB..."
                  : "Reset + Enrich Protected DB"}
              </button>
              <small>
                Recreates a large clean dataset for charts, filters, and
                baselines.
              </small>
              <button
                className="ghost"
                onClick={() => enrichTargetDatabase(false)}
                disabled={!!loading}
              >
                {loading === "target-enrich-append"
                  ? "Adding demo rows..."
                  : "Add More Demo Rows"}
              </button>
              <small>
                Appends more demo rows without clearing existing rows.
              </small>
              <button
                className="ghost"
                onClick={() => refreshAll()}
                disabled={!!loading}
              >
                Reload Counts
              </button>
            </div>
            {enrichResult && (
              <div className="data-prep-result">
                <strong>Last enrichment result</strong>
                <span>
                  {String(enrichResult.status || "completed")} • Products:{" "}
                  {String(enrichResult.after_counts?.products ?? "-")} •
                  Customers:{" "}
                  {String(enrichResult.after_counts?.customers ?? "-")} •
                  Orders: {String(enrichResult.after_counts?.orders ?? "-")}
                </span>
              </div>
            )}
          </section>

          <section
            className="dashboard-command-center"
            aria-label="SecureShop business dashboard"
          >
            <div className="section-title">
              <div>
                <p className="eyebrow">Protected Business Dashboard</p>
                <h2>
                  <LineChart size={22} /> Commerce telemetry through the active
                  database path
                </h2>
                <p>
                  Every card below is backed by real PostgreSQL reads. In proxy
                  mode, these reads are inspected and recorded by SQLWatcher.
                </p>
              </div>
              <div className="query-source-grid">
                <QuerySourceBadge
                  label="Products query"
                  result={products}
                  mode={mode}
                />
                <QuerySourceBadge
                  label="Customers query"
                  result={customers}
                  mode={mode}
                />
                <QuerySourceBadge
                  label="Orders query"
                  result={orders}
                  mode={mode}
                />
              </div>
            </div>

            <div className="business-insight-grid">
              <InsightTile
                label="Average order value"
                value={money(averageOrderValue)}
                detail="Revenue divided by total orders"
                tone="good"
              />
              <InsightTile
                label="Low-stock watch"
                value={lowStockCount}
                detail="Loaded products at or below 25 units"
                tone={lowStockCount > 0 ? "warn" : "good"}
              />
              <InsightTile
                label="Loaded customers"
                value={customerRows.length}
                detail="Current page sample for analysis"
              />
              <InsightTile
                label="Proxy overhead"
                value={`${proxyOverhead.toFixed(2)} ms`}
                detail="Latest health-check delta"
                tone={proxyOverhead > 50 ? "warn" : "neutral"}
              />
            </div>

            <div className="dashboard-visual-grid">
              <TrendChart
                title="Revenue trend by day"
                data={analytics?.sales_by_day || []}
              />
              <BarList
                title="Revenue by category"
                data={analytics?.category_revenue || []}
                labelKey="category"
                valueKey="revenue"
                valueFormat="money"
              />
              <BarList
                title="Order status distribution"
                data={analytics?.status_distribution || []}
                labelKey="status"
                valueKey="orders"
              />
              <BarList
                title="Customers by city"
                data={analytics?.city_customers || []}
                labelKey="city"
                valueKey="customers"
              />
            </div>

            <div className="business-table-grid">
              <MiniDataTable
                title="Recent Orders"
                subtitle="Latest commerce transactions"
                rows={recentOrders}
                emptyText="No recent orders loaded yet."
                columns={[
                  { key: "order_id", label: "Order" },
                  { key: "customer", label: "Customer" },
                  { key: "status", label: "Status" },
                  {
                    key: "order_total",
                    label: "Total",
                    format: (value) => money(value),
                  },
                ]}
              />
              <MiniDataTable
                title="Low-Stock Products"
                subtitle="Inventory rows that need review"
                rows={lowStockProducts}
                emptyText="No product inventory loaded yet."
                columns={[
                  { key: "name", label: "Product" },
                  { key: "category", label: "Category" },
                  { key: "stock_quantity", label: "Stock" },
                  {
                    key: "price",
                    label: "Price",
                    format: (value) => money(value),
                  },
                ]}
              />
              <MiniDataTable
                title="High-Value Customers"
                subtitle="Derived from loaded order rows"
                rows={highValueCustomers}
                emptyText="No order/customer revenue sample loaded yet."
                columns={[
                  { key: "customer", label: "Customer" },
                  { key: "city", label: "City" },
                  { key: "orders", label: "Orders" },
                  {
                    key: "revenue",
                    label: "Revenue",
                    format: (value) => money(value),
                  },
                ]}
              />
            </div>
          </section>

          <section id="data" className="business-modules">
            <div className="section-title business-module-title">
              <div>
                <p className="eyebrow">Business data modules</p>
                <h2>
                  <Layers3 size={22} /> Products, customers, and orders
                </h2>
                <p>
                  Explore the protected commerce dataset through the active
                  database path. Each module keeps its own filters, selected
                  record, query evidence, and SQLWatcher path status.
                </p>
              </div>
              <div className="module-title-actions">
                <QuerySourceBadge label="Products" result={products} mode={mode} />
                <QuerySourceBadge label="Customers" result={customers} mode={mode} />
                <QuerySourceBadge label="Orders" result={orders} mode={mode} />
              </div>
            </div>

            <article className="business-module product-module">
              <div className="module-hero">
                <div>
                  <p className="eyebrow">Inventory intelligence</p>
                  <h2>
                    <ShoppingBag size={22} /> Product Catalog
                  </h2>
                  <p>
                    Search SKUs, review category exposure, watch low-stock
                    inventory, and inspect product rows without leaving the
                    protected SecureShop workflow.
                  </p>
                </div>
                <button onClick={() => loadProducts()}>
                  <RefreshCw size={15} /> Refresh Products
                </button>
              </div>

              <div className="module-metrics">
                <BusinessMetric
                  label="Loaded products"
                  value={productRows.length}
                  detail={`${products?.total ?? productRows.length} total from query`}
                  tone="good"
                />
                <BusinessMetric
                  label="Categories"
                  value={productCategoryCount}
                  detail="Distinct categories in current page"
                />
                <BusinessMetric
                  label="Inventory value"
                  value={money(productInventoryValue)}
                  detail="Loaded stock × unit price"
                />
                <BusinessMetric
                  label="Low stock"
                  value={lowStockCount}
                  detail="Products at or below 25 units"
                  tone={lowStockCount > 0 ? "warn" : "good"}
                />
              </div>

              <div className="module-filter-bar">
                <label>
                  <Search size={14} /> Search products
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadProducts()}
                    placeholder="keyboard, camera, monitor..."
                  />
                </label>
                <label>
                  <Filter size={14} /> Category
                  <select
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <button className="ghost" onClick={() => {
                  setProductSearch("");
                  setProductCategory("");
                  setTimeout(() => loadProducts(), 0);
                }}>
                  Reset
                </button>
                <button onClick={() => loadProducts()}>Apply Filters</button>
              </div>

              <div className="module-grid">
                <div className="module-table-card">
                  <ResultTable
                    result={products}
                    title="Product rows"
                    rowIdKey="product_id"
                    selectedRow={selectedProduct}
                    onRowClick={setSelectedProduct}
                    maxHeight={520}
                    columns={[
                      { key: "product_id", label: "ID" },
                      { key: "name", label: "Product" },
                      { key: "category", label: "Category" },
                      { key: "price", label: "Price", format: (value) => money(value) },
                      { key: "stock_quantity", label: "Stock" },
                      { key: "supplier", label: "Supplier" },
                    ]}
                  />
                </div>
                <RecordDetail
                  title={String(selectedProduct?.name ?? "No product selected")}
                  subtitle="Inventory and supplier context"
                  row={selectedProduct}
                  fields={[
                    { key: "product_id", label: "Product ID" },
                    { key: "category", label: "Category" },
                    { key: "price", label: "Unit Price", format: (value) => money(value) },
                    { key: "stock_quantity", label: "Stock" },
                    { key: "supplier", label: "Supplier" },
                    { key: "created_at", label: "Created" },
                  ]}
                  footer={
                    <span>
                      {selectedProduct && toNumber(selectedProduct.stock_quantity) <= 25
                        ? "Low stock item: useful for operational dashboards, not a database threat."
                        : "Normal catalog lookup: should generally be ALLOW through SQLWatcher."}
                    </span>
                  }
                />
              </div>
            </article>

            <article className="business-module customer-module">
              <div className="module-hero">
                <div>
                  <p className="eyebrow">Customer operations</p>
                  <h2>
                    <Users size={22} /> Customer Directory
                  </h2>
                  <p>
                    Review customer records by city and segment while keeping
                    broad customer access visible to SQLWatcher for analyst
                    investigation.
                  </p>
                </div>
                <button onClick={() => loadCustomers()}>
                  <RefreshCw size={15} /> Refresh Customers
                </button>
              </div>

              <div className="module-metrics">
                <BusinessMetric
                  label="Loaded customers"
                  value={customerRows.length}
                  detail={`${customers?.total ?? customerRows.length} total from query`}
                  tone="good"
                />
                <BusinessMetric
                  label="Cities"
                  value={customerCityCount}
                  detail="Distinct cities in current page"
                />
                <BusinessMetric
                  label="Segments"
                  value={customerSegmentCount}
                  detail="Customer segments represented"
                />
                <BusinessMetric
                  label="Path decision"
                  value={resultDecision(customers).label}
                  detail={resultDecision(customers).detail}
                  tone={resultDecision(customers).tone as "neutral" | "good" | "warn" | "danger"}
                />
              </div>

              <div className="module-filter-bar">
                <label>
                  <Search size={14} /> Search customers
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadCustomers()}
                    placeholder="name, email, city..."
                  />
                </label>
                <label>
                  <Filter size={14} /> City
                  <select
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                  >
                    <option value="">All cities</option>
                    {cities.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <button className="ghost" onClick={() => {
                  setCustomerSearch("");
                  setCustomerCity("");
                  setTimeout(() => loadCustomers(), 0);
                }}>
                  Reset
                </button>
                <button onClick={() => loadCustomers()}>Apply Filters</button>
              </div>

              <div className="module-grid">
                <div className="module-table-card">
                  <ResultTable
                    result={customers}
                    title="Customer rows"
                    rowIdKey="customer_id"
                    selectedRow={selectedCustomer}
                    onRowClick={setSelectedCustomer}
                    maxHeight={520}
                    columns={[
                      { key: "customer_id", label: "ID" },
                      { key: "full_name", label: "Customer" },
                      { key: "email", label: "Email" },
                      { key: "city", label: "City" },
                      { key: "segment", label: "Segment" },
                      { key: "created_at", label: "Created" },
                    ]}
                  />
                </div>
                <RecordDetail
                  title={String(selectedCustomer?.full_name ?? "No customer selected")}
                  subtitle="Customer profile and exposure context"
                  row={selectedCustomer}
                  fields={[
                    { key: "customer_id", label: "Customer ID" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Phone" },
                    { key: "city", label: "City" },
                    { key: "segment", label: "Segment" },
                    { key: "created_at", label: "Created" },
                  ]}
                  footer={
                    <span>
                      Broad customer access is intentionally visible in SQLWatcher so analysts can compare normal directory use with suspicious dumps.
                    </span>
                  }
                />
              </div>
            </article>

            <article className="business-module orders-module">
              <div className="module-hero">
                <div>
                  <p className="eyebrow">Transaction intelligence</p>
                  <h2>
                    <Database size={22} /> Orders Explorer
                  </h2>
                  <p>
                    Inspect order activity, revenue, status distribution, and
                    transaction detail using the same database path selected for
                    the rest of SecureShop.
                  </p>
                </div>
                <button onClick={() => loadOrders()}>
                  <RefreshCw size={15} /> Refresh Orders
                </button>
              </div>

              <div className="module-metrics">
                <BusinessMetric
                  label="Loaded orders"
                  value={orderRows.length}
                  detail={`${orders?.total ?? orderRows.length} total from query`}
                  tone="good"
                />
                <BusinessMetric
                  label="Loaded revenue"
                  value={money(loadedOrderRevenue)}
                  detail="Revenue in current loaded order sample"
                />
                <BusinessMetric
                  label="Statuses"
                  value={orderStatusCount}
                  detail="Distinct order states loaded"
                />
                <BusinessMetric
                  label="Pending"
                  value={pendingOrders}
                  detail="Potential fulfilment queue"
                  tone={pendingOrders > 0 ? "warn" : "good"}
                />
              </div>

              <div className="module-filter-bar">
                <label>
                  <Search size={14} /> Search loaded orders
                  <input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="order, customer, product, city..."
                  />
                </label>
                <label>
                  <Filter size={14} /> Status
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {statuses.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <button className="ghost" onClick={() => {
                  setOrderStatus("");
                  setOrderSearch("");
                  setTimeout(() => loadOrders(), 0);
                }}>
                  Reset
                </button>
                <button onClick={() => loadOrders()}>Apply Filters</button>
              </div>

              <div className="module-grid">
                <div className="module-table-card">
                  <ResultTable
                    result={orders ? { ...orders, rows: filteredOrderRows, row_count: filteredOrderRows.length } : null}
                    title="Order rows"
                    rowIdKey="order_id"
                    selectedRow={selectedOrder}
                    onRowClick={setSelectedOrder}
                    maxHeight={560}
                    columns={[
                      { key: "order_id", label: "Order" },
                      { key: "customer", label: "Customer" },
                      { key: "city", label: "City" },
                      { key: "product", label: "Product" },
                      { key: "status", label: "Status" },
                      { key: "order_total", label: "Total", format: (value) => money(value) },
                    ]}
                  />
                </div>
                <RecordDetail
                  title={selectedOrder ? `Order #${String(selectedOrder.order_id ?? "-")}` : "No order selected"}
                  subtitle="Transaction and fulfilment context"
                  row={selectedOrder}
                  fields={[
                    { key: "order_id", label: "Order ID" },
                    { key: "customer", label: "Customer" },
                    { key: "city", label: "City" },
                    { key: "product", label: "Product" },
                    { key: "category", label: "Category" },
                    { key: "quantity", label: "Quantity" },
                    { key: "order_total", label: "Total", format: (value) => money(value) },
                    { key: "status", label: "Status" },
                  ]}
                  footer={
                    <span>
                      Transaction reads should normally pass. Destructive writes and metadata probing should be blocked by SQLWatcher.
                    </span>
                  }
                />
              </div>
            </article>
          </section>

          <section id="sql-lab" className="panel sql-lab-panel">
            <div className="sql-lab-head">
              <div>
                <p className="eyebrow">
                  Interactive database firewall testbench
                </p>
                <h2>
                  <TerminalSquare size={22} /> SQL Lab
                </h2>
                <p>
                  Run realistic business SQL and attack payloads from
                  SecureShop. In Proxy mode, every query flows through
                  SQLWatcher before reaching Neon.
                </p>
              </div>
              <div className="sql-lab-status">
                <span>Current path</span>
                <strong>
                  {mode === "proxy" ? "SQLWatcher Proxy" : "Direct Neon"}
                </strong>
                <small>
                  {mode === "proxy"
                    ? "Inspected + enforceable"
                    : "Bypasses SQLWatcher"}
                </small>
              </div>
            </div>

            <div className="sql-lab-grid">
              <div className="sql-lab-editor-card">
                <div className="editor-toolbar">
                  <div>
                    <span>Editor persona</span>
                    <strong>
                      {visiblePersonas.find(
                        (persona) => persona.id === selectedPersona,
                      )?.label || selectedPersona}
                    </strong>
                  </div>
                  <div className="editor-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => setManualSql("")}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={runManualQuery}
                      disabled={loading === "manual-query"}
                    >
                      {loading === "manual-query"
                        ? "Executing..."
                        : "Execute SQL"}
                    </button>
                  </div>
                </div>
                <textarea
                  className="sql-editor"
                  value={manualSql}
                  onChange={(e) => setManualSql(e.target.value)}
                  spellCheck={false}
                />
                <div className="sql-lab-hints">
                  <span>
                    Tip: switch to Proxy mode to see SQLWatcher decisions and
                    alerts.
                  </span>
                  <span>Loaded example: {activeSqlExample.title}</span>
                </div>
              </div>

              <aside className="sql-decision-card">
                <span className="eyebrow">Last execution</span>
                <strong className={`decision-label ${manualDecision.tone}`}>
                  {manualDecision.label}
                </strong>
                <p>{manualDecision.detail}</p>
                <div className="decision-grid">
                  <div>
                    <span>Expected</span>
                    <b>{activeSqlExample.expected}</b>
                  </div>
                  <div>
                    <span>Mode</span>
                    <b>{mode}</b>
                  </div>
                  <div>
                    <span>Persona</span>
                    <b>{selectedPersona}</b>
                  </div>
                  <div>
                    <span>Rows</span>
                    <b>{manualResult?.row_count ?? "—"}</b>
                  </div>
                </div>
              </aside>
            </div>

            <div className="sql-example-browser">
              <div
                className="sql-group-tabs"
                role="group"
                aria-label="SQL example groups"
              >
                {SQL_GROUPS.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={selectedSqlGroup === group.id ? "active" : ""}
                    onClick={() => setSelectedSqlGroup(group.id)}
                  >
                    <strong>{group.label}</strong>
                    <span>{group.description}</span>
                  </button>
                ))}
              </div>
              <div className="sql-example-grid">
                {visibleSqlExamples.map((example) => (
                  <SqlExampleCard
                    key={example.id}
                    example={example}
                    active={example.id === activeSqlExampleId}
                    onLoad={() => loadSqlExample(example)}
                    onRun={() => runSqlExample(example)}
                  />
                ))}
              </div>
            </div>

            <ResultTable result={manualResult} title="SQL Lab result" />
          </section>

          <section id="demo" className="panel anomaly-workflow">
            <h2>
              <BrainCircuit size={22} /> SecureShop-Controlled SQLWatcher Setup
            </h2>
            <p>
              SecureShop controls the full anomaly demo: reset SQLWatcher data,
              generate clean baseline traffic, train baselines, then run anomaly
              batches.
            </p>
            <div className="workflow-steps">
              <div>
                <strong>1. Reset SQLWatcher</strong>
                <span>
                  Clears logs, alerts, anomaly scores, analyst feedback, and
                  baselines while preserving users, rules, and deployment
                  settings.
                </span>
                <button
                  onClick={checkSqlWatcherControl}
                  disabled={loading === "sqlwatcher-control-status"}
                >
                  {loading === "sqlwatcher-control-status"
                    ? "Checking..."
                    : "Check SQLWatcher"}
                </button>
                <button
                  className="danger"
                  onClick={resetSqlWatcherData}
                  disabled={loading === "sqlwatcher-reset"}
                >
                  {loading === "sqlwatcher-reset"
                    ? "Resetting..."
                    : "Reset SQLWatcher Data"}
                </button>
              </div>
              <div>
                <strong>2. Build baseline from SecureShop</strong>
                <span>
                  Sends clean multi-persona traffic through SQLWatcher Proxy and
                  trains baselines automatically.
                </span>
                <label>
                  Cycles
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={baselineCycles}
                    onChange={(e) => setBaselineCycles(Number(e.target.value))}
                  />
                </label>
                <button
                  onClick={() => runSecureShopControlledSetup(false)}
                  disabled={loading === "controlled-baseline"}
                >
                  {loading === "controlled-baseline"
                    ? "Preparing..."
                    : "Reset + Train Baselines"}
                </button>
              </div>
              <div>
                <strong>3. Run complete demo</strong>
                <span>
                  Runs reset, baseline traffic, training, anomaly batch, and
                  returns SQLWatcher readiness.
                </span>
                <div className="batch-controls">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    {(scenarioCatalog?.categories || []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => runScenarioBatch()}
                    disabled={loading.startsWith("batch-")}
                  >
                    {loading.startsWith("batch-")
                      ? "Running..."
                      : "Run Batch Only"}
                  </button>
                  <button
                    onClick={() => runSecureShopControlledSetup(true)}
                    disabled={loading === "controlled-full-demo"}
                  >
                    {loading === "controlled-full-demo"
                      ? "Running..."
                      : "Full Reset + Train + Anomalies"}
                  </button>
                </div>
              </div>
            </div>

            {sqlWatcherControl && (
              <div className="result control-result">
                <strong>SQLWatcher control result</strong>
                <p>
                  Status:{" "}
                  <b>
                    {sqlWatcherControl.status ||
                      sqlWatcherControl.control?.readiness?.readiness?.status ||
                      sqlWatcherControl.readiness?.readiness?.status ||
                      "available"}
                  </b>
                </p>
                <DataBlock data={sqlWatcherControl} />
              </div>
            )}

            {controlledSetup && (
              <div className="result ok control-result">
                <strong>SecureShop-controlled setup complete</strong>
                <p>{controlledSetup.message}</p>
                <p>
                  Readiness:{" "}
                  <b>
                    {controlledSetup.steps?.readiness?.readiness?.status ||
                      "unknown"}
                  </b>
                </p>
                <p>
                  Training profiles:{" "}
                  <b>
                    {controlledSetup.steps?.training?.trained_profiles ?? "-"}
                  </b>{" "}
                  • Baseline queries:{" "}
                  <b>
                    {controlledSetup.steps?.baseline_traffic?.ok_count ?? "-"}/
                    {controlledSetup.steps?.baseline_traffic?.count ?? "-"}
                  </b>
                </p>
                <DataBlock
                  data={
                    controlledSetup.steps?.readiness?.readiness ||
                    controlledSetup
                  }
                />
              </div>
            )}

            {baselineTraffic && (
              <div className="result ok">
                <strong>Baseline traffic generated</strong>
                <p>
                  {baselineTraffic.ok_count}/{baselineTraffic.count} queries
                  executed through SQLWatcher Proxy across{" "}
                  {baselineTraffic.users.length} personas.
                </p>
                <div className="persona-grid">
                  {Object.entries(baselineTraffic.per_user || {}).map(
                    ([user, stats]) => (
                      <div key={user}>
                        <b>{user}</b>
                        <span>
                          {stats.ok}/{stats.attempted} ok
                        </span>
                      </div>
                    ),
                  )}
                </div>
                <p className="small">{baselineTraffic.next_step}</p>
              </div>
            )}

            {batchResult && (
              <div className="result">
                <strong>{batchResult.category} batch complete</strong>
                <p>
                  Executed: {batchResult.executed} • Blocked/Error:{" "}
                  {batchResult.blocked_or_error} • Total: {batchResult.count}
                </p>
                <div className="scenario-table">
                  <div className="scenario-table-head">
                    <span>Scenario</span>
                    <span>Persona</span>
                    <span>Expected</span>
                    <span>Result</span>
                    <span>Latency</span>
                  </div>
                  {batchResult.results.map((item) => (
                    <div className="scenario-table-row" key={item.scenario}>
                      <span>{item.title}</span>
                      <span>{item.app_user}</span>
                      <span>{item.expected_proxy}</span>
                      <span>{item.ok ? "EXECUTED" : "BLOCKED/ERROR"}</span>
                      <span>{item.latency_ms} ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section id="scenarios" className="panel security-scenarios-panel">
            <div className="security-scenarios-head">
              <div>
                <p className="eyebrow">Guided attack and anomaly stories</p>
                <h2>
                  <Zap size={22} /> Security Test Scenarios
                </h2>
                <p>
                  Run realistic SecureShop scenarios and immediately compare the
                  expected SQLWatcher decision with what happened through Direct
                  or Proxy mode.
                </p>
              </div>
              <div className="scenario-head-actions">
                <a
                  className="ghost scenario-link"
                  href={`${SQLWATCHER_UI_BASE}/overview`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open SQLWatcher
                </a>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => runScenarioBatch(selectedCategory)}
                  disabled={loading.startsWith("batch-")}
                >
                  {loading.startsWith("batch-")
                    ? "Running batch..."
                    : "Run Category Batch"}
                </button>
              </div>
            </div>

            <div
              className="scenario-category-tabs"
              role="tablist"
              aria-label="Scenario categories"
            >
              {scenarioCounts.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={selectedCategory === category.id ? "active" : ""}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <span>{category.label}</span>
                  <b>{category.count}</b>
                </button>
              ))}
            </div>

            <div className="scenario-layout-grid">
              <div className="security-scenario-grid">
                {visibleScenarios.length === 0 ? (
                  <div className="empty-state compact">
                    No scenarios available for this category.
                  </div>
                ) : (
                  visibleScenarios.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      result={scenarioResults[scenario.id]}
                      isLoading={loading.startsWith(`security-${scenario.id}`)}
                      onRunCurrent={() =>
                        runSecurityTest(scenario.id, mode, scenario.app_user)
                      }
                      onRunProxy={() =>
                        runSecurityTest(scenario.id, "proxy", scenario.app_user)
                      }
                      onRunDirect={() =>
                        runSecurityTest(
                          scenario.id,
                          "direct",
                          scenario.app_user,
                        )
                      }
                    />
                  ))
                )}
              </div>

              <ScenarioEvidencePanel result={security} />
            </div>

            {batchResult && (
              <div className="result scenario-batch-summary">
                <strong>{batchResult.category} batch complete</strong>
                <p>
                  Executed: {batchResult.executed} • Blocked/Error:{" "}
                  {batchResult.blocked_or_error} • Total: {batchResult.count}
                </p>
                <div className="scenario-table">
                  <div className="scenario-table-head">
                    <span>Scenario</span>
                    <span>Persona</span>
                    <span>Expected</span>
                    <span>Result</span>
                    <span>Latency</span>
                  </div>
                  {batchResult.results.map((item) => (
                    <div className="scenario-table-row" key={item.scenario}>
                      <span>{item.title}</span>
                      <span>{item.app_user}</span>
                      <span>{item.expected_proxy}</span>
                      <span>{item.ok ? "EXECUTED" : "BLOCKED/ERROR"}</span>
                      <span>{item.latency_ms} ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section id="benchmark" className="panel benchmark-panel benchmark-workspace">
            <div className="section-heading-row">
              <div>
                <h2>
                  <BarChart3 size={22} /> Benchmark Lab
                </h2>
                <p>
                  Run repeatable Direct-vs-Proxy trials with accurate request counts,
                  latency percentiles, outcome totals, and manual refresh controls for
                  live demos.
                </p>
              </div>
              <button className="ghost" onClick={refreshBenchmarkContext} disabled={!!loading}>
                <RefreshCw size={16} /> Refresh status
              </button>
            </div>

            <div className="benchmark-controls-grid">
              <label>
                Requests per path / run
                <input
                  type="number"
                  value={requests}
                  min={1}
                  max={10000}
                  onChange={(e) => setRequests(Number(e.target.value))}
                />
              </label>
              <label>
                Concurrency
                <input
                  type="number"
                  value={concurrency}
                  min={1}
                  max={100}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
              </label>
              <label>
                Repeats
                <input
                  type="number"
                  value={repeats}
                  min={1}
                  max={10}
                  onChange={(e) => setRepeats(Number(e.target.value))}
                />
              </label>
              <label>
                Workload profile
                <select
                  value={benchmarkProfile}
                  onChange={(e) => setBenchmarkProfile(e.target.value)}
                >
                  <option value="safe_reads">Safe product reads</option>
                  <option value="mixed_business">Mixed dashboard workload</option>
                  <option value="analytics">Reporting analytics workload</option>
                </select>
              </label>
              <div className="benchmark-request-plan">
                <span>Planned attempts</span>
                <strong>{intFormat(requests * repeats * 2)}</strong>
                <small>Direct + Proxy across all repeats</small>
              </div>
              <button onClick={runCompare} disabled={loading === "benchmark"}>
                {loading === "benchmark"
                  ? "Running benchmark..."
                  : `Run ${repeats}x Direct/Proxy`}
              </button>
            </div>

            {loading === "benchmark" && (
              <div className="benchmark-running">
                <Timer size={18} />
                Running {intFormat(requests * repeats * 2)} request attempts.
                Keep this tab open until the comparison completes.
              </div>
            )}

            {compare && (
              <div className="benchmark-results">
                <div className="benchmark-summary-strip">
                  <div>
                    <span>Total attempts recorded</span>
                    <strong>{intFormat(compare.total_requests_sent || compare.direct.total_requests + compare.proxy.total_requests)}</strong>
                  </div>
                  <div>
                    <span>Expected attempts</span>
                    <strong>{intFormat(compare.requests * (compare.repeats || 1) * 2)}</strong>
                  </div>
                  <div>
                    <span>Workload</span>
                    <strong>{(compare.profile || benchmarkProfile).replace(/_/g, " ")}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{compare.status.replace(/_/g, " ")}</strong>
                  </div>
                </div>

                <div className="benchmark-grid">
                  <BenchmarkPathCard title="Direct Neon" tone="direct" benchmark={compare.direct} />
                  <BenchmarkPathCard title="SQLWatcher Proxy" tone="proxy" benchmark={compare.proxy} />
                  <div className="bench interpretation">
                    <h3>Comparison</h3>
                    <p>
                      Avg latency delta: <b>{formatLatencyDelta(compare.comparison.added_avg_latency_ms)}</b>
                    </p>
                    <p>
                      P95 latency delta: <b>{formatLatencyDelta(compare.comparison.added_p95_latency_ms)}</b>
                    </p>
                    <p>
                      Throughput delta: <b>{formatThroughputDelta(compare.comparison.throughput_reduction_percent)}</b>
                    </p>
                    <small>
                      Use repeated runs for demos. Neon, Docker networking, and cold
                      connections can make a single short run noisy.
                    </small>
                  </div>
                </div>

                <div className="chart-grid-two benchmark-charts">
                  <BarList
                    title="Average latency by run"
                    data={(compare.runs || []).flatMap((run) => [
                      { name: `Direct ${run.run}`, value: run.direct.avg_latency_ms },
                      { name: `Proxy ${run.run}`, value: run.proxy.avg_latency_ms },
                    ])}
                    labelKey="name"
                    valueKey="value"
                  />
                  <BarList
                    title="Throughput by run"
                    data={(compare.runs || []).flatMap((run) => [
                      { name: `Direct ${run.run}`, value: run.direct.throughput_qps },
                      { name: `Proxy ${run.run}`, value: run.proxy.throughput_qps },
                    ])}
                    labelKey="name"
                    valueKey="value"
                  />
                </div>

                <div className="chart-grid-two benchmark-charts">
                  <BarList
                    title="Outcome distribution"
                    data={[
                      { name: "Direct success", value: compare.direct.successful_requests ?? compare.direct.total_requests - compare.direct.errors },
                      { name: "Direct failed", value: compare.direct.failed_requests ?? compare.direct.errors },
                      { name: "Proxy success", value: compare.proxy.successful_requests ?? compare.proxy.total_requests - compare.proxy.errors },
                      { name: "Proxy blocked", value: compare.proxy.blocked_requests ?? outcomeTotal(compare.proxy, "BLOCK") },
                      { name: "Proxy failed", value: compare.proxy.failed_requests ?? compare.proxy.errors },
                    ]}
                    labelKey="name"
                    valueKey="value"
                  />
                  <BarList
                    title="P95 latency by run"
                    data={(compare.runs || []).flatMap((run) => [
                      { name: `Direct ${run.run}`, value: run.direct.p95_latency_ms },
                      { name: `Proxy ${run.run}`, value: run.proxy.p95_latency_ms },
                    ])}
                    labelKey="name"
                    valueKey="value"
                  />
                </div>

                <BenchmarkRunCards runs={compare.runs || []} />
                <ResultTable
                  result={{
                    ok: true,
                    latency_ms: 0,
                    row_count: compare.runs?.length || 0,
                    rows: benchmarkRows(compare),
                  }}
                  title="Benchmark trial table"
                />
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
