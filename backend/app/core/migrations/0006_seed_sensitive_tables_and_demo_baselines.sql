INSERT INTO sensitive_tables (table_name, sensitivity_label, description)
VALUES
('users', 'PII', 'Application users table.'),
('customers', 'PII', 'Customer records containing personal data.'),
('salary_records', 'CONFIDENTIAL', 'Employee salary records.'),
('employees', 'PII', 'Employee profile records.')
ON CONFLICT (table_name) DO NOTHING;

INSERT INTO baseline_profiles
(db_user, sample_count, query_type_distribution, common_tables, avg_table_count,
 avg_where_conditions, avg_has_limit, avg_has_select_star, avg_sensitive_table_count,
 avg_risk_score, normal_hours, model_version, updated_at)
VALUES
('web_app', 24, '{"SELECT": 24}'::jsonb, ARRAY['products','orders']::TEXT[], 1.20, 0.85, 0.72, 0.04, 0.00, 0.00, ARRAY[9,10,11,12,13,14,15,16,17]::INTEGER[], 'statistical-v1', NOW()),
('admin_user', 18, '{"SELECT": 15, "UPDATE": 2, "DELETE": 1}'::jsonb, ARRAY['products','customers','users','rules']::TEXT[], 1.55, 1.35, 0.38, 0.08, 0.25, 8.00, ARRAY[10,11,12,13,14,15,16]::INTEGER[], 'statistical-v1', NOW()),
('finance_user', 20, '{"SELECT": 20}'::jsonb, ARRAY['orders','employees','salary_records']::TEXT[], 1.75, 1.10, 0.45, 0.15, 0.90, 12.00, ARRAY[10,11,12,13,14,15]::INTEGER[], 'statistical-v1', NOW()),
('reporting_bot', 30, '{"SELECT": 30}'::jsonb, ARRAY['orders','products','customers']::TEXT[], 2.20, 0.60, 0.95, 0.02, 0.10, 0.00, ARRAY[1,2,3,4,5]::INTEGER[], 'statistical-v1', NOW())
ON CONFLICT (db_user) DO NOTHING;
