from __future__ import annotations
import json
import os
import time
from urllib import request as urllib_request, error as urllib_error
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .config import CORS_ORIGINS, DEFAULT_CONNECTION_MODE
from .db import run_benchmark, run_query_captured, get_connection_config, update_connection_config, test_connection
from .enrichment import enrich_database as enrich_protected_database

app = FastAPI(title="SecureShop Client API", version="1.0.0", description="Demo client app for SQLWatcher direct-vs-proxy scenarios.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_origin_regex=r"https://.*\.(github\.io|vercel\.app|netlify\.app|pages\.dev)",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

Mode = Literal["direct", "proxy"]

SQLWATCHER_API_BASE = os.getenv("SQLWATCHER_API_BASE", "http://backend:8000/api").rstrip("/")
SQLWATCHER_USERNAME = os.getenv("SQLWATCHER_USERNAME", "admin")
SQLWATCHER_PASSWORD = os.getenv("SQLWATCHER_PASSWORD", "")

class BenchmarkRequest(BaseModel):
    mode: Mode = "proxy"
    requests: int = Field(default=1000, ge=1, le=10000)
    concurrency: int = Field(default=25, ge=1, le=100)

class BenchmarkComparisonRequest(BaseModel):
    mode: str | None = "comparison"
    requests: int = Field(default=1000, ge=1, le=10000)
    concurrency: int = Field(default=25, ge=1, le=100)
    repeats: int = Field(default=5, ge=1, le=10)
    profile: str = Field(default="mixed_business")


class SecurityScenarioRequest(BaseModel):
    mode: Mode = "proxy"
    scenario: str
    app_user: str | None = None

class TrafficSimulationRequest(BaseModel):
    mode: Mode = "proxy"
    app_user: str | None = None
    include_all_users: bool = True
    cycles: int = Field(default=5, ge=1, le=100)

class SecurityBatchRequest(BaseModel):
    mode: Mode = "proxy"
    category: str | None = "anomalies"
    app_user: str | None = None
    scenarios: list[str] | None = None

class SqlWatcherResetRequest(BaseModel):
    include_audit_events: bool = True
    include_auth_sessions: bool = False
    reset_rule_trigger_counts: bool = True
    reason: str | None = "SecureShop-controlled reset"

class TargetDatabaseEnrichRequest(BaseModel):
    database_url: str | None = None
    reset: bool = True
    customers: int = Field(default=600, ge=1, le=20000)
    products: int = Field(default=250, ge=1, le=20000)
    employees: int = Field(default=120, ge=1, le=5000)
    orders: int = Field(default=2500, ge=1, le=200000)
    sslmode: str = "require"

class SqlWatcherControlledSetupRequest(BaseModel):
    cycles: int = Field(default=5, ge=1, le=100)
    settle_seconds: int = Field(default=8, ge=0, le=60)
    reset_sqlwatcher: bool = True
    enable_anomaly: bool = True
    anomaly_min_score: int = Field(default=70, ge=1, le=100)
    train_baseline: bool = True
    run_anomaly_batch: bool = False
    auto_confirm_top_anomaly: bool = False
    enrich_target_database: bool = False
    reset_target_database: bool = True
    target_database_url: str | None = None

class ConnectionConfigRequest(BaseModel):
    direct_database_url: str | None = None
    proxy_database_url: str | None = None

class ManualQueryRequest(BaseModel):
    mode: Mode = "proxy"
    sql: str = Field(..., min_length=1)
    app_user: str | None = "web_app"


APP_PERSONAS = {
    "web_app": {
        "label": "Web App",
        "role": "Customer-facing storefront traffic",
        "normal_queries": [
            ("SELECT product_id, name, category, price FROM products ORDER BY product_id LIMIT 10", ()),
            ("SELECT product_id, name, category, price FROM products WHERE category = %s LIMIT 10", ("electronics",)),
            ("SELECT product_id, name, category, price FROM products WHERE category = %s LIMIT 10", ("home",)),
            ("SELECT product_id, name, price FROM products WHERE price <= %s ORDER BY price LIMIT 10", (100,)),
            ("SELECT order_id, order_total FROM orders ORDER BY created_at DESC LIMIT 10", ()),
            ("SELECT COUNT(*) AS product_count FROM products", ()),
        ],
    },
    "admin_user": {
        "label": "Admin User",
        "role": "Operational back-office user",
        "normal_queries": [
            ("SELECT customer_id, full_name, city FROM customers ORDER BY customer_id LIMIT 10", ()),
            ("SELECT customer_id, full_name, city FROM customers WHERE city = %s LIMIT 10", ("Islamabad",)),
            ("SELECT product_id, name, price FROM products ORDER BY product_id LIMIT 10", ()),
            ("SELECT employee_id, full_name, department FROM employees ORDER BY employee_id LIMIT 10", ()),
            ("SELECT COUNT(*) AS customer_count FROM customers", ()),
            ("SELECT COUNT(*) AS employee_count FROM employees", ()),
        ],
    },
    "finance_user": {
        "label": "Finance User",
        "role": "Finance and payroll analyst",
        "normal_queries": [
            ("SELECT order_id, order_total FROM orders ORDER BY created_at DESC LIMIT 10", ()),
            ("SELECT SUM(order_total) AS revenue FROM orders", ()),
            ("SELECT AVG(order_total) AS avg_order FROM orders", ()),
            ("SELECT salary_id, employee_id, monthly_salary FROM salary_records ORDER BY salary_id LIMIT 10", ()),
            ("SELECT employee_id, monthly_salary FROM salary_records WHERE monthly_salary > %s LIMIT 10", (50000,)),
            ("SELECT COUNT(*) AS salary_rows FROM salary_records", ()),
        ],
    },
    "reporting_bot": {
        "label": "Reporting Bot",
        "role": "Scheduled reporting and aggregation job",
        "normal_queries": [
            ("SELECT category, COUNT(*) AS total FROM products GROUP BY category", ()),
            ("SELECT city, COUNT(*) AS total FROM customers GROUP BY city", ()),
            ("SELECT product_id, SUM(quantity) AS units FROM orders GROUP BY product_id LIMIT 10", ()),
            ("SELECT DATE(created_at) AS day, COUNT(*) AS orders FROM orders GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 10", ()),
            ("SELECT category, AVG(price) AS avg_price FROM products GROUP BY category", ()),
            ("SELECT COUNT(*) AS total_orders FROM orders", ()),
        ],
    },
}

def persona_or_default(app_user: str | None) -> str:
    return app_user if app_user in APP_PERSONAS else "web_app"


def sqlwatcher_request(path: str, method: str = "GET", token: str | None = None, body: dict | None = None, timeout: int = 180) -> dict | list:
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib_request.Request(f"{SQLWATCHER_API_BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib_request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise HTTPException(status_code=exc.code, detail=f"SQLWatcher {method} {path} failed: {detail}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"SQLWatcher is unreachable at {SQLWATCHER_API_BASE}: {exc}")

def sqlwatcher_login() -> str:
    login = sqlwatcher_request(
        "/auth/login",
        method="POST",
        body={"username": SQLWATCHER_USERNAME, "password": SQLWATCHER_PASSWORD},
        timeout=30,
    )
    token = login.get("access_token") if isinstance(login, dict) else None
    if not token:
        raise HTTPException(status_code=502, detail="SQLWatcher login did not return an access token.")
    return token

def sqlwatcher_control_status(token: str | None = None) -> dict:
    token = token or sqlwatcher_login()
    return {
        "api_base": SQLWATCHER_API_BASE,
        "health": sqlwatcher_request("/health", token=token),
        "anomaly_policy": sqlwatcher_request("/system/anomaly-config", token=token),
        "readiness": sqlwatcher_request("/ml/evaluation-summary", token=token),
    }



@app.get("/")
def root():
    return {"service": "SecureShop Client API", "docs": "/docs", "health": "/api/health"}

@app.get("/api/connection-config")
def connection_config():
    return get_connection_config()

@app.post("/api/connection-config")
def update_connection_config_endpoint(payload: ConnectionConfigRequest):
    return update_connection_config(payload.direct_database_url, payload.proxy_database_url)

@app.post("/api/connection-test")
def connection_test():
    return {
        "direct": test_connection("direct"),
        "proxy": test_connection("proxy"),
        "path": {
            "direct": "SecureShop API -> Protected PostgreSQL",
            "proxy": "SecureShop API -> SQLWatcher Protected Route -> Protected PostgreSQL",
        },
    }

@app.get("/api/personas")
def personas():
    return [{"id": key, **value} for key, value in APP_PERSONAS.items()]

@app.get("/api/security-scenarios")
def security_scenarios():
    return {
        "categories": [
            {"id": "normal", "label": "Normal"},
            {"id": "attacks", "label": "Attacks"},
            {"id": "anomalies", "label": "Anomalies"},
        ],
        "scenarios": [
            {key: value for key, value in item.items() if key not in ("sql", "params")}
            for item in get_security_scenarios().values()
        ],
    }

@app.post("/api/simulate-user-traffic")
def simulate_user_traffic(payload: TrafficSimulationRequest):
    selected_users = list(APP_PERSONAS.keys()) if payload.include_all_users else [persona_or_default(payload.app_user)]
    results = []
    per_user = {app_user: {"attempted": 0, "ok": 0, "errors": 0} for app_user in selected_users}

    for cycle in range(payload.cycles):
        for app_user in selected_users:
            persona_queries = APP_PERSONAS[app_user]["normal_queries"]
            for sql, params in persona_queries:
                result = run_query_captured(payload.mode, sql, params, app_user=app_user)
                per_user[app_user]["attempted"] += 1
                if result.get("ok"):
                    per_user[app_user]["ok"] += 1
                else:
                    per_user[app_user]["errors"] += 1
                results.append({
                    "cycle": cycle + 1,
                    "app_user": app_user,
                    "sql": sql,
                    "ok": result.get("ok"),
                    "row_count": result.get("row_count"),
                    "latency_ms": result.get("latency_ms"),
                    "error": result.get("error"),
                })
    return {
        "mode": payload.mode,
        "users": selected_users,
        "cycles": payload.cycles,
        "count": len(results),
        "ok_count": len([item for item in results if item.get("ok")]),
        "per_user": per_user,
        "purpose": "baseline_training_traffic",
        "next_step": "Open SQLWatcher -> ML Baseline -> Refresh Baselines, then run anomaly scenarios.",
        "results": results,
    }


@app.post("/api/anomaly-demo/baseline-traffic")
def anomaly_demo_baseline_traffic(payload: TrafficSimulationRequest):
    """Convenience endpoint for building enough clean persona traffic before ML baseline training."""
    payload.include_all_users = True if payload.include_all_users is None else payload.include_all_users
    return simulate_user_traffic(payload)

@app.post("/api/security-test-batch")
def security_test_batch(payload: SecurityBatchRequest):
    scenarios = get_security_scenarios()
    if payload.scenarios:
        selected_ids = [scenario_id for scenario_id in payload.scenarios if scenario_id in scenarios]
    else:
        selected_ids = [
            scenario_id
            for scenario_id, item in scenarios.items()
            if not payload.category or item.get("category") == payload.category
        ]

    results = []
    for scenario_id in selected_ids:
        item = scenarios[scenario_id]
        app_user = persona_or_default(payload.app_user or item.get("app_user"))
        result = run_query_captured(payload.mode, item["sql"], item["params"], app_user=app_user)
        results.append({
            "scenario": scenario_id,
            "category": item["category"],
            "title": item["title"],
            "description": item["description"],
            "expected_proxy": item["expected_proxy"],
            "mode": payload.mode,
            "app_user": app_user,
            "sql": item["sql"],
            "ok": result.get("ok"),
            "row_count": result.get("row_count"),
            "latency_ms": result.get("latency_ms"),
            "error": result.get("error"),
            "result": result,
        })

    return {
        "mode": payload.mode,
        "category": payload.category,
        "count": len(results),
        "executed": len([item for item in results if item.get("ok")]),
        "blocked_or_error": len([item for item in results if not item.get("ok")]),
        "results": results,
    }



@app.get("/api/sqlwatcher-control/status")
def sqlwatcher_control_status_endpoint():
    token = sqlwatcher_login()
    return sqlwatcher_control_status(token)



@app.get("/api/ui-action-health")
def ui_action_health():
    """Small endpoint used to verify that SecureShop action buttons can reach the API.

    This avoids debugging confusion where the frontend renders but action endpoints
    are unavailable because an old container image is still running.
    """
    connection = get_connection_config()
    return {
        "status": "ready",
        "available_actions": [
            "target-db/enrich",
            "sqlwatcher-control/status",
            "sqlwatcher-control/reset-data",
            "secure-shop-controlled-setup",
            "manual-query",
            "compare",
        ],
        "direct_database": connection["direct"]["masked_url"],
        "proxy_database": connection["proxy"]["masked_url"],
    }

@app.post("/api/target-db/enrich")
def enrich_target_database(payload: TargetDatabaseEnrichRequest):
    """Create/upgrade and enrich the current protected database used by SecureShop.

    For Neon, pass database_url or configure SecureShop direct DB first.
    The endpoint raises a clear HTTP 500 message so the frontend can show why
    the button failed instead of appearing to do nothing.
    """
    database_url = payload.database_url or get_connection_config()["direct"]["raw_url"]
    try:
        result = enrich_protected_database(
            database_url,
            reset=payload.reset,
            customers=payload.customers,
            products=payload.products,
            employees=payload.employees,
            orders=payload.orders,
            sslmode=payload.sslmode,
        )
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Protected DB enrichment failed: {exc}"
        ) from exc

