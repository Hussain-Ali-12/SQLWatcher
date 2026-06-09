INSERT INTO rules (rule_name, description, severity, action, enabled, rule_type, match_pattern, match_target, risk_score, is_system)
VALUES
('UNION_SQLI', 'Detects UNION SELECT based SQL injection attempts.', 'HIGH', 'BLOCK', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 85, TRUE),
('STACKED_QUERY', 'Detects semicolon-based stacked query attempts.', 'CRITICAL', 'BLOCK', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 95, TRUE),
('COMMENT_ABUSE', 'Detects SQL comment markers commonly used to hide injected payloads.', 'MEDIUM', 'FLAG', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 60, TRUE),
('BOOLEAN_TAUTOLOGY', 'Detects Boolean tautology patterns such as AND 1=1 or OR a=a.', 'MEDIUM', 'FLAG', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 65, TRUE),
('TIME_BASED_SQLI', 'Detects sleep or delay based SQL injection attempts.', 'HIGH', 'BLOCK', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 85, TRUE),
('SCHEMA_ENUMERATION', 'Detects access to information_schema or pg_catalog.', 'HIGH', 'BLOCK', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 80, TRUE),
('DANGEROUS_DDL', 'Detects DROP, ALTER, and TRUNCATE operations.', 'CRITICAL', 'BLOCK', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 95, TRUE),
('DELETE_WITHOUT_WHERE', 'Detects destructive DELETE statements without a WHERE clause.', 'HIGH', 'BLOCK', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 90, TRUE),
('WRITE_OPERATION', 'Flags INSERT, UPDATE, and DELETE statements for analyst visibility.', 'LOW', 'FLAG', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 35, TRUE),
('MASS_EXFILTRATION', 'Detects unrestricted SELECT * on sensitive tables.', 'MEDIUM', 'FLAG', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 55, TRUE),
('OFF_HOURS_SENSITIVE_ACCESS', 'Flags sensitive HR or salary table access outside normal hours.', 'HIGH', 'FLAG', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 70, TRUE),
('ANOMALY_BASELINE', 'Flags queries that significantly deviate from the learned per-user baseline.', 'MEDIUM', 'FLAG', TRUE, 'BUILTIN', NULL, 'RAW_SQL', 70, TRUE)
ON CONFLICT (rule_name) DO UPDATE
SET description = EXCLUDED.description,
    severity = EXCLUDED.severity,
    action = EXCLUDED.action,
    rule_type = 'BUILTIN',
    match_pattern = NULL,
    match_target = 'RAW_SQL',
    risk_score = EXCLUDED.risk_score,
    is_system = TRUE,
    updated_at = NOW();
