-- Canonical SecureShop protected-target schema and seed data.
-- Apply this only to the Neon 'secureshop' database using the owner/admin role.
-- SQLWatcher control tables do not belong in this database.

-- -----------------------------------------------------------------------------
-- SecureShop target/demo schema
-- -----------------------------------------------------------------------------
-- This section creates the protected application tables used by SecureShop.
-- It is intentionally idempotent and does not DROP or TRUNCATE tables.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    email VARCHAR(160) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'demo_hash',
    role VARCHAR(40) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    full_name VARCHAR(140) NOT NULL,
    email VARCHAR(160),
    phone VARCHAR(40),
    city VARCHAR(80),
    segment VARCHAR(40) DEFAULT 'retail',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(80),
    price NUMERIC(10, 2),
    stock_quantity INTEGER DEFAULT 0,
    supplier VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
    employee_id SERIAL PRIMARY KEY,
    full_name VARCHAR(140) NOT NULL,
    department VARCHAR(80),
    email VARCHAR(160),
    city VARCHAR(80),
    hire_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    product_id INTEGER REFERENCES products(product_id),
    quantity INTEGER DEFAULT 1,
    order_total NUMERIC(12, 2),
    status VARCHAR(40) DEFAULT 'paid',
    order_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_records (
    salary_id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(employee_id),
    monthly_salary NUMERIC(12, 2),
    bonus NUMERIC(12, 2) DEFAULT 0,
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibility upgrades for older SecureShop demo databases.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(160);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'demo_hash';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(40) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment VARCHAR(40) DEFAULT 'retail';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(80);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_total NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'paid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS bonus NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS effective_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE salary_records SET updated_at = COALESCE(updated_at, created_at, NOW());

CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_salary_employee ON salary_records(employee_id);

-- Seed SecureShop users only when the table is empty.
INSERT INTO users (username, email, password_hash, role)
SELECT username, email, password_hash, role
FROM (VALUES
    ('shop_admin', 'admin@secureshop.local', 'demo_hash_admin', 'admin'),
    ('inventory_user', 'inventory@secureshop.local', 'demo_hash_inventory', 'inventory'),
    ('sales_user', 'sales@secureshop.local', 'demo_hash_sales', 'sales'),
    ('finance_viewer', 'finance@secureshop.local', 'demo_hash_finance', 'finance'),
    ('support_agent', 'support@secureshop.local', 'demo_hash_support', 'support')
) AS seed(username, email, password_hash, role)
WHERE NOT EXISTS (SELECT 1 FROM users);

INSERT INTO customers (full_name, email, phone, city, segment, created_at)
SELECT full_name, email, phone, city, segment, created_at
FROM (VALUES
    ('Ali Khan','ali.khan@example.com','+92-300-0000001','Islamabad','retail',NOW() - INTERVAL '12 days'),
    ('Sara Ahmed','sara.ahmed@example.com','+92-300-0000002','Rawalpindi','premium',NOW() - INTERVAL '11 days'),
    ('Usman Malik','usman.malik@example.com','+92-300-0000003','Lahore','corporate',NOW() - INTERVAL '10 days'),
    ('Ayesha Noor','ayesha.noor@example.com','+92-300-0000004','Karachi','retail',NOW() - INTERVAL '9 days'),
    ('Hamza Farooq','hamza.farooq@example.com','+92-300-0000005','Peshawar','student',NOW() - INTERVAL '8 days'),
    ('Zara Siddiqui','zara.siddiqui@example.com','+92-300-0000006','Faisalabad','premium',NOW() - INTERVAL '7 days'),
    ('Bilal Qureshi','bilal.qureshi@example.com','+92-300-0000007','Multan','retail',NOW() - INTERVAL '6 days'),
    ('Maham Raza','maham.raza@example.com','+92-300-0000008','Quetta','corporate',NOW() - INTERVAL '5 days'),
    ('Danish Iqbal','danish.iqbal@example.com','+92-300-0000009','Hyderabad','retail',NOW() - INTERVAL '4 days'),
    ('Noor Fatima','noor.fatima@example.com','+92-300-0000010','Islamabad','premium',NOW() - INTERVAL '3 days'),
    ('Haris Javed','haris.javed@example.com','+92-300-0000011','Rawalpindi','retail',NOW() - INTERVAL '2 days'),
    ('Minaal Saeed','minaal.saeed@example.com','+92-300-0000012','Lahore','student',NOW() - INTERVAL '1 day')
) AS seed(full_name, email, phone, city, segment, created_at)
WHERE NOT EXISTS (SELECT 1 FROM customers);

INSERT INTO products (name, category, price, stock_quantity, supplier, created_at)
SELECT name, category, price, stock_quantity, supplier, created_at
FROM (VALUES
    ('Wireless Mouse','electronics',24.99,85,'NorthBridge',NOW() - INTERVAL '15 days'),
    ('Mechanical Keyboard','electronics',89.99,42,'CyberMart',NOW() - INTERVAL '14 days'),
    ('USB-C Hub','electronics',39.99,60,'ApexTrade',NOW() - INTERVAL '13 days'),
    ('Notebook Pack','stationery',7.50,200,'BlueCart',NOW() - INTERVAL '12 days'),
    ('Desk Lamp','home-office',31.25,34,'PakSupply',NOW() - INTERVAL '11 days'),
    ('Noise Cancelling Headphones','electronics',129.99,20,'SecureGear',NOW() - INTERVAL '10 days'),
    ('Ergonomic Office Chair','home-office',249.50,12,'NorthBridge',NOW() - INTERVAL '9 days'),
    ('Portable SSD 1TB','electronics',109.00,28,'CyberMart',NOW() - INTERVAL '8 days'),
    ('Webcam Full HD','electronics',45.00,55,'ApexTrade',NOW() - INTERVAL '7 days'),
    ('Standing Desk Mat','home-office',28.75,90,'BlueCart',NOW() - INTERVAL '6 days'),
    ('Router AX1800','networking',79.99,35,'PakSupply',NOW() - INTERVAL '5 days'),
    ('Ethernet Cable Pack','networking',12.99,150,'SecureGear',NOW() - INTERVAL '4 days'),
    ('Laptop Stand','home-office',34.50,44,'NorthBridge',NOW() - INTERVAL '3 days'),
    ('Blue Light Glasses','accessories',19.99,70,'CyberMart',NOW() - INTERVAL '2 days'),
    ('Whiteboard Marker Set','stationery',6.25,120,'ApexTrade',NOW() - INTERVAL '1 day')
) AS seed(name, category, price, stock_quantity, supplier, created_at)
WHERE NOT EXISTS (SELECT 1 FROM products);

INSERT INTO employees (full_name, department, email, city, hire_date, created_at)
SELECT full_name, department, email, city, hire_date, created_at
FROM (VALUES
    ('Hassan Raza','Finance','hassan.raza@secureshop.local','Islamabad',CURRENT_DATE - 900,NOW() - INTERVAL '30 days'),
    ('Maryam Iqbal','Operations','maryam.iqbal@secureshop.local','Rawalpindi',CURRENT_DATE - 820,NOW() - INTERVAL '29 days'),
    ('Bilal Shah','Engineering','bilal.shah@secureshop.local','Lahore',CURRENT_DATE - 760,NOW() - INTERVAL '28 days'),
    ('Sana Jamil','Customer Support','sana.jamil@secureshop.local','Karachi',CURRENT_DATE - 640,NOW() - INTERVAL '27 days'),
    ('Omar Siddiqui','Security','omar.siddiqui@secureshop.local','Islamabad',CURRENT_DATE - 530,NOW() - INTERVAL '26 days'),
    ('Areeba Khan','Sales','areeba.khan@secureshop.local','Rawalpindi',CURRENT_DATE - 420,NOW() - INTERVAL '25 days'),
    ('Taimoor Ali','Logistics','taimoor.ali@secureshop.local','Peshawar',CURRENT_DATE - 310,NOW() - INTERVAL '24 days')
) AS seed(full_name, department, email, city, hire_date, created_at)
WHERE NOT EXISTS (SELECT 1 FROM employees);

INSERT INTO orders (customer_id, product_id, quantity, order_total, status, order_date, created_at)
SELECT customer_id, product_id, quantity, order_total, status, order_date, created_at
FROM (VALUES
    (1,1,2,49.98,'paid',CURRENT_DATE - 16,NOW() - INTERVAL '16 hours'),
    (2,2,3,269.97,'shipped',CURRENT_DATE - 15,NOW() - INTERVAL '15 hours'),
    (3,3,4,159.96,'delivered',CURRENT_DATE - 14,NOW() - INTERVAL '14 hours'),
    (4,4,1,7.50,'paid',CURRENT_DATE - 13,NOW() - INTERVAL '13 hours'),
    (5,5,2,62.50,'paid',CURRENT_DATE - 12,NOW() - INTERVAL '12 hours'),
    (6,6,3,389.97,'processing',CURRENT_DATE - 11,NOW() - INTERVAL '11 hours'),
    (7,7,4,998.00,'shipped',CURRENT_DATE - 10,NOW() - INTERVAL '10 hours'),
    (8,8,1,109.00,'paid',CURRENT_DATE - 9,NOW() - INTERVAL '9 hours'),
    (9,9,2,90.00,'delivered',CURRENT_DATE - 8,NOW() - INTERVAL '8 hours'),
    (10,10,3,86.25,'paid',CURRENT_DATE - 7,NOW() - INTERVAL '7 hours'),
    (11,11,4,319.96,'processing',CURRENT_DATE - 6,NOW() - INTERVAL '6 hours'),
    (12,12,1,12.99,'paid',CURRENT_DATE - 5,NOW() - INTERVAL '5 hours'),
    (1,13,2,69.00,'shipped',CURRENT_DATE - 4,NOW() - INTERVAL '4 hours'),
    (2,14,3,59.97,'paid',CURRENT_DATE - 3,NOW() - INTERVAL '3 hours'),
    (3,15,4,25.00,'delivered',CURRENT_DATE - 2,NOW() - INTERVAL '2 hours'),
    (4,1,1,24.99,'paid',CURRENT_DATE - 1,NOW() - INTERVAL '1 hour')
) AS seed(customer_id, product_id, quantity, order_total, status, order_date, created_at)
WHERE NOT EXISTS (SELECT 1 FROM orders);

INSERT INTO salary_records (employee_id, monthly_salary, bonus, effective_date, created_at, updated_at)
SELECT employee_id, monthly_salary, bonus, effective_date, created_at, updated_at
FROM (VALUES
    (1,115000,10000,CURRENT_DATE - 30,NOW() - INTERVAL '8 days',NOW() - INTERVAL '1 days'),
    (2,130000,13000,CURRENT_DATE - 29,NOW() - INTERVAL '8 days',NOW() - INTERVAL '2 days'),
    (3,145000,16000,CURRENT_DATE - 28,NOW() - INTERVAL '8 days',NOW() - INTERVAL '3 days'),
    (4,160000,19000,CURRENT_DATE - 27,NOW() - INTERVAL '8 days',NOW() - INTERVAL '4 days'),
    (5,175000,22000,CURRENT_DATE - 26,NOW() - INTERVAL '8 days',NOW() - INTERVAL '5 days'),
    (6,190000,25000,CURRENT_DATE - 25,NOW() - INTERVAL '8 days',NOW() - INTERVAL '6 days'),
    (7,205000,28000,CURRENT_DATE - 24,NOW() - INTERVAL '8 days',NOW() - INTERVAL '7 days')
) AS seed(employee_id, monthly_salary, bonus, effective_date, created_at, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM salary_records);

-- Grant runtime privileges to the configured SecureShop app role when it exists.
-- Runtime grants are not needed in the single-role local setup.
-- The same secureshop role owns and runs the SecureShop target database.

