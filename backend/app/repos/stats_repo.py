from __future__ import annotations

from typing import Any

import asyncpg

from app.models.records import PerformanceRecord, StatsRecord, TimelineBinRecord
from app.repos._mapping import as_float, as_int


class StatsRepo:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    async def get_dashboard_stats(self) -> StatsRecord:
        """Return dashboard aggregate counters and anomaly summary."""
        row = await self.conn.fetchrow(
            """
            SELECT
                COUNT(*)::INT AS total_queries,
                COUNT(*) FILTER (WHERE action_taken = 'ALLOW')::INT AS allowed_queries,
                COUNT(*) FILTER (WHERE action_taken = 'FLAG')::INT AS flagged_queries,
                COUNT(*) FILTER (WHERE action_taken = 'BLOCK')::INT AS blocked_queries,
                COALESCE(ROUND(AVG(risk_score), 2), 0)::FLOAT AS average_risk_score
            FROM query_logs
            WHERE timestamp >= NOW() - INTERVAL '30 days'
            """
        )
        alert_row = await self.conn.fetchrow(
            """
            SELECT
                COUNT(*)::INT AS open_alerts,
                COUNT(*) FILTER (WHERE severity = 'CRITICAL')::INT AS critical_alerts,
                COUNT(*) FILTER (WHERE severity = 'HIGH')::INT AS high_alerts,
                COUNT(*) FILTER (WHERE severity = 'MEDIUM')::INT AS medium_alerts,
                COUNT(*) FILTER (WHERE severity = 'LOW')::INT AS low_alerts
            FROM alerts
            WHERE status = 'OPEN'
            """
        )
        anomaly_row = await self.conn.fetchrow(
            """
            SELECT COUNT(*)::INT AS anomaly_scores,
                   COALESCE(MAX(anomaly_score), 0)::INT AS max_anomaly_score
            FROM anomaly_scores
            WHERE created_at >= NOW() - INTERVAL '30 days'
            """
        )
        return StatsRecord(
            total_queries=as_int(row["total_queries"]),
            allowed_queries=as_int(row["allowed_queries"]),
            flagged_queries=as_int(row["flagged_queries"]),
            blocked_queries=as_int(row["blocked_queries"]),
            critical_alerts=as_int(alert_row["critical_alerts"]),
            high_alerts=as_int(alert_row["high_alerts"]),
            average_risk_score=as_float(row["average_risk_score"]),
            open_alerts=as_int(alert_row["open_alerts"]),
            anomaly_scores=as_int(anomaly_row["anomaly_scores"]),
            max_anomaly_score=as_int(anomaly_row["max_anomaly_score"]),
            medium_alerts=as_int(alert_row["medium_alerts"]),
            low_alerts=as_int(alert_row["low_alerts"]),
        )

    async def get_timeline(self, hours: int = 24) -> list[TimelineBinRecord]:
        """Return hourly action-count bins for recent query activity."""
        rows = await self.conn.fetch(
            """
            SELECT
                DATE_TRUNC('hour', timestamp) AS hour,
                COUNT(*)::INT AS total,
                COUNT(*) FILTER (WHERE action_taken = 'ALLOW')::INT AS allowed,
                COUNT(*) FILTER (WHERE action_taken = 'FLAG')::INT AS flagged,
                COUNT(*) FILTER (WHERE action_taken = 'BLOCK')::INT AS blocked,
                COALESCE(ROUND(AVG(risk_score), 2), 0)::FLOAT AS average_risk
            FROM query_logs
            WHERE timestamp >= NOW() - ($1::INT * INTERVAL '1 hour')
            GROUP BY DATE_TRUNC('hour', timestamp)
            ORDER BY hour ASC
            """,
            max(1, int(hours)),
        )
        return [
            TimelineBinRecord(
                hour=row["hour"],
                total=as_int(row["total"]),
                allowed=as_int(row["allowed"]),
                flagged=as_int(row["flagged"]),
                blocked=as_int(row["blocked"]),
                average_risk=as_float(row["average_risk"]),
            )
            for row in rows
        ]

    async def get_performance_summary(self) -> PerformanceRecord | None:
        """Return latency percentiles and action counts for all recorded query logs."""
        row = await self.conn.fetchrow(
            """
            SELECT
                COUNT(*)::INT AS total_queries,
                COUNT(total_ms)::INT AS timed_samples,
                COALESCE(ROUND(AVG(total_ms), 3), 0)::FLOAT AS avg_total_ms,
                COALESCE(ROUND(AVG(detection_ms), 3), 0)::FLOAT AS avg_detection_ms,
                COALESCE(ROUND(AVG(anomaly_ms), 3), 0)::FLOAT AS avg_anomaly_ms,
                COALESCE(ROUND(AVG(execution_ms), 3), 0)::FLOAT AS avg_execution_ms,
                COALESCE(ROUND(MIN(total_ms), 3), 0)::FLOAT AS min_total_ms,
                COALESCE(ROUND(MAX(total_ms), 3), 0)::FLOAT AS max_total_ms,
                COALESCE(ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY total_ms) FILTER (WHERE total_ms IS NOT NULL))::NUMERIC, 3), 0)::FLOAT AS p50_total_ms,
                COALESCE(ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) FILTER (WHERE total_ms IS NOT NULL))::NUMERIC, 3), 0)::FLOAT AS p95_total_ms,
                COALESCE(ROUND((percentile_cont(0.99) WITHIN GROUP (ORDER BY total_ms) FILTER (WHERE total_ms IS NOT NULL))::NUMERIC, 3), 0)::FLOAT AS p99_total_ms,
                COUNT(*) FILTER (WHERE action_taken = 'ALLOW')::INT AS allow_count,
                COUNT(*) FILTER (WHERE action_taken = 'FLAG')::INT AS flag_count,
                COUNT(*) FILTER (WHERE action_taken = 'BLOCK')::INT AS block_count,
                COUNT(*) FILTER (WHERE action_taken = 'ERROR')::INT AS error_count
            FROM query_logs
            WHERE timestamp >= NOW() - INTERVAL '30 days'
            """
        )
        if row is None:
            return None
        total_queries = as_int(row["total_queries"])
        return PerformanceRecord(
            total_samples=total_queries,
            total_queries=total_queries,
            timed_samples=as_int(row["timed_samples"]),
            avg_total_ms=as_float(row["avg_total_ms"]),
            avg_detection_ms=as_float(row["avg_detection_ms"]),
            avg_anomaly_ms=as_float(row["avg_anomaly_ms"]),
            avg_execution_ms=as_float(row["avg_execution_ms"]),
            min_total_ms=as_float(row["min_total_ms"]),
            max_total_ms=as_float(row["max_total_ms"]),
            p50_total_ms=as_float(row["p50_total_ms"]),
            p95_total_ms=as_float(row["p95_total_ms"]),
            p99_total_ms=as_float(row["p99_total_ms"]),
            allow_count=as_int(row["allow_count"]),
            flag_count=as_int(row["flag_count"]),
            block_count=as_int(row["block_count"]),
            error_count=as_int(row["error_count"]),
        )

    async def get_performance_timeseries(self, hours: int = 24) -> list[dict[str, Any]]:
        """Return hourly performance bins as dictionaries for chart endpoints."""
        rows = await self.conn.fetch(
            """
            SELECT
                DATE_TRUNC('hour', timestamp) AS hour,
                COUNT(*)::INT AS samples,
                COALESCE(ROUND(AVG(total_ms), 3), 0)::FLOAT AS avg_total_ms,
                COALESCE(ROUND(AVG(detection_ms), 3), 0)::FLOAT AS avg_detection_ms,
                COALESCE(ROUND(AVG(anomaly_ms), 3), 0)::FLOAT AS avg_anomaly_ms,
                COALESCE(ROUND(AVG(execution_ms), 3), 0)::FLOAT AS avg_execution_ms
            FROM query_logs
            WHERE timestamp >= NOW() - ($1::INT * INTERVAL '1 hour')
            GROUP BY DATE_TRUNC('hour', timestamp)
            ORDER BY hour ASC
            """,
            max(1, int(hours)),
        )
        return [
            {
                "hour": row["hour"],
                "samples": as_int(row["samples"]),
                "avg_total_ms": as_float(row["avg_total_ms"]),
                "avg_detection_ms": as_float(row["avg_detection_ms"]),
                "avg_anomaly_ms": as_float(row["avg_anomaly_ms"]),
                "avg_execution_ms": as_float(row["avg_execution_ms"]),
            }
            for row in rows
        ]

    async def get_top_attackers(self, limit: int = 5) -> list[dict[str, Any]]:
        """Return top client IPs by blocked/flagged query volume."""
        rows = await self.conn.fetch(
            """
            SELECT
                COALESCE(client_ip, 'unknown') AS client_ip,
                COUNT(*)::INT AS total_queries,
                COUNT(*) FILTER (WHERE action_taken = 'BLOCK')::INT AS blocked_queries,
                MAX(risk_score)::INT AS highest_risk,
                MAX(severity) AS highest_severity
            FROM query_logs
            WHERE action_taken IN ('BLOCK', 'FLAG')
              AND timestamp >= NOW() - INTERVAL '30 days'
            GROUP BY COALESCE(client_ip, 'unknown')
            ORDER BY blocked_queries DESC, total_queries DESC
            LIMIT $1
            """,
            max(1, min(int(limit), 100)),
        )
        return [
            {
                "client_ip": row["client_ip"],
                "total_queries": as_int(row["total_queries"]),
                "blocked_queries": as_int(row["blocked_queries"]),
                "highest_risk": as_int(row["highest_risk"]),
                "highest_severity": row["highest_severity"],
            }
            for row in rows
        ]
