INSERT INTO app_users (username, email, full_name, role, password_hash, is_active)
VALUES ('admin', 'admin@sqlwatcher.local', 'SQLWatcher Admin', 'admin', 'pbkdf2_sha256$150000$sqlwatcher-demo-admin-2026$c7ffd3d12b7361dfe4d2a4da4da5c9923e36d260d177e46d517c456197215ad9', TRUE)
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    is_active = TRUE
WHERE app_users.password_hash IS DISTINCT FROM EXCLUDED.password_hash
   OR app_users.email IS DISTINCT FROM EXCLUDED.email
   OR app_users.full_name IS DISTINCT FROM EXCLUDED.full_name
   OR app_users.role IS DISTINCT FROM EXCLUDED.role
   OR app_users.is_active IS DISTINCT FROM TRUE;

INSERT INTO app_users (username, email, full_name, role, password_hash, is_active)
VALUES ('analyst', 'analyst@sqlwatcher.local', 'Security Analyst', 'analyst', 'pbkdf2_sha256$150000$sqlwatcher-demo-analyst-2026$9594f5afd9c3e27d735af2d7d5268e3518c85d147254fc6f321d3f33d903e947', TRUE)
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    is_active = TRUE
WHERE app_users.password_hash IS DISTINCT FROM EXCLUDED.password_hash
   OR app_users.email IS DISTINCT FROM EXCLUDED.email
   OR app_users.full_name IS DISTINCT FROM EXCLUDED.full_name
   OR app_users.role IS DISTINCT FROM EXCLUDED.role
   OR app_users.is_active IS DISTINCT FROM TRUE;

INSERT INTO app_users (username, email, full_name, role, password_hash, is_active)
VALUES ('viewer', 'viewer@sqlwatcher.local', 'Read Only Viewer', 'viewer', 'pbkdf2_sha256$150000$sqlwatcher-demo-viewer-2026$f97aa80d6fbceb8bad229418dec6e0723cb9c72edccd8ce18b920988018b2e83', TRUE)
ON CONFLICT (username) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    password_hash = EXCLUDED.password_hash,
    is_active = TRUE
WHERE app_users.password_hash IS DISTINCT FROM EXCLUDED.password_hash
   OR app_users.email IS DISTINCT FROM EXCLUDED.email
   OR app_users.full_name IS DISTINCT FROM EXCLUDED.full_name
   OR app_users.role IS DISTINCT FROM EXCLUDED.role
   OR app_users.is_active IS DISTINCT FROM TRUE;
