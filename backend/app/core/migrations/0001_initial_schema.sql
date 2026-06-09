-- Canonical schema. For incremental changes, add a migration in app/core/migrations/.

CREATE TABLE IF NOT EXISTS query_logs (
    query_id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    client_ip VARCHAR(64),
    db_user VARCHAR(128),
    raw_sql TEXT NOT NULL,
    normalized_sql TEXT,
    query_type VARCHAR(32),
    risk_score INTEGER DEFAULT 0,
    severity VARCHAR(32) DEFAULT 'NONE',
    detection_method VARCHAR(256),
    action_taken VARCHAR(32) NOT NULL,
    explanation TEXT,
    detection_ms NUMERIC DEFAULT 0,
    anomaly_ms NUMERIC DEFAULT 0,
    execution_ms NUMERIC DEFAULT 0,
    total_ms NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id SERIAL PRIMARY KEY,
    query_id INTEGER REFERENCES query_logs(query_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    severity VARCHAR(32) NOT NULL,
    status VARCHAR(32) DEFAULT 'OPEN',
    title VARCHAR(255),
    description TEXT,
    resolved_by VARCHAR(128),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rules (
    rule_id SERIAL PRIMARY KEY,
    rule_name VARCHAR(128) UNIQUE NOT NULL,
    description TEXT,
    severity VARCHAR(32) NOT NULL,
    action VARCHAR(32) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rule_type VARCHAR(32) DEFAULT 'BUILTIN',
    match_pattern TEXT,
    match_target VARCHAR(32) DEFAULT 'RAW_SQL',
    risk_score INTEGER DEFAULT 50,
    is_system BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensitive_tables (
    table_id SERIAL PRIMARY KEY,
    table_name VARCHAR(128) UNIQUE NOT NULL,
    sensitivity_label VARCHAR(64) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS baseline_profiles (
    profile_id SERIAL PRIMARY KEY,
    db_user VARCHAR(128),
    sample_count INTEGER DEFAULT 0,
    query_type_distribution JSONB DEFAULT '{}'::jsonb,
    common_tables TEXT[] DEFAULT ARRAY[]::TEXT[],
    avg_table_count NUMERIC DEFAULT 0,
    avg_where_conditions NUMERIC DEFAULT 0,
    avg_has_limit NUMERIC DEFAULT 0,
    avg_has_select_star NUMERIC DEFAULT 0,
    avg_sensitive_table_count NUMERIC DEFAULT 0,
    avg_risk_score NUMERIC DEFAULT 0,
    normal_hours INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    model_version VARCHAR(64) DEFAULT 'statistical-v1',
    ml_enabled BOOLEAN DEFAULT FALSE,
    ml_algorithm VARCHAR(64) DEFAULT 'IsolationForest',
    ml_model BYTEA,
    ml_feature_schema JSONB DEFAULT '{}'::jsonb,
    ml_training_error TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_features (
    feature_id SERIAL PRIMARY KEY,
    query_id INTEGER REFERENCES query_logs(query_id) ON DELETE CASCADE,
    db_user VARCHAR(128),
    query_type VARCHAR(32),
    table_names TEXT[],
    table_count INTEGER DEFAULT 0,
    sensitive_table_count INTEGER DEFAULT 0,
    has_select_star BOOLEAN DEFAULT FALSE,
    has_limit BOOLEAN DEFAULT FALSE,
    where_condition_count INTEGER DEFAULT 0,
    hour_of_day INTEGER,
    keyword_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_scores (
    anomaly_id SERIAL PRIMARY KEY,
    query_id INTEGER REFERENCES query_logs(query_id) ON DELETE CASCADE,
    db_user VARCHAR(128),
    anomaly_score INTEGER DEFAULT 0,
    anomaly_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
    baseline_available BOOLEAN DEFAULT FALSE,
    statistical_score INTEGER DEFAULT 0,
    ml_anomaly_score INTEGER DEFAULT 0,
    anomaly_category VARCHAR(64) DEFAULT 'NORMAL',
    baseline_maturity VARCHAR(64) DEFAULT 'UNKNOWN',
    anomaly_confidence VARCHAR(32) DEFAULT 'UNKNOWN',
    ml_model_available BOOLEAN DEFAULT FALSE,
    model_version VARCHAR(64) DEFAULT 'statistical-v1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyst_feedback (
    feedback_id SERIAL PRIMARY KEY,
    query_id INTEGER REFERENCES query_logs(query_id) ON DELETE CASCADE,
    anomaly_id INTEGER REFERENCES anomaly_scores(anomaly_id) ON DELETE SET NULL,
    analyst_name VARCHAR(128),
    feedback_type VARCHAR(64),
    notes TEXT,
    applied BOOLEAN DEFAULT FALSE,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash VARCHAR(128) PRIMARY KEY,
    user_id INTEGER REFERENCES app_users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_events (
    notification_id SERIAL PRIMARY KEY,
    alert_id INTEGER REFERENCES alerts(alert_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    severity VARCHAR(32),
    is_read BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    actor_email VARCHAR(255),
    actor_role VARCHAR(32),
    event_type VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64),
    entity_id VARCHAR(64),
    description TEXT,
    metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS deployment_config (
    config_key VARCHAR(128) PRIMARY KEY,
    config_value TEXT,
    is_secret BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_samples (
    sample_id SERIAL PRIMARY KEY,
    query_id INTEGER REFERENCES query_logs(query_id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    detection_ms NUMERIC DEFAULT 0,
    anomaly_ms NUMERIC DEFAULT 0,
    execution_ms NUMERIC DEFAULT 0,
    total_ms NUMERIC DEFAULT 0,
    action_taken VARCHAR(32),
    severity VARCHAR(32)
);

-- Compatibility upgrades for pre-migration databases.
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS normalized_sql TEXT;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS detection_ms NUMERIC DEFAULT 0;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS anomaly_ms NUMERIC DEFAULT 0;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS execution_ms NUMERIC DEFAULT 0;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS total_ms NUMERIC DEFAULT 0;

ALTER TABLE rules ADD COLUMN IF NOT EXISTS rule_type VARCHAR(32) DEFAULT 'BUILTIN';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS match_pattern TEXT;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS match_target VARCHAR(32) DEFAULT 'RAW_SQL';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 50;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT TRUE;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE rules
SET rule_type = COALESCE(rule_type, 'BUILTIN'),
    match_target = COALESCE(match_target, 'RAW_SQL'),
    risk_score = COALESCE(risk_score, 50),
    is_system = COALESCE(is_system, TRUE),
    updated_at = COALESCE(updated_at, NOW());

ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS query_type_distribution JSONB DEFAULT '{}'::jsonb;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS common_tables TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS avg_table_count NUMERIC DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS avg_where_conditions NUMERIC DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS avg_has_limit NUMERIC DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS avg_has_select_star NUMERIC DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS avg_sensitive_table_count NUMERIC DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS avg_risk_score NUMERIC DEFAULT 0;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS normal_hours INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS model_version VARCHAR(64) DEFAULT 'statistical-v1';
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS ml_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS ml_algorithm VARCHAR(64) DEFAULT 'IsolationForest';
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS ml_model BYTEA;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS ml_feature_schema JSONB DEFAULT '{}'::jsonb;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS ml_training_error TEXT;
ALTER TABLE baseline_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE baseline_profiles
SET sample_count = COALESCE(sample_count, 0),
    query_type_distribution = COALESCE(query_type_distribution, '{}'::jsonb),
    common_tables = COALESCE(common_tables, ARRAY[]::TEXT[]),
    avg_table_count = COALESCE(avg_table_count, 0),
    avg_where_conditions = COALESCE(avg_where_conditions, 0),
    avg_has_limit = COALESCE(avg_has_limit, 0),
    avg_has_select_star = COALESCE(avg_has_select_star, 0),
    avg_sensitive_table_count = COALESCE(avg_sensitive_table_count, 0),
    avg_risk_score = COALESCE(avg_risk_score, 0),
    normal_hours = COALESCE(normal_hours, ARRAY[]::INTEGER[]),
    model_version = COALESCE(model_version, 'statistical-v1'),
    ml_enabled = COALESCE(ml_enabled, FALSE),
    ml_algorithm = COALESCE(ml_algorithm, 'IsolationForest'),
    ml_feature_schema = COALESCE(ml_feature_schema, '{}'::jsonb),
    updated_at = COALESCE(updated_at, NOW());

ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS statistical_score INTEGER DEFAULT 0;
ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS ml_anomaly_score INTEGER DEFAULT 0;
ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS anomaly_category VARCHAR(64) DEFAULT 'NORMAL';
ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS baseline_maturity VARCHAR(64) DEFAULT 'UNKNOWN';
ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS anomaly_confidence VARCHAR(32) DEFAULT 'UNKNOWN';
ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS ml_model_available BOOLEAN DEFAULT FALSE;
ALTER TABLE anomaly_scores ADD COLUMN IF NOT EXISTS model_version VARCHAR(64) DEFAULT 'statistical-v1';

ALTER TABLE analyst_feedback ADD COLUMN IF NOT EXISTS anomaly_id INTEGER REFERENCES anomaly_scores(anomaly_id) ON DELETE SET NULL;
ALTER TABLE analyst_feedback ADD COLUMN IF NOT EXISTS applied BOOLEAN DEFAULT FALSE;
ALTER TABLE analyst_feedback ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username VARCHAR(80);
UPDATE app_users
SET username = SPLIT_PART(email, '@', 1)
WHERE username IS NULL OR username = '';
ALTER TABLE app_users ALTER COLUMN username SET NOT NULL;

DELETE FROM baseline_profiles bp
USING baseline_profiles older
WHERE bp.db_user = older.db_user
  AND bp.db_user IS NOT NULL
  AND older.db_user IS NOT NULL
  AND bp.profile_id > older.profile_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_baseline_profiles_db_user_unique ON baseline_profiles (db_user);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_unique ON app_users(username);

CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_query_logs_total_ms ON query_logs(total_ms);
CREATE INDEX IF NOT EXISTS idx_query_logs_action ON query_logs(action_taken);
CREATE INDEX IF NOT EXISTS idx_query_logs_severity ON query_logs(severity);
CREATE INDEX IF NOT EXISTS idx_query_features_query_id ON query_features(query_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_query_id ON anomaly_scores(query_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_db_user ON anomaly_scores(db_user);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_category ON anomaly_scores(anomaly_category);
CREATE INDEX IF NOT EXISTS idx_anomaly_scores_confidence ON anomaly_scores(anomaly_confidence);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_is_read ON notification_events(is_read);
CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON notification_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analyst_feedback_query_id ON analyst_feedback(query_id);
CREATE INDEX IF NOT EXISTS idx_analyst_feedback_anomaly_id ON analyst_feedback(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_analyst_feedback_type ON analyst_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_baseline_profiles_ml_enabled ON baseline_profiles(ml_enabled);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
CREATE INDEX IF NOT EXISTS idx_rules_is_system ON rules(is_system);
CREATE INDEX IF NOT EXISTS idx_performance_samples_recorded_at ON performance_samples(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_samples_query_id ON performance_samples(query_id);
