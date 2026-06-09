from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import require_roles
from app.dependencies.db import Repos, get_repos
from app.services.audit_service import AuditService
from app.services.realtime_sync import force_realtime_sync

router = APIRouter(prefix="/api", tags=["Admin"])

RESETTABLE_SQLWATCHER_TABLES = (
    "notification_events",
    "analyst_feedback",
    "anomaly_scores",
    "query_features",
    "alerts",
    "query_logs",
    "baseline_profiles",
    "performance_samples",
)
ALLOWED_TABLES = frozenset(RESETTABLE_SQLWATCHER_TABLES + ("audit_events", "auth_sessions"))


async def _table_counts(conn, table_names: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in table_names:
        if table not in ALLOWED_TABLES:
            raise HTTPException(status_code=400, detail=f"Table {table!r} is not in the allowed reset list.")
        row = await conn.fetchrow(f'SELECT COUNT(*)::INT AS count FROM "{table}"')
        counts[table] = int(row["count"] if row else 0)
    return counts


@router.post("/demo/reset")
async def reset_demo(current_user: dict = Depends(require_roles("admin")), repos: Repos = Depends(get_repos)):
    conn = repos.query_log.conn
    tables = ["notification_events", "analyst_feedback", "anomaly_scores", "query_features", "alerts", "query_logs", "audit_events"]
    before = await _table_counts(conn, tables)
    await conn.execute('TRUNCATE notification_events, analyst_feedback, anomaly_scores, query_features, alerts, query_logs, audit_events RESTART IDENTITY CASCADE')
    await repos.rule.reset_trigger_counts()
    after = await _table_counts(conn, tables)
    await AuditService(repos.audit).log("DEMO_RESET", "Demo data was reset.", actor=current_user, entity_type="demo", metadata={"before_counts": before, "after_counts": after})
    await force_realtime_sync("demo_reset", message="Demo data reset completed.", actor=current_user.get("username", current_user.get("email")))
    return {"status": "reset_complete"}


@router.post("/demo/seed-normal-traffic")
async def seed_normal_traffic(current_user: dict = Depends(require_roles("admin", "analyst")), repos: Repos = Depends(get_repos)):
    traffic = {
        "web_app": [
            "SELECT product_id, name FROM products WHERE category='electronics'",
            "SELECT product_id, name FROM products WHERE category='stationery'",
            "SELECT product_id, name FROM products WHERE price > 100",
            "SELECT product_id, name FROM products WHERE product_id = 1",
            "SELECT product_id, name FROM products WHERE product_id = 2",
            "SELECT product_id, name FROM products WHERE category='electronics' LIMIT 5",
        ],
        "admin_user": [
            "SELECT user_id, username, role FROM users ORDER BY username LIMIT 20",
            "SELECT customer_id, full_name, city FROM customers ORDER BY customer_id LIMIT 20",
            "SELECT rule_name, severity, action FROM rules ORDER BY rule_name",
            "SELECT product_id, name, price FROM products ORDER BY product_id LIMIT 20",
            "SELECT customer_id, full_name FROM customers WHERE city='Islamabad'",
            "SELECT user_id, username FROM users WHERE role='admin'",
        ],
        "finance_user": [
            "SELECT employee_id, full_name, department FROM employees ORDER BY employee_id LIMIT 20",
            "SELECT salary_id, employee_id, monthly_salary FROM salary_records ORDER BY salary_id LIMIT 20",
            "SELECT order_id, order_total FROM orders ORDER BY created_at DESC LIMIT 20",
            "SELECT SUM(order_total) AS revenue FROM orders",
            "SELECT department, COUNT(*) FROM employees GROUP BY department",
            "SELECT employee_id, monthly_salary FROM salary_records WHERE monthly_salary > 100000 LIMIT 10",
        ],
        "reporting_bot": [
            "SELECT category, COUNT(*) FROM products GROUP BY category",
            "SELECT city, COUNT(*) FROM customers GROUP BY city",
            "SELECT DATE(created_at), COUNT(*) FROM orders GROUP BY DATE(created_at)",
            "SELECT product_id, SUM(quantity) FROM orders GROUP BY product_id LIMIT 20",
            "SELECT customer_id, SUM(order_total) FROM orders GROUP BY customer_id LIMIT 20",
            "SELECT COUNT(*) FROM products",
            "SELECT COUNT(*) FROM customers",
            "SELECT COUNT(*) FROM orders",
        ],
    }
    inserted = 0
    for db_user, queries in traffic.items():
        for sql in queries:
            await repos.query_log.insert(sql, db_user, "127.0.0.1", "ALLOW", "NONE", 0, "NONE", "Seeded normal baseline traffic.", "SELECT", sql)
            inserted += 1
    await AuditService(repos.audit).log("DEMO_SEED_TRAFFIC", "Normal baseline traffic was seeded for multiple database users.", actor=current_user, entity_type="query_logs", metadata={"count": inserted, "users": list(traffic.keys())})
    await force_realtime_sync("demo_seeded", message="Normal baseline traffic was seeded.", count=inserted, actor=current_user.get("username", current_user.get("email")))
    return {"status": "seeded", "count": inserted, "users": list(traffic.keys())}


class ResetSqlWatcherDataPayload:
    pass
