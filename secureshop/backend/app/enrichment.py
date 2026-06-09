from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit, urlunsplit

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception as exc:  # pragma: no cover
    psycopg = None
    dict_row = None
    PSYCOPG_IMPORT_ERROR = exc


FIRST_NAMES = [
    "Ali", "Sara", "Usman", "Ayesha", "Hassan", "Fatima", "Zain", "Hira", "Bilal", "Maha",
    "Ahmed", "Noor", "Danish", "Iqra", "Hamza", "Anum", "Jazib", "Eman", "Sardar", "Hussain",
]
LAST_NAMES = [
    "Khan", "Ahmed", "Malik", "Rizvi", "Ali", "Qureshi", "Siddiqui", "Sheikh", "Raza", "Butt",
    "Farooq", "Iqbal", "Naeem", "Sohail", "Amir", "Shah", "Akhtar", "Hussain", "Javed", "Khalid",
]
CITIES = ["Islamabad", "Rawalpindi", "Lahore", "Karachi", "Peshawar", "Multan", "Faisalabad", "Quetta"]
PRODUCT_CATEGORIES = ["electronics", "home", "stationery", "sports", "fashion", "office", "security", "accessories"]
DEPARTMENTS = ["Engineering", "Finance", "Operations", "Cyber Security", "HR", "Sales", "Support", "Database"]
ORDER_STATUSES = ["paid", "paid", "paid", "processing", "shipped", "delivered", "refunded"]


def require_psycopg() -> None:
    if psycopg is None:
        raise RuntimeError(
            "psycopg is required for Neon enrichment. Install it with: "
            "python -m pip install \"psycopg[binary]==3.2.3\""
        ) from PSYCOPG_IMPORT_ERROR


def mask_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        if "@" not in parts.netloc:
            return url
        userinfo, hostinfo = parts.netloc.rsplit("@", 1)
        username = userinfo.split(":", 1)[0]
        return urlunsplit((parts.scheme, f"{username}:********@{hostinfo}", parts.path, parts.query, parts.fragment))
    except Exception:
        return "postgresql://********"


def ensure_sslmode(url: str, sslmode: str = "require") -> str:
    if "sslmode=" in url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}sslmode={sslmode}"


