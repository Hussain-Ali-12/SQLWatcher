from __future__ import annotations
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from statistics import mean, median
from typing import Any
import psycopg
from psycopg.rows import dict_row
from .config import DIRECT_DATABASE_URL as INITIAL_DIRECT_DATABASE_URL, SQLWATCHER_PROXY_DATABASE_URL as INITIAL_SQLWATCHER_PROXY_DATABASE_URL

RUNTIME_CONNECTION_CONFIG = {
    "direct": INITIAL_DIRECT_DATABASE_URL,
    "proxy": INITIAL_SQLWATCHER_PROXY_DATABASE_URL,
}

def mask_url(url: str) -> str:
    """Mask password for transparent UI display while keeping host/db visible."""
    try:
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(url)
        if "@" not in parts.netloc:
            return url
        userinfo, hostinfo = parts.netloc.rsplit("@", 1)
        if ":" in userinfo:
            username, _password = userinfo.split(":", 1)
            safe_netloc = f"{username}:********@{hostinfo}"
        else:
            safe_netloc = f"{userinfo}@{hostinfo}"
        return urlunsplit((parts.scheme, safe_netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        return url

def parse_url_info(url: str) -> dict[str, str]:
    try:
        from urllib.parse import urlsplit, parse_qs
        parts = urlsplit(url)
        username = parts.username or ""
        host = parts.hostname or ""
        port = str(parts.port or "")
        database = parts.path.lstrip("/")
        query = parse_qs(parts.query)
        return {
            "scheme": parts.scheme,
            "username": username,
            "host": host,
            "port": port,
            "database": database,
            "sslmode": (query.get("sslmode", [""])[0] or ""),
            "channel_binding": (query.get("channel_binding", [""])[0] or ""),
            "masked_url": mask_url(url),
            "raw_url": url,
        }
    except Exception as exc:
        return {"masked_url": mask_url(url), "raw_url": url, "parse_error": str(exc)}

def get_connection_config() -> dict:
    return {
        "direct": parse_url_info(RUNTIME_CONNECTION_CONFIG["direct"]),
        "proxy": parse_url_info(RUNTIME_CONNECTION_CONFIG["proxy"]),
        "active_note": "SecureShop API runtime configuration. Changes apply until the API container restarts.",
    }

def update_connection_config(direct_database_url: str | None = None, proxy_database_url: str | None = None) -> dict:
    if direct_database_url:
        RUNTIME_CONNECTION_CONFIG["direct"] = direct_database_url.strip()
    if proxy_database_url:
        RUNTIME_CONNECTION_CONFIG["proxy"] = proxy_database_url.strip()
    return get_connection_config()

SAFE_BENCHMARK_QUERIES = [
    ("SELECT product_id, name, category FROM products WHERE product_id = %s", (1,)),
    ("SELECT product_id, name, category FROM products WHERE product_id = %s", (2,)),
    ("SELECT product_id, name, category FROM products WHERE category = %s", ("electronics",)),
    ("SELECT product_id, name, category FROM products WHERE price > %s", (100,)),
]

MIXED_BENCHMARK_QUERIES = [
    ("SELECT product_id, name, category FROM products WHERE product_id = %s", (1,)),
    ("SELECT COUNT(*) AS count FROM products", ()),
    ("SELECT COUNT(*) AS count FROM customers", ()),
    ("SELECT status, COUNT(*) AS orders FROM orders GROUP BY status ORDER BY orders DESC", ()),
    ("SELECT category, COUNT(*) AS total FROM products GROUP BY category", ()),
]

ANALYTICS_BENCHMARK_QUERIES = [
    ("SELECT TO_CHAR(DATE(created_at), 'MM-DD') AS day, COUNT(*) AS orders, ROUND(COALESCE(SUM(order_total), 0), 2) AS revenue FROM orders GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC LIMIT 14", ()),
    ("SELECT p.category, COUNT(*) AS orders, ROUND(COALESCE(SUM(o.order_total), 0), 2) AS revenue FROM orders o JOIN products p ON p.product_id = o.product_id GROUP BY p.category ORDER BY revenue DESC", ()),
    ("SELECT city, COUNT(*) AS customers FROM customers GROUP BY city ORDER BY customers DESC LIMIT 10", ()),
    ("SELECT p.name, p.category, SUM(o.quantity) AS units, ROUND(COALESCE(SUM(o.order_total), 0), 2) AS revenue FROM orders o JOIN products p ON p.product_id = o.product_id GROUP BY p.name, p.category ORDER BY revenue DESC LIMIT 10", ()),
]

BENCHMARK_QUERY_PROFILES = {
    "safe_reads": SAFE_BENCHMARK_QUERIES,
    "mixed_business": MIXED_BENCHMARK_QUERIES,
    "analytics": ANALYTICS_BENCHMARK_QUERIES,
}

def get_benchmark_queries(profile: str | None) -> list[tuple[str, tuple[Any, ...]]]:
    """Return the query set for a benchmark workload profile."""
    key = (profile or "mixed_business").strip().lower()
    return BENCHMARK_QUERY_PROFILES.get(key, MIXED_BENCHMARK_QUERIES)

def tag_sql_for_app_user(sql: str, app_user: str | None = None) -> str:
    """Attach a logical app-user marker for SQLWatcher proxy logging.

    The proxy extracts this leading comment and records the query under that
    logical user, while PostgreSQL safely ignores the comment.
    """
    cleaned_user = (app_user or "web_app").strip()
    cleaned_user = "".join(ch for ch in cleaned_user if ch.isalnum() or ch in ("_", "-", "."))[:64] or "web_app"
    return f"/* sqlwatcher_user={cleaned_user} */ {sql}"

def get_dsn(mode: str) -> str:
    mode = (mode or "proxy").lower().strip()
    if mode in RUNTIME_CONNECTION_CONFIG:
        return RUNTIME_CONNECTION_CONFIG[mode]
    raise ValueError("Invalid mode. Use direct or proxy.")

def percentile(values: list[float], p: int) -> float:
    if not values: return 0.0
    values = sorted(values)
    return values[int(round((p/100)*(len(values)-1)))]

def run_query(mode: str, sql: str, params: tuple[Any, ...] = (), app_user: str | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    tagged_sql = tag_sql_for_app_user(sql, app_user)
    with psycopg.connect(get_dsn(mode), autocommit=True, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(tagged_sql, params)
            rows = cur.fetchall() if cur.description else []
    return {"mode": mode, "app_user": app_user or "web_app", "ok": True, "latency_ms": round((time.perf_counter()-started)*1000,3), "row_count": len(rows), "rows": rows}

def test_connection(mode: str) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        dsn = get_dsn(mode)
        with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_database() AS database, current_user AS db_user, inet_server_addr()::TEXT AS server_addr, inet_server_port() AS server_port")
                rows = cur.fetchall()
        return {
            "mode": mode,
            "ok": True,
            "latency_ms": round((time.perf_counter() - started) * 1000, 3),
            "connection": parse_url_info(dsn),
            "server": rows[0] if rows else {},
        }
    except Exception as exc:
        return {
            "mode": mode,
            "ok": False,
            "latency_ms": round((time.perf_counter() - started) * 1000, 3),
            "connection": parse_url_info(get_dsn(mode)),
            "error": str(exc),
        }

def run_query_captured(mode: str, sql: str, params: tuple[Any, ...] = (), app_user: str | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        return run_query(mode, sql, params, app_user)
    except Exception as exc:
        return {"mode": mode, "app_user": app_user or "web_app", "ok": False, "latency_ms": round((time.perf_counter()-started)*1000,3), "row_count": 0, "rows": [], "error": str(exc)}

def worker(worker_id: int, mode: str, count: int, profile: str | None = None) -> list[dict[str, Any]]:
    """Execute one benchmark worker.

    The worker returns error rows instead of raising connection exceptions. This
    keeps /api/benchmark stable when a cloud PostgreSQL endpoint closes a burst
    connection.
    """
    if count <= 0:
        return []

    connection_started = time.perf_counter()
    try:
        conn = psycopg.connect(get_dsn(mode), autocommit=True, row_factory=dict_row)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - connection_started) * 1000
        return [
            {
                "ok": False,
                "action": "ERROR",
                "latency_ms": elapsed_ms,
                "error": str(exc),
            }
            for _ in range(count)
        ]

    results: list[dict[str, Any]] = []
    try:
        with conn:
            with conn.cursor() as cur:
                queries = get_benchmark_queries(profile)
                for i in range(count):
                    sql, params = queries[(worker_id + i) % len(queries)]
                    st = time.perf_counter()
                    try:
                        cur.execute(sql, params)
                        cur.fetchall()
                        results.append({
                            "ok": True,
                            "action": "OK",
                            "latency_ms": (time.perf_counter() - st) * 1000,
                        })
                    except Exception as exc:
                        results.append({
                            "ok": False,
                            "action": "ERROR",
                            "latency_ms": (time.perf_counter() - st) * 1000,
                            "error": str(exc),
                        })
    except Exception as exc:
        # If the connection breaks outside cursor execution, mark remaining
        # requests as failed instead of crashing the benchmark.
        completed = len(results)
        missing = max(0, count - completed)
        results.extend([
            {
                "ok": False,
                "action": "ERROR",
                "latency_ms": 0,
                "error": str(exc),
            }
            for _ in range(missing)
        ])

    return results

def run_benchmark(mode: str, requests: int, concurrency: int, profile: str | None = None) -> dict[str, Any]:
    requests = max(1, min(int(requests), 10000))
    concurrency = max(1, min(int(concurrency), 100))
    active_workers = max(1, min(concurrency, requests))

    base = requests // active_workers
    rem = requests % active_workers
    counts = [base + (1 if i < rem else 0) for i in range(active_workers)]

    st = time.perf_counter()
    all_results: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=active_workers) as ex:
        futs = [ex.submit(worker, i, mode, counts[i], profile) for i in range(active_workers)]
        for fut in as_completed(futs):
            try:
                all_results.extend(fut.result())
            except Exception as exc:
                all_results.append({
                    "ok": False,
                    "action": "ERROR",
                    "latency_ms": 0,
                    "error": str(exc),
                })

    duration = time.perf_counter() - st
    lats = [float(x.get("latency_ms") or 0) for x in all_results]
    errs = [x for x in all_results if not x.get("ok")]
    actions: dict[str, int] = {}
    for item in all_results:
        action = item.get("action") or ("OK" if item.get("ok") else "ERROR")
        actions[action] = actions.get(action, 0) + 1

    total = len(all_results)
    errors = len(errs)
    blocked = int(actions.get("BLOCK", 0) or actions.get("BLOCKED", 0) or 0)
    flagged = int(actions.get("FLAG", 0) or actions.get("FLAGGED", 0) or 0)
    successful = len([item for item in all_results if item.get("ok")])

    return {
        "mode": mode,
        "profile": (profile or "mixed_business"),
        "total_requests": total,
        "requested": requests,
        "successful_requests": successful,
        "failed_requests": errors,
        "blocked_requests": blocked,
        "flagged_requests": flagged,
        "concurrency": active_workers,
        "duration_sec": round(duration, 3),
        "throughput_qps": round(total / duration, 3) if duration else 0,
        "avg_latency_ms": round(mean(lats), 3) if lats else 0,
        "median_latency_ms": round(median(lats), 3) if lats else 0,
        "p50_latency_ms": round(median(lats), 3) if lats else 0,
        "p95_latency_ms": round(percentile(lats, 95), 3),
        "p99_latency_ms": round(percentile(lats, 99), 3),
        "min_latency_ms": round(min(lats), 3) if lats else 0,
        "max_latency_ms": round(max(lats), 3) if lats else 0,
        "actions": actions,
        "errors": errors,
        "sample_error": errs[0].get("error") if errs else None,
    }