@app.post("/api/sqlwatcher-control/reset-data")
def sqlwatcher_control_reset_data(payload: SqlWatcherResetRequest):
    token = sqlwatcher_login()
    reset = sqlwatcher_request(
        "/system/reset-data",
        method="POST",
        token=token,
        body=payload.model_dump(),
        timeout=120,
    )
    return {"status": "sqlwatcher_reset_complete", "reset": reset, "control": sqlwatcher_control_status(token)}

@app.post("/api/anomaly-demo/secure-shop-controlled-setup")
def secure_shop_controlled_anomaly_setup(payload: SqlWatcherControlledSetupRequest):
    """Run the full SQLWatcher anomaly setup from SecureShop.

    This is the preferred demo flow:
    reset SQLWatcher -> enable anomaly -> generate SecureShop baseline traffic -> train SQLWatcher baselines -> optional anomaly batch.
    """
    token = sqlwatcher_login()
    steps: dict[str, object] = {}

    if payload.enrich_target_database:
        database_url = payload.target_database_url or get_connection_config()["direct"]["raw_url"]
        steps["target_db_enrichment"] = enrich_protected_database(
            database_url,
            reset=payload.reset_target_database,
            customers=300,
            products=160,
            employees=80,
            orders=2500,
            sslmode="require",
        )

    if payload.reset_sqlwatcher:
        steps["reset"] = sqlwatcher_request(
            "/system/reset-data",
            method="POST",
            token=token,
            body={
                "include_audit_events": True,
                "include_auth_sessions": False,
                "reset_rule_trigger_counts": True,
                "reason": "SecureShop-controlled setup reset",
            },
            timeout=120,
        )

    if payload.enable_anomaly:
        steps["anomaly_policy"] = sqlwatcher_request(
            "/system/anomaly-config",
            method="POST",
            token=token,
            body={"enabled": True, "enforcement_mode": "flag", "min_score": payload.anomaly_min_score},
            timeout=60,
        )

    baseline_traffic = simulate_user_traffic(TrafficSimulationRequest(mode="proxy", include_all_users=True, cycles=payload.cycles))
    steps["baseline_traffic"] = {
        "cycles": baseline_traffic.get("cycles"),
        "users": baseline_traffic.get("users"),
        "count": baseline_traffic.get("count"),
        "ok_count": baseline_traffic.get("ok_count"),
        "per_user": baseline_traffic.get("per_user"),
    }

    # The Fly proxy records telemetry asynchronously so PostgreSQL latency stays
    # low. Give the Render backend a short settling window before training the
    # baseline, otherwise training can start before the fresh proxy logs land.
    if payload.settle_seconds:
        time.sleep(payload.settle_seconds)
        steps["settle"] = {"seconds": payload.settle_seconds, "reason": "waited for async proxy telemetry before baseline training"}

    if payload.train_baseline:
        steps["training"] = sqlwatcher_request(
            "/ml/train-baseline?include_allows_only=true",
            method="POST",
            token=token,
            timeout=240,
        )

    steps["profiles"] = sqlwatcher_request("/ml/profiles", token=token, timeout=120)

    if payload.run_anomaly_batch:
        anomaly_batch = security_test_batch(SecurityBatchRequest(mode="proxy", category="anomalies"))
        steps["anomaly_batch"] = {
            "count": anomaly_batch.get("count"),
            "executed": anomaly_batch.get("executed"),
            "blocked_or_error": anomaly_batch.get("blocked_or_error"),
            "results": anomaly_batch.get("results"),
        }
        steps["anomaly_scores"] = sqlwatcher_request("/ml/anomaly-scores", token=token, timeout=120)

        if payload.auto_confirm_top_anomaly and isinstance(steps.get("anomaly_scores"), list) and steps["anomaly_scores"]:
            top = steps["anomaly_scores"][0]
            steps["auto_feedback"] = sqlwatcher_request(
                "/ml/anomaly-feedback",
                method="POST",
                token=token,
                body={
                    "query_id": top.get("query_id"),
                    "anomaly_id": top.get("anomaly_id"),
                    "feedback_type": "CONFIRM_ANOMALY",
                    "notes": "Confirmed from SecureShop-controlled demo setup.",
                },
                timeout=60,
            )

    steps["readiness"] = sqlwatcher_request("/ml/evaluation-summary", token=token, timeout=120)
    return {
        "status": "secure_shop_controlled_setup_complete",
        "message": "SQLWatcher reset, baseline traffic, baseline training, and optional anomaly batch were controlled from SecureShop.",
        "steps": steps,
    }

