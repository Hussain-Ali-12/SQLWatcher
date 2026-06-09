-- Production performance indexes for high-volume proxy telemetry and dashboard reads.
CREATE INDEX IF NOT EXISTS idx_query_logs_action_timestamp
  ON query_logs(action_taken, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_query_logs_severity_timestamp
  ON query_logs(severity, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_query_logs_db_user_timestamp
  ON query_logs(db_user, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_scores_query_id_created
  ON anomaly_scores(query_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_status_created_at
  ON alerts(status, created_at DESC);
