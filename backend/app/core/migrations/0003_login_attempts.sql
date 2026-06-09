CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id    SERIAL PRIMARY KEY,
    ip            VARCHAR(64) NOT NULL,
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'login_attempts'
          AND column_name = 'attempt_id'
    ) THEN
        ALTER TABLE login_attempts ADD COLUMN attempt_id INTEGER;
        CREATE SEQUENCE IF NOT EXISTS login_attempts_attempt_id_seq;
        ALTER TABLE login_attempts ALTER COLUMN attempt_id SET DEFAULT nextval('login_attempts_attempt_id_seq');
        UPDATE login_attempts SET attempt_id = nextval('login_attempts_attempt_id_seq') WHERE attempt_id IS NULL;
        ALTER TABLE login_attempts ALTER COLUMN attempt_id SET NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_pkey'
    ) THEN
        ALTER TABLE login_attempts ADD PRIMARY KEY (attempt_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
    ON login_attempts (ip, attempted_at DESC);
