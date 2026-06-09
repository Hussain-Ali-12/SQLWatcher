-- Demo seed data

INSERT INTO users (username, email, password_hash, role)
VALUES
('hussain', 'hussain@example.com', 'hash_demo_1', 'admin'),
('analyst1', 'analyst1@example.com', 'hash_demo_2', 'analyst'),
('webuser', 'webuser@example.com', 'hash_demo_3', 'user')
ON CONFLICT (username) DO NOTHING;

INSERT INTO customers (full_name, email, phone, city)
VALUES
('Ali Khan', 'ali.khan@example.com', '+92-300-1111111', 'Islamabad'),
('Sara Ahmed', 'sara.ahmed@example.com', '+92-300-2222222', 'Rawalpindi'),
('Usman Malik', 'usman.malik@example.com', '+92-300-3333333', 'Lahore');

INSERT INTO products (name, category, price)
VALUES
('Wireless Mouse', 'electronics', 2500.00),
('Keyboard', 'electronics', 4200.00),
('Notebook', 'stationery', 350.00);

INSERT INTO orders (customer_id, product_id, quantity, order_total, status, created_at)
VALUES
(1, 1, 2, 5000.00, 'paid', NOW() - INTERVAL '3 days'),
(2, 2, 1, 4200.00, 'shipped', NOW() - INTERVAL '2 days'),
(3, 3, 5, 1750.00, 'delivered', NOW() - INTERVAL '1 day');

INSERT INTO employees (full_name, department, email)
VALUES
('Ahmed Ali', 'Cyber Security', 'ahmed.ali@example.com'),
('Jazib Ali', 'Database', 'jazib.ali@example.com');

INSERT INTO salary_records (employee_id, monthly_salary, bonus, updated_at)
VALUES
(1, 120000.00, 20000.00, NOW() - INTERVAL '2 days'),
(2, 115000.00, 18000.00, NOW() - INTERVAL '1 day');
