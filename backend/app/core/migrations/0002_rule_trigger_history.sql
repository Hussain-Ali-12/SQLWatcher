CREATE TABLE IF NOT EXISTS rule_trigger_history (
    history_id    SERIAL PRIMARY KEY,
    rule_name     VARCHAR(128) NOT NULL,
    trigger_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    trigger_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE (rule_name, trigger_date)
);

CREATE INDEX IF NOT EXISTS idx_rule_trigger_history_rule_date
    ON rule_trigger_history (rule_name, trigger_date DESC);