@app.get("/api/health")
def health():
    direct = run_query_captured("direct", "SELECT 1 AS ok")
    proxy = run_query_captured("proxy", "SELECT 1 AS ok")
    return {
        "service": "SecureShop Client API",
        "default_mode": DEFAULT_CONNECTION_MODE,
        "direct_db": "connected" if direct["ok"] else "unavailable",
        "sqlwatcher_proxy": "connected" if proxy["ok"] else "unavailable",
        "direct_latency_ms": direct["latency_ms"],
        "proxy_latency_ms": proxy["latency_ms"],
        "direct_error": direct.get("error"),
        "proxy_error": proxy.get("error"),
    }

def _paged_response(mode: Mode, rows_sql: str, rows_params: tuple, count_sql: str, count_params: tuple, app_user: str, page: int, page_size: int):
    """Run a paginated read query and matching count query for SecureShop tables.

    The result shape still matches QueryResult, but includes total/page metadata
    so the React UI can show tables, filters, and exact row counts.
    """
    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 500))
    offset = (safe_page - 1) * safe_page_size

    rows = run_query_captured(mode, rows_sql, (*rows_params, safe_page_size, offset), app_user=persona_or_default(app_user))
    total = run_query_captured(mode, count_sql, count_params, app_user=persona_or_default(app_user))
    total_count = 0
    if total.get("ok") and total.get("rows"):
        total_count = int(total["rows"][0].get("count") or 0)

    rows["total"] = total_count
    rows["page"] = safe_page
    rows["page_size"] = safe_page_size
    rows["total_pages"] = max(1, (total_count + safe_page_size - 1) // safe_page_size)
    return rows

@app.get("/api/products")
def products(
    mode: Mode = "proxy",
    app_user: str = "web_app",
    category: str | None = None,
    search: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    page: int = 1,
    page_size: int = 25,
):
    clauses = []
    params: list = []
    if category:
        clauses.append("category = %s")
        params.append(category)
    if search:
        clauses.append("(LOWER(name) LIKE LOWER(%s) OR LOWER(category) LIKE LOWER(%s) OR LOWER(COALESCE(supplier,'')) LIKE LOWER(%s))")
        needle = f"%{search}%"
        params.extend([needle, needle, needle])
    if min_price is not None:
        clauses.append("price >= %s")
        params.append(min_price)
    if max_price is not None:
        clauses.append("price <= %s")
        params.append(max_price)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return _paged_response(
        mode,
        f"""
        SELECT product_id, name, category, price, stock_quantity, supplier, created_at
        FROM products
        {where}
        ORDER BY product_id
        LIMIT %s OFFSET %s
        """,
        tuple(params),
        f"SELECT COUNT(*) AS count FROM products {where}",
        tuple(params),
        app_user,
        page,
        page_size,
    )

@app.get("/api/customers")
def customers(
    mode: Mode = "proxy",
    app_user: str = "web_app",
    city: str | None = None,
    segment: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
):
    clauses = []
    params: list = []
    if city:
        clauses.append("city = %s")
        params.append(city)
    if segment:
        clauses.append("segment = %s")
        params.append(segment)
    if search:
        clauses.append("(LOWER(full_name) LIKE LOWER(%s) OR LOWER(email) LIKE LOWER(%s) OR LOWER(city) LIKE LOWER(%s))")
        needle = f"%{search}%"
        params.extend([needle, needle, needle])

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return _paged_response(
        mode,
        f"""
        SELECT customer_id, full_name, email, phone, city, segment, created_at
        FROM customers
        {where}
        ORDER BY customer_id
        LIMIT %s OFFSET %s
        """,
        tuple(params),
        f"SELECT COUNT(*) AS count FROM customers {where}",
        tuple(params),
        app_user,
        page,
        page_size,
    )

@app.get("/api/orders")
def orders(
    mode: Mode = "proxy",
    app_user: str = "web_app",
    status: str | None = None,
    city: str | None = None,
    page: int = 1,
    page_size: int = 25,
):
    clauses = []
    params: list = []
    if status:
        clauses.append("o.status = %s")
        params.append(status)
    if city:
        clauses.append("c.city = %s")
        params.append(city)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return _paged_response(
        mode,
        f"""
        SELECT o.order_id, c.full_name AS customer, c.city, p.name AS product,
               p.category, o.quantity, o.order_total, o.status, o.created_at
        FROM orders o
        LEFT JOIN customers c ON c.customer_id = o.customer_id
        LEFT JOIN products p ON p.product_id = o.product_id
        {where}
        ORDER BY o.created_at DESC, o.order_id DESC
        LIMIT %s OFFSET %s
        """,
        tuple(params),
        f"""
        SELECT COUNT(*) AS count
        FROM orders o
        LEFT JOIN customers c ON c.customer_id = o.customer_id
        {where}
        """,
        tuple(params),
        app_user,
        page,
        page_size,
    )

@app.get("/api/employees")
def employees(mode: Mode = "proxy", app_user: str = "web_app"):
    return run_query_captured(mode, "SELECT employee_id, full_name, department, email FROM employees ORDER BY employee_id LIMIT 30", app_user=persona_or_default(app_user))

@app.get("/api/salary-records")
def salary_records(mode: Mode = "proxy", app_user: str = "finance_user"):
    return run_query_captured(mode, """
        SELECT s.salary_id, e.full_name AS employee, e.department,
               s.monthly_salary, s.bonus, s.created_at AS updated_at
        FROM salary_records s
        LEFT JOIN employees e ON e.employee_id = s.employee_id
        ORDER BY s.salary_id LIMIT 30
    """, app_user=persona_or_default(app_user))

@app.get("/api/summary")
def summary(mode: Mode = "proxy", app_user: str = "web_app"):
    product_count = run_query_captured(mode, "SELECT COUNT(*) AS count FROM products", app_user=persona_or_default(app_user))
    customer_count = run_query_captured(mode, "SELECT COUNT(*) AS count FROM customers", app_user=persona_or_default(app_user))
    order_count = run_query_captured(mode, "SELECT COUNT(*) AS count FROM orders", app_user=persona_or_default(app_user))
    employee_count = run_query_captured(mode, "SELECT COUNT(*) AS count FROM employees", app_user=persona_or_default(app_user))
    revenue = run_query_captured(mode, "SELECT COALESCE(SUM(order_total),0) AS total_revenue FROM orders", app_user=persona_or_default(app_user))
    def val(result, key, fallback=0):
        return result["rows"][0].get(key, fallback) if result.get("ok") and result.get("rows") else fallback
    return {
        "mode": mode,
        "ok": all(r.get("ok") for r in [product_count, customer_count, order_count, employee_count, revenue]),
        "products": val(product_count, "count"),
        "customers": val(customer_count, "count"),
        "orders": val(order_count, "count"),
        "employees": val(employee_count, "count"),
        "total_revenue": str(val(revenue, "total_revenue", "0")),
    }


@app.get("/api/analytics")
def analytics(mode: Mode = "proxy", app_user: str = "reporting_bot"):
    """Return visual analytics for the SecureShop frontend dashboard.

    These are ordinary SQL reads so, in proxy mode, SQLWatcher can still observe
    and classify the traffic generated by dashboard visualizations.
    """
    persona = persona_or_default(app_user)

    def rows(sql: str, params: tuple = ()):
        result = run_query_captured(mode, sql, params, app_user=persona)
        return result.get("rows", []) if result.get("ok") else []

    summary_rows = rows("""
        SELECT
          (SELECT COUNT(*) FROM products) AS products,
          (SELECT COUNT(*) FROM customers) AS customers,
          (SELECT COUNT(*) FROM orders) AS orders,
          (SELECT COUNT(*) FROM employees) AS employees,
          (SELECT COALESCE(SUM(order_total),0) FROM orders) AS total_revenue
    """)

    return {
        "mode": mode,
        "summary": summary_rows[0] if summary_rows else {},
        "sales_by_day": rows("""
            SELECT TO_CHAR(DATE(created_at), 'MM-DD') AS day,
                   COUNT(*) AS orders,
                   ROUND(COALESCE(SUM(order_total),0), 2) AS revenue
            FROM orders
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) DESC
            LIMIT 14
        """)[::-1],
        "category_revenue": rows("""
            SELECT p.category,
                   COUNT(*) AS orders,
                   ROUND(COALESCE(SUM(o.order_total),0), 2) AS revenue
            FROM orders o
            JOIN products p ON p.product_id = o.product_id
            GROUP BY p.category
            ORDER BY revenue DESC
            LIMIT 10
        """),
        "city_customers": rows("""
            SELECT city, COUNT(*) AS customers
            FROM customers
            GROUP BY city
            ORDER BY customers DESC
            LIMIT 10
        """),
        "status_distribution": rows("""
            SELECT status, COUNT(*) AS orders
            FROM orders
            GROUP BY status
            ORDER BY orders DESC
        """),
        "top_products": rows("""
            SELECT p.name,
                   p.category,
                   SUM(o.quantity) AS units,
                   ROUND(COALESCE(SUM(o.order_total),0), 2) AS revenue
            FROM orders o
            JOIN products p ON p.product_id = o.product_id
            GROUP BY p.name, p.category
            ORDER BY revenue DESC
            LIMIT 8
        """),
        "salary_by_department": rows("""
            SELECT e.department,
                   COUNT(*) AS employees,
                   ROUND(AVG(s.monthly_salary), 2) AS avg_salary
            FROM salary_records s
            JOIN employees e ON e.employee_id = s.employee_id
            GROUP BY e.department
            ORDER BY avg_salary DESC
            LIMIT 8
        """),
    }

@app.post("/api/manual-query")
def manual_query(payload: ManualQueryRequest):
    """Execute manual SQL in the controlled SecureShop demo environment.

    This endpoint intentionally does not restrict query type because the final
    project demo is performed against a controlled demo database. In proxy mode,
    SQLWatcher still makes the security decision and can block dangerous queries
    before they reach the protected database.
    """
    sql = payload.sql.strip()
    return run_query_captured(payload.mode, sql, app_user=persona_or_default(payload.app_user))


def _avg_number(items: list[dict], key: str) -> float:
    values = [float(item.get(key) or 0) for item in items]
    return round(sum(values) / len(values), 3) if values else 0.0

def run_benchmark_comparison(requests: int, concurrency: int, repeats: int = 5, profile: str = "mixed_business") -> dict:
    """Run Direct-vs-Proxy benchmark multiple times and return averages.

    A single benchmark run can be noisy because local Docker, Neon, and proxy
    connections vary. Running 4-5 trials and averaging gives a more defensible
    comparison for the final demo.
    """
    import time

    safe_repeats = max(1, min(int(repeats), 10))
    runs: list[dict] = []

    def safe_benchmark(mode: str) -> dict:
        started = time.perf_counter()
        try:
            result = run_benchmark(mode, requests, concurrency, profile)
            result.setdefault("errors", 0)
            result.setdefault("actions", {})
            return result
        except Exception as exc:
            duration = time.perf_counter() - started
            return {
                "mode": mode,
                "profile": profile,
                "total_requests": int(requests),
                "requested": int(requests),
                "successful_requests": 0,
                "failed_requests": int(requests),
                "blocked_requests": 0,
                "flagged_requests": 0,
                "duration_sec": round(duration, 3),
                "throughput_qps": 0,
                "avg_latency_ms": 0,
                "median_latency_ms": 0,
                "p95_latency_ms": 0,
                "p99_latency_ms": 0,
                "min_latency_ms": 0,
                "max_latency_ms": 0,
                "actions": {"ERROR": int(requests)},
                "errors": int(requests),
                "error": str(exc),
            }

    for index in range(1, safe_repeats + 1):
        direct = safe_benchmark("direct")
        proxy = safe_benchmark("proxy")

        direct_qps = float(direct.get("throughput_qps") or 0)
        proxy_qps = float(proxy.get("throughput_qps") or 0)
        comparison = {
            "added_avg_latency_ms": round(float(proxy.get("avg_latency_ms") or 0) - float(direct.get("avg_latency_ms") or 0), 3),
            "added_p95_latency_ms": round(float(proxy.get("p95_latency_ms") or 0) - float(direct.get("p95_latency_ms") or 0), 3),
            "throughput_reduction_percent": round(((direct_qps - proxy_qps) / direct_qps) * 100, 3) if direct_qps else 0,
        }
        runs.append({"run": index, "direct": direct, "proxy": proxy, "comparison": comparison})

    direct_runs = [item["direct"] for item in runs]
    proxy_runs = [item["proxy"] for item in runs]
    comparison_runs = [item["comparison"] for item in runs]

    direct_average = {
        "mode": "direct",
        "total_requests": int(sum(int(item.get("total_requests") or 0) for item in direct_runs)),
        "requested": int(requests),
        "concurrency": int(concurrency),
        "successful_requests": int(sum(int(item.get("successful_requests") or 0) for item in direct_runs)),
        "failed_requests": int(sum(int(item.get("failed_requests") if item.get("failed_requests") is not None else item.get("errors") or 0) for item in direct_runs)),
        "blocked_requests": int(sum(int(item.get("blocked_requests") or 0) for item in direct_runs)),
        "flagged_requests": int(sum(int(item.get("flagged_requests") or 0) for item in direct_runs)),
        "throughput_qps": _avg_number(direct_runs, "throughput_qps"),
        "avg_latency_ms": _avg_number(direct_runs, "avg_latency_ms"),
        "median_latency_ms": _avg_number(direct_runs, "median_latency_ms"),
        "p95_latency_ms": _avg_number(direct_runs, "p95_latency_ms"),
        "p99_latency_ms": _avg_number(direct_runs, "p99_latency_ms"),
        "errors": int(sum(int(item.get("errors") or 0) for item in direct_runs)),
    }
    proxy_average = {
        "mode": "proxy",
        "total_requests": int(sum(int(item.get("total_requests") or 0) for item in proxy_runs)),
        "requested": int(requests),
        "concurrency": int(concurrency),
        "successful_requests": int(sum(int(item.get("successful_requests") or 0) for item in proxy_runs)),
        "failed_requests": int(sum(int(item.get("failed_requests") if item.get("failed_requests") is not None else item.get("errors") or 0) for item in proxy_runs)),
        "blocked_requests": int(sum(int(item.get("blocked_requests") or 0) for item in proxy_runs)),
        "flagged_requests": int(sum(int(item.get("flagged_requests") or 0) for item in proxy_runs)),
        "throughput_qps": _avg_number(proxy_runs, "throughput_qps"),
        "avg_latency_ms": _avg_number(proxy_runs, "avg_latency_ms"),
        "median_latency_ms": _avg_number(proxy_runs, "median_latency_ms"),
        "p95_latency_ms": _avg_number(proxy_runs, "p95_latency_ms"),
        "p99_latency_ms": _avg_number(proxy_runs, "p99_latency_ms"),
        "errors": int(sum(int(item.get("errors") or 0) for item in proxy_runs)),
    }

    average_comparison = {
        "added_avg_latency_ms": _avg_number(comparison_runs, "added_avg_latency_ms"),
        "added_p95_latency_ms": _avg_number(comparison_runs, "added_p95_latency_ms"),
        "throughput_reduction_percent": _avg_number(comparison_runs, "throughput_reduction_percent"),
    }

    return {
        "direct": direct_average,
        "proxy": proxy_average,
        "comparison": average_comparison,
        "runs": runs,
        "repeats": safe_repeats,
        "requests": int(requests),
        "concurrency": int(concurrency),
        "profile": profile,
        "requested_per_path": int(requests) * safe_repeats,
        "total_requests_sent": int(sum(int(item["direct"].get("total_requests") or 0) + int(item["proxy"].get("total_requests") or 0) for item in runs)),
        "status": "completed_with_errors" if (direct_average["errors"] or proxy_average["errors"]) else "completed",
    }

@app.post("/api/benchmark")
def benchmark(payload: BenchmarkComparisonRequest):
    return run_benchmark_comparison(payload.requests, payload.concurrency, payload.repeats, payload.profile)

@app.post("/api/compare")
def compare(payload: BenchmarkComparisonRequest):
    """Backward-compatible alias for older SecureShop frontend builds."""
    return run_benchmark_comparison(payload.requests, payload.concurrency, payload.repeats, payload.profile)

def get_security_scenarios():
    return {
        "normal_product_lookup": {
            "id": "normal_product_lookup",
            "category": "normal",
            "app_user": "web_app",
            "title": "Normal Product Lookup",
            "sql": "SELECT product_id, name, category, price FROM products WHERE product_id = %s",
            "params": (1,),
            "expected_proxy": "ALLOW",
            "description": "Normal product lookup from the storefront."
        },
        "normal_finance_summary": {
            "id": "normal_finance_summary",
            "category": "normal",
            "app_user": "finance_user",
            "title": "Finance Revenue Summary",
            "sql": "SELECT SUM(order_total) AS revenue FROM orders",
            "params": (),
            "expected_proxy": "ALLOW",
            "description": "Normal finance summary query."
        },
        "normal_reporting_aggregate": {
            "id": "normal_reporting_aggregate",
            "category": "normal",
            "app_user": "reporting_bot",
            "title": "Reporting Aggregation",
            "sql": "SELECT category, COUNT(*) AS total FROM products GROUP BY category",
            "params": (),
            "expected_proxy": "ALLOW",
            "description": "Normal scheduled reporting aggregation."
        },
        "mass_customer_access": {
            "id": "mass_customer_access",
            "category": "anomalies",
            "app_user": "web_app",
            "title": "Mass Customer Access",
            "sql": "SELECT * FROM customers",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Broad customer table access by the storefront user."
        },
        "sensitive_salary_access": {
            "id": "sensitive_salary_access",
            "category": "anomalies",
            "app_user": "web_app",
            "title": "Unexpected Salary Access",
            "sql": "SELECT * FROM salary_records",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "The storefront user tries to access payroll data outside its baseline."
        },
        "finance_products_anomaly": {
            "id": "finance_products_anomaly",
            "category": "anomalies",
            "app_user": "finance_user",
            "title": "Finance User Product Dump",
            "sql": "SELECT * FROM products",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Finance user performs an unusual broad product-table query."
        },
        "finance_customer_email_dump": {
            "id": "finance_customer_email_dump",
            "category": "anomalies",
            "app_user": "finance_user",
            "title": "Finance Customer Email Dump",
            "sql": "SELECT customer_id, full_name, email, phone FROM customers",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Finance persona suddenly pulls broad customer contact data outside its normal baseline."
        },
        "reporting_salary_access": {
            "id": "reporting_salary_access",
            "category": "anomalies",
            "app_user": "reporting_bot",
            "title": "Reporting Bot Salary Access",
            "sql": "SELECT employee_id, monthly_salary, bonus FROM salary_records",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Reporting bot accesses payroll rows instead of aggregate reporting outputs."
        },
        "admin_full_salary_export": {
            "id": "admin_full_salary_export",
            "category": "anomalies",
            "app_user": "admin_user",
            "title": "Admin Full Salary Export",
            "sql": "SELECT * FROM salary_records",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Admin performs a broad sensitive payroll export for anomaly visibility."
        },
        "web_app_employee_directory_dump": {
            "id": "web_app_employee_directory_dump",
            "category": "anomalies",
            "app_user": "web_app",
            "title": "Web App Employee Directory Dump",
            "sql": "SELECT employee_id, full_name, department, email FROM employees",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Customer-facing web application unexpectedly accesses employee directory data."
        },
        "schema_enumeration": {
            "id": "schema_enumeration",
            "category": "attacks",
            "app_user": "admin_user",
            "title": "Schema Enumeration",
            "sql": "SELECT * FROM information_schema.tables WHERE table_schema = %s",
            "params": ("public",),
            "expected_proxy": "BLOCK",
            "description": "Metadata/catalog enumeration."
        },
        "boolean_tautology": {
            "id": "boolean_tautology",
            "category": "attacks",
            "app_user": "web_app",
            "title": "Boolean Tautology",
            "sql": "SELECT * FROM customers WHERE '1' = '1'",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "Tautology-like broad query."
        },
        "union_sqli": {
            "id": "union_sqli",
            "category": "attacks",
            "app_user": "web_app",
            "title": "UNION SQL Injection",
            "sql": "SELECT product_id, name FROM products UNION SELECT customer_id, email FROM customers",
            "params": (),
            "expected_proxy": "BLOCK",
            "description": "UNION SELECT pattern used to combine product and customer data."
        },
        "stacked_query": {
            "id": "stacked_query",
            "category": "attacks",
            "app_user": "web_app",
            "title": "Stacked Query",
            "sql": "SELECT product_id, name FROM products; SELECT * FROM customers;",
            "params": (),
            "expected_proxy": "BLOCK",
            "description": "Multiple SQL statements in one request."
        },
        "time_based_sqli": {
            "id": "time_based_sqli",
            "category": "attacks",
            "app_user": "web_app",
            "title": "Time-Based SQLi",
            "sql": "SELECT pg_sleep(0.1)",
            "params": (),
            "expected_proxy": "BLOCK",
            "description": "Time-delay function often used for blind SQL injection."
        },
        "write_operation": {
            "id": "write_operation",
            "category": "anomalies",
            "app_user": "admin_user",
            "title": "Write Operation",
            "sql": "UPDATE products SET price = price WHERE product_id = 1",
            "params": (),
            "expected_proxy": "FLAG",
            "description": "A non-destructive write operation for analyst visibility."
        },
        "delete_without_where": {
            "id": "delete_without_where",
            "category": "attacks",
            "app_user": "admin_user",
            "title": "Delete Without WHERE",
            "sql": "DELETE FROM customers",
            "params": (),
            "expected_proxy": "BLOCK",
            "description": "Destructive DELETE statement without a WHERE clause."
        },
        "dangerous_ddl": {
            "id": "dangerous_ddl",
            "category": "attacks",
            "app_user": "admin_user",
            "title": "Dangerous DDL",
            "sql": "DROP TABLE users",
            "params": (),
            "expected_proxy": "BLOCK",
            "description": "Dangerous DDL operation."
        },
    }

@app.post("/api/security-test")
def security_test(payload: SecurityScenarioRequest):
    scenarios = get_security_scenarios()
    if payload.scenario not in scenarios:
        raise HTTPException(status_code=404, detail="Unknown security scenario")
    s = scenarios[payload.scenario]
    app_user = persona_or_default(payload.app_user or s.get("app_user"))
    result = run_query_captured(payload.mode, s["sql"], s["params"], app_user=app_user)
    return {
        "scenario": payload.scenario,
        "category": s["category"],
        "title": s["title"],
        "description": s["description"],
        "expected_proxy": s["expected_proxy"],
        "sql": s["sql"],
        "mode": payload.mode,
        "app_user": app_user,
        "result": result,
    }