def create_or_upgrade_schema(conn: Any) -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(80) UNIQUE NOT NULL,
            email VARCHAR(160) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role VARCHAR(40) DEFAULT 'user',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS customers (
            customer_id SERIAL PRIMARY KEY,
            full_name VARCHAR(140) NOT NULL,
            email VARCHAR(160),
            phone VARCHAR(40),
            city VARCHAR(80),
            segment VARCHAR(40) DEFAULT 'retail',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS products (
            product_id SERIAL PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            category VARCHAR(80),
            price NUMERIC(10, 2),
            stock_quantity INTEGER DEFAULT 0,
            supplier VARCHAR(120),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS employees (
            employee_id SERIAL PRIMARY KEY,
            full_name VARCHAR(140) NOT NULL,
            department VARCHAR(80),
            email VARCHAR(160),
            city VARCHAR(80),
            hire_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS orders (
            order_id SERIAL PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(customer_id),
            product_id INTEGER REFERENCES products(product_id),
            quantity INTEGER DEFAULT 1,
            order_total NUMERIC(12, 2),
            status VARCHAR(40) DEFAULT 'paid',
            order_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS salary_records (
            salary_id SERIAL PRIMARY KEY,
            employee_id INTEGER REFERENCES employees(employee_id),
            monthly_salary NUMERIC(12, 2),
            bonus NUMERIC(12, 2) DEFAULT 0,
            effective_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(160)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'demo_hash'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(40) DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment VARCHAR(40) DEFAULT 'retail'",
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(120)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(80)",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT CURRENT_DATE",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_total NUMERIC(12, 2)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'paid'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS bonus NUMERIC(12, 2) DEFAULT 0",
        "ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS effective_date DATE DEFAULT CURRENT_DATE",
        "ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
        "CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city)",
        "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)",
        "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)",
        "UPDATE salary_records SET updated_at = COALESCE(updated_at, created_at, NOW())",
        "CREATE INDEX IF NOT EXISTS idx_salary_employee ON salary_records(employee_id)",
    ]
    with conn.cursor() as cur:
        for statement in statements:
            cur.execute(statement)


def reset_demo_tables(conn: Any) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            TRUNCATE TABLE
              salary_records,
              orders,
              employees,
              customers,
              products,
              users
            RESTART IDENTITY CASCADE
            """
        )


def build_customers(count: int) -> list[tuple[Any, ...]]:
    rows = []
    base_time = datetime.now(timezone.utc) - timedelta(days=180)
    for idx in range(1, count + 1):
        first = FIRST_NAMES[(idx - 1) % len(FIRST_NAMES)]
        last = LAST_NAMES[(idx * 3) % len(LAST_NAMES)]
        full_name = f"{first} {last}"
        email = f"{first.lower()}.{last.lower()}{idx}@secureshop.example"
        phone = f"+92-300-{idx:07d}"[-15:]
        city = CITIES[idx % len(CITIES)]
        segment = ["retail", "premium", "corporate", "student"][idx % 4]
        created_at = base_time + timedelta(days=idx % 150, hours=idx % 24)
        rows.append((full_name, email, phone, city, segment, created_at))
    return rows


def build_products(count: int) -> list[tuple[Any, ...]]:
    rows = []
    product_roots = [
        "Wireless Mouse", "Mechanical Keyboard", "USB-C Hub", "Laptop Stand", "Notebook",
        "Desk Lamp", "Backpack", "Fitness Band", "Smart Plug", "HD Webcam",
        "Security Camera", "Router", "SSD Drive", "Headphones", "Office Chair",
    ]
    suppliers = ["NorthBridge", "CyberMart", "ApexTrade", "BlueCart", "PakSupply", "SecureGear"]
    base_time = datetime.now(timezone.utc) - timedelta(days=220)
    for idx in range(1, count + 1):
        root = product_roots[(idx - 1) % len(product_roots)]
        category = PRODUCT_CATEGORIES[idx % len(PRODUCT_CATEGORIES)]
        name = f"{root} {idx:03d}"
        price = Decimal(str(round(450 + (idx * 137.41) % 95000 / 10, 2)))
        stock = 5 + (idx * 7) % 180
        supplier = suppliers[idx % len(suppliers)]
        created_at = base_time + timedelta(days=idx % 200)
        rows.append((name, category, price, stock, supplier, created_at))
    return rows


def build_employees(count: int) -> list[tuple[Any, ...]]:
    rows = []
    base_hire = datetime.now(timezone.utc).date() - timedelta(days=1400)
    for idx in range(1, count + 1):
        first = FIRST_NAMES[(idx + 4) % len(FIRST_NAMES)]
        last = LAST_NAMES[(idx * 5) % len(LAST_NAMES)]
        full_name = f"{first} {last}"
        department = DEPARTMENTS[idx % len(DEPARTMENTS)]
        email = f"{first.lower()}.{last.lower()}{idx}@secureshop.internal"
        city = CITIES[(idx + 2) % len(CITIES)]
        hire_date = base_hire + timedelta(days=idx * 23)
        created_at = datetime.now(timezone.utc) - timedelta(days=max(1, 1000 - idx * 10))
        rows.append((full_name, department, email, city, hire_date, created_at))
    return rows


def build_orders(count: int, customer_count: int, products: list[tuple[Any, ...]]) -> list[tuple[Any, ...]]:
    rows = []
    now = datetime.now(timezone.utc)
    for idx in range(1, count + 1):
        customer_id = 1 + ((idx * 7) % customer_count)
        product_id = 1 + ((idx * 11) % len(products))
        quantity = 1 + (idx % 5)
        product_price = Decimal(products[product_id - 1][2])
        discount_multiplier = Decimal("0.95") if idx % 9 == 0 else Decimal("1.00")
        order_total = (product_price * Decimal(quantity) * discount_multiplier).quantize(Decimal("0.01"))
        status = ORDER_STATUSES[idx % len(ORDER_STATUSES)]
        created_at = now - timedelta(days=idx % 90, hours=idx % 24, minutes=idx % 60)
        order_date = created_at.date()
        rows.append((customer_id, product_id, quantity, order_total, status, order_date, created_at))
    return rows


def build_salary_records(employee_count: int) -> list[tuple[Any, ...]]:
    rows = []
    today = datetime.now(timezone.utc).date()
    for idx in range(1, employee_count + 1):
        base_salary = Decimal(55000 + ((idx * 9300) % 180000)).quantize(Decimal("0.01"))
        bonus = Decimal((idx * 2500) % 40000).quantize(Decimal("0.01"))
        effective_date = today - timedelta(days=(idx % 12) * 30)
        created_at = datetime.now(timezone.utc) - timedelta(days=idx * 2)
        rows.append((idx, base_salary, bonus, effective_date, created_at, created_at))
    return rows


def insert_enriched_data(
    conn: Any,
    customers: int = 80,
    products: int = 60,
    employees: int = 32,
    orders: int = 420,
) -> dict[str, int]:
    customer_rows = build_customers(customers)
    product_rows = build_products(products)
    employee_rows = build_employees(employees)
    order_rows = build_orders(orders, customers, product_rows)
    salary_rows = build_salary_records(employees)

    with conn.cursor() as cur:
        # Demo users are useful for realism, but SecureShop runtime traffic does
        # not depend on them. Existing external Neon databases may have a custom
        # users table with additional constraints, so this insert is best-effort.
        inserted_users = 0
        demo_users = [
            ("hussain", "hussain@example.com", "hash_demo_1", "admin"),
            ("analyst1", "analyst1@example.com", "hash_demo_2", "analyst"),
            ("webuser", "webuser@example.com", "hash_demo_3", "user"),
            ("finance_bot", "finance.bot@example.com", "hash_demo_4", "service"),
            ("reporting_bot", "reporting.bot@example.com", "hash_demo_5", "service"),
        ]
        try:
            for username, email, password_hash, role in demo_users:
                cur.execute(
                    """
                    INSERT INTO users (username, email, password_hash, role)
                    SELECT %s, %s, %s, %s
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM users
                        WHERE username = %s OR email = %s
                    )
                    """,
                    (username, email, password_hash, role, username, email),
                )
                inserted_users += int(cur.rowcount or 0)
        except Exception:
            # Continue enrichment even if the existing users table is incompatible.
            inserted_users = 0
        cur.executemany(
            """
            INSERT INTO customers (full_name, email, phone, city, segment, created_at)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            customer_rows,
        )
        cur.executemany(
            """
            INSERT INTO products (name, category, price, stock_quantity, supplier, created_at)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            product_rows,
        )
        cur.executemany(
            """
            INSERT INTO employees (full_name, department, email, city, hire_date, created_at)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            employee_rows,
        )
        cur.executemany(
            """
            INSERT INTO orders (customer_id, product_id, quantity, order_total, status, order_date, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            order_rows,
        )
        cur.executemany(
            """
            INSERT INTO salary_records (employee_id, monthly_salary, bonus, effective_date, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            salary_rows,
        )

    return {
        "users": inserted_users,
        "customers": len(customer_rows),
        "products": len(product_rows),
        "employees": len(employee_rows),
        "orders": len(order_rows),
        "salary_records": len(salary_rows),
    }


def collect_counts(conn: Any) -> dict[str, int]:
    tables = ["users", "customers", "products", "employees", "orders", "salary_records"]
    counts = {}
    with conn.cursor() as cur:
        for table in tables:
            cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
            row = cur.fetchone()
            counts[table] = int(row["count"] if isinstance(row, dict) else row[0])
    return counts


def validate_required_query_shapes(conn: Any) -> dict[str, Any]:
    queries = {
        "orders_created_at_order_total": "SELECT order_id, order_total FROM orders ORDER BY created_at DESC LIMIT 3",
        "order_date_reporting": "SELECT DATE(created_at) AS day, COUNT(*) AS orders FROM orders GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 3",
        "salary_bonus": "SELECT employee_id, monthly_salary, bonus FROM salary_records ORDER BY salary_id LIMIT 3",
        "category_average": "SELECT category, AVG(price) AS avg_price FROM products GROUP BY category LIMIT 3",
    }
    results: dict[str, Any] = {}
    with conn.cursor() as cur:
        for name, sql in queries.items():
            try:
                cur.execute(sql)
                results[name] = {"ok": True, "rows": len(cur.fetchall())}
            except Exception as exc:
                results[name] = {"ok": False, "error": str(exc)}
    return results


def enrich_database(
    database_url: str,
    reset: bool = True,
    customers: int = 80,
    products: int = 60,
    employees: int = 32,
    orders: int = 420,
    sslmode: str = "require",
) -> dict[str, Any]:
    require_psycopg()
    safe_url = ensure_sslmode(database_url.strip(), sslmode=sslmode) if sslmode else database_url.strip()

    started = datetime.now(timezone.utc)
    with psycopg.connect(safe_url, autocommit=True, row_factory=dict_row) as conn:
        create_or_upgrade_schema(conn)
        before_counts = collect_counts(conn)
        if reset:
            reset_demo_tables(conn)
        inserted = insert_enriched_data(conn, customers=customers, products=products, employees=employees, orders=orders)
        after_counts = collect_counts(conn)
        validation = validate_required_query_shapes(conn)

    return {
        "status": "enriched",
        "database": mask_url(database_url),
        "reset": reset,
        "before_counts": before_counts,
        "inserted": inserted,
        "after_counts": after_counts,
        "validation": validation,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str))
