import asyncio
import json
import re
import os
import sys
import socket
import ssl
import struct
import time
import urllib.request
from typing import Optional

# Allow the proxy to import the project-level shared package both when run from
# the repository checkout (proxy/sqlwatcher_pg_proxy.py) and from the Docker
# image (/app/sqlwatcher_pg_proxy.py with /app/shared copied beside it).
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
for candidate in (SCRIPT_DIR, PROJECT_ROOT):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from shared.detection.engine import DEFAULT_RULES, detect_query
from shared.sql.features import extract_query_features

LISTEN_HOST = os.getenv("PROXY_LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.getenv("PROXY_LISTEN_PORT", "15432"))

TARGET_HOST = os.getenv("PROXY_TARGET_HOST", "target-db")
TARGET_PORT = int(os.getenv("PROXY_TARGET_PORT", "5432"))
TARGET_SSL_MODE = os.getenv("PROXY_TARGET_SSL_MODE", "disable").lower().strip()

BACKEND_URL = os.getenv("SQLWATCHER_BACKEND_URL", "http://backend:8000")
PROXY_TOKEN = os.getenv("SQLWATCHER_PROXY_TOKEN")
if not PROXY_TOKEN or PROXY_TOKEN.strip() == "" or PROXY_TOKEN == "change-this" + "-proxy-token":
    raise RuntimeError(
        "SQLWATCHER_PROXY_TOKEN must be set to a strong, non-default value before starting the SQLWatcher proxy."
    )
FAIL_MODE = os.getenv("PROXY_FAIL_MODE", "closed").lower().strip()
FAST_LOCAL_DETECTION = os.getenv("PROXY_FAST_LOCAL_DETECTION", "true").lower().strip() == "true"
BACKGROUND_RECORDING = os.getenv("PROXY_BACKGROUND_RECORDING", "true").lower().strip() == "true"
RECORD_SEMAPHORE_SIZE = int(os.getenv("PROXY_RECORD_SEMAPHORE", "25"))
RULE_SYNC_INTERVAL_SECONDS = int(os.getenv("PROXY_RULE_SYNC_INTERVAL_SECONDS", "15"))
PROXY_HTTP_TIMEOUT_SECONDS = float(os.getenv("PROXY_HTTP_TIMEOUT_SECONDS", "20"))
PROXY_RULE_SYNC_HTTP_TIMEOUT_SECONDS = float(os.getenv("PROXY_RULE_SYNC_HTTP_TIMEOUT_SECONDS", "3"))
PROXY_RECORD_HTTP_TIMEOUT_SECONDS = float(os.getenv("PROXY_RECORD_HTTP_TIMEOUT_SECONDS", "5"))
PROXY_RECORD_RETRY_COUNT = int(os.getenv("PROXY_RECORD_RETRY_COUNT", "2"))
PROXY_RECORD_MAX_PENDING = int(os.getenv("PROXY_RECORD_MAX_PENDING", "10000"))
PROXY_DROP_LOW_RISK_ALLOWS_WHEN_FULL = os.getenv("PROXY_DROP_LOW_RISK_ALLOWS_WHEN_FULL", "false").lower().strip() == "true"

BUFFER_LIMIT = 10 * 1024 * 1024
_record_semaphore = asyncio.Semaphore(RECORD_SEMAPHORE_SIZE)
_record_queue: asyncio.Queue[tuple[str, str, dict, str]] | None = None
_record_workers: list[asyncio.Task] = []
_rule_refresh_task: asyncio.Task | None = None
_rule_cache: dict = {
    "expires_at": 0.0,
    "enabled_rule_names": set(DEFAULT_RULES),
    "custom_rules": [],
    "last_error": None,
}

LOGICAL_USER_TAG_RE = re.compile(
    r"^\s*/\*\s*sqlwatcher_user\s*=\s*([A-Za-z0-9_.-]{1,64})\s*\*/\s*",
    re.IGNORECASE,
)

def split_logical_user_tag(sql: str, fallback: str = "proxy_user") -> tuple[str, str]:
    """Extract a controlled demo application user tag from SQL.

    SecureShop uses a leading SQL comment such as:

        /* sqlwatcher_user=finance_user */ SELECT ...

    PostgreSQL ignores the comment, but SQLWatcher records the query under the
    logical application persona so the anomaly-baseline page can demonstrate
    multiple users while using one physical database role.
    """
    raw_sql = sql or ""
    match = LOGICAL_USER_TAG_RE.match(raw_sql)
    if not match:
        return fallback, raw_sql

    db_user = match.group(1).strip() or fallback
    cleaned_sql = raw_sql[match.end():].lstrip()
    return db_user, cleaned_sql or raw_sql




def filter_authentication_sasl_mechanisms(raw_message: bytes) -> bytes:
    """Filter SCRAM-SHA-256-PLUS for plaintext client->proxy connections."""
    if len(raw_message) < 9 or raw_message[0:1] != b"R":
        return raw_message

    length = struct.unpack("!I", raw_message[1:5])[0]
    payload = raw_message[5:5 + length - 4]
    if len(payload) < 4:
        return raw_message

    auth_code = struct.unpack("!I", payload[0:4])[0]
    if auth_code != 10:  # AuthenticationSASL
        return raw_message

    mechanisms = [item for item in payload[4:].split(b"\x00") if item]
    filtered = [item for item in mechanisms if item != b"SCRAM-SHA-256-PLUS"]

    if not filtered:
        return raw_message

    new_payload = struct.pack("!I", auth_code) + b"\x00".join(filtered) + b"\x00\x00"
    return b"R" + struct.pack("!I", len(new_payload) + 4) + new_payload


def read_cstring(payload: bytes, offset: int = 0) -> tuple[str, int]:
    """Read a PostgreSQL protocol null-terminated string."""
    end = payload.find(b"\x00", offset)
    if end == -1:
        raise ValueError("Missing null terminator in PostgreSQL message payload.")
    value = payload[offset:end].decode("utf-8", errors="replace")
    return value, end + 1


def parse_extended_parse_payload(payload: bytes) -> tuple[str, str]:
    """Parse PostgreSQL extended protocol Parse message payload.

    Payload layout:
    - prepared statement name: C string
    - query string: C string
    - parameter type count: Int16
    - optional parameter type OIDs
    """
    statement_name, offset = read_cstring(payload, 0)
    query, offset = read_cstring(payload, offset)
    return statement_name, query


def parse_bind_payload(payload: bytes) -> tuple[str, str]:
    """Parse PostgreSQL extended protocol Bind message portal and statement names.

    Payload begins with:
    - destination portal name: C string
    - prepared statement name: C string
    """
    portal_name, offset = read_cstring(payload, 0)
    statement_name, offset = read_cstring(payload, offset)
    return portal_name, statement_name


def parse_execute_payload(payload: bytes) -> str:
    """Parse PostgreSQL extended protocol Execute message portal name."""
    portal_name, offset = read_cstring(payload, 0)
    return portal_name


def build_pg_error(message: str, severity: str = "ERROR", code: str = "42501") -> bytes:
    """Build a PostgreSQL ErrorResponse + ReadyForQuery.

    This is used when SQLWatcher blocks a query before it reaches the real target
    database. ReadyForQuery returns the client to idle state after the blocked
    message sequence is consumed up to Sync.
    """
    payload = (
        b"S" + severity.encode("utf-8") + b"\x00"
        + b"C" + code.encode("utf-8") + b"\x00"
        + b"M" + message.encode("utf-8", errors="replace") + b"\x00"
        + b"\x00"
    )
    error = b"E" + struct.pack("!I", len(payload) + 4) + payload
    ready = b"Z" + struct.pack("!I", 5) + b"I"
    return error + ready




def fetch_rule_config_sync() -> dict:
    req = urllib.request.Request(
        f"{BACKEND_URL}/api/proxy/rules",
        method="GET",
        headers={"X-SQLWatcher-Proxy-Token": PROXY_TOKEN},
    )
    timeout = max(1.0, min(PROXY_RULE_SYNC_HTTP_TIMEOUT_SECONDS, PROXY_HTTP_TIMEOUT_SECONDS))
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


async def _refresh_rule_config_background() -> None:
    """Refresh proxy rules without blocking PostgreSQL query processing.

    The data plane must stay fast even when the Render control-plane backend is
    cold, overloaded, or temporarily slow after resets/baseline training. The
    proxy therefore serves the last known rule snapshot immediately and refreshes
    rules in the background.
    """
    global _rule_refresh_task
    try:
        data = await asyncio.to_thread(fetch_rule_config_sync)
        enabled = data.get("enabled_rule_names")
        _rule_cache["enabled_rule_names"] = set(enabled) if enabled else set(DEFAULT_RULES)
        _rule_cache["custom_rules"] = data.get("custom_rules") or []
        _rule_cache["expires_at"] = time.time() + RULE_SYNC_INTERVAL_SECONDS
        _rule_cache["last_error"] = None
    except Exception as exc:
        _rule_cache["last_error"] = str(exc)
        _rule_cache["expires_at"] = time.time() + max(15, min(60, RULE_SYNC_INTERVAL_SECONDS))
        print(f"[proxy] rule sync deferred/non-blocking failure: {exc}")
    finally:
        _rule_refresh_task = None


def get_cached_rule_config() -> dict:
    """Return rule config immediately; never block client SQL on rule sync."""
    global _rule_refresh_task
    now = time.time()
    if now >= float(_rule_cache.get("expires_at", 0)) and _rule_refresh_task is None:
        try:
            loop = asyncio.get_running_loop()
            _rule_refresh_task = loop.create_task(_refresh_rule_config_background())
        except RuntimeError:
            # Defensive fallback for non-async startup contexts. Use default rules
            # instead of making a blocking network call from the data path.
            _rule_cache["expires_at"] = now + max(15, min(60, RULE_SYNC_INTERVAL_SECONDS))
    return _rule_cache


def _elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 3)


def inspect_sql_with_shared_engine(sql: str, db_user: str = "proxy_user", protocol_mode: str = "proxy_fast_local") -> dict:
    """Inspect SQL with the canonical shared detection engine."""
    started = time.perf_counter()
    rule_config = get_cached_rule_config()
    enabled_rule_names = rule_config.get("enabled_rule_names")
    custom_rules = rule_config.get("custom_rules") or []

    result = detect_query(
        sql,
        enabled_rules=enabled_rule_names,
        custom_rules=custom_rules,
    )
    features = extract_query_features(sql, db_user)

    return {
        "action": result.action,
        "severity": result.severity,
        "risk_score": result.risk_score,
        "detection_method": result.detection_method,
        "explanation": result.explanation,
        "query_type": result.query_type,
        "normalized_sql": result.normalized_sql,
        "features": features,
        "detection_ms": _elapsed_ms(started),
        "protocol_mode": protocol_mode,
    }

def record_decision_sync(sql: str, client_ip: str, decision: dict, db_user: str = "proxy_user") -> dict:
    payload = {
        "sql": sql,
        "db_user": db_user,
        "client_ip": client_ip,
        "protocol_mode": decision.get("protocol_mode", "proxy_fast_local"),
        "action": decision.get("action", "ALLOW"),
        "severity": decision.get("severity", "NONE"),
        "risk_score": int(decision.get("risk_score", 0)),
        "detection_method": decision.get("detection_method", "NONE"),
        "explanation": decision.get("explanation", "Proxy local fast-path decision."),
        "detection_ms": float(decision.get("detection_ms", 0)),
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND_URL}/api/proxy/record",
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-SQLWatcher-Proxy-Token": PROXY_TOKEN,
        },
    )

    with urllib.request.urlopen(req, timeout=max(1.0, min(PROXY_RECORD_HTTP_TIMEOUT_SECONDS, PROXY_HTTP_TIMEOUT_SECONDS))) as response:
        return json.loads(response.read().decode("utf-8"))


async def record_decision(sql: str, client_ip: str, decision: dict, db_user: str = "proxy_user") -> None:
    async with _record_semaphore:
        last_error: Exception | None = None
        for attempt in range(1, PROXY_RECORD_RETRY_COUNT + 1):
            try:
                await asyncio.to_thread(record_decision_sync, sql, client_ip, decision, db_user)
                return
            except Exception as exc:
                last_error = exc
                if attempt < PROXY_RECORD_RETRY_COUNT:
                    await asyncio.sleep(0.35 * attempt)

        print(f"[proxy] background decision record failed after {PROXY_RECORD_RETRY_COUNT} attempts: {last_error}")


async def record_decision_worker(worker_id: int) -> None:
    """Drain the bounded telemetry queue without creating one task per query."""
    assert _record_queue is not None
    while True:
        sql, client_ip, decision, db_user = await _record_queue.get()
        try:
            await record_decision(sql, client_ip, decision, db_user)
        except Exception as exc:
            print(f"[proxy] record worker {worker_id} failed unexpectedly: {exc}")
        finally:
            _record_queue.task_done()


def start_record_workers() -> None:
    global _record_queue, _record_workers
    if _record_queue is None:
        _record_queue = asyncio.Queue(maxsize=PROXY_RECORD_MAX_PENDING)
    if not _record_workers:
        for worker_id in range(max(1, RECORD_SEMAPHORE_SIZE)):
            _record_workers.append(asyncio.create_task(record_decision_worker(worker_id)))


async def schedule_record_decision(sql: str, client_ip: str, decision: dict, db_user: str = "proxy_user") -> None:
    if BACKGROUND_RECORDING:
        action = str(decision.get("action", "ALLOW")).upper()

        # Production default keeps ALLOW telemetry for benchmark accuracy. If
        # operators enable drop-on-pressure, only low-risk ALLOW rows are
        # sampled away; BLOCK/FLAG/ERROR rows are never intentionally dropped.
        if _record_queue is None:
            start_record_workers()

        assert _record_queue is not None
        try:
            _record_queue.put_nowait((sql, client_ip, decision, db_user))
        except asyncio.QueueFull:
            if action == "ALLOW" and PROXY_DROP_LOW_RISK_ALLOWS_WHEN_FULL:
                return
            # Preserve important security decisions even under overload. This
            # slow path is rare and intentionally outside the bounded queue.
            asyncio.create_task(record_decision(sql, client_ip, decision, db_user))
    else:
        # Debug mode: wait for recording before returning to client.
        await record_decision(sql, client_ip, decision, db_user)



def inspect_sql_sync(sql: str, client_ip: str, db_user: str = "proxy_user", protocol_mode: str = "postgres_simple_query") -> dict:
    payload = {
        "sql": sql,
        "db_user": db_user,
        "client_ip": client_ip,
        "protocol_mode": protocol_mode,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND_URL}/api/proxy/inspect",
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-SQLWatcher-Proxy-Token": PROXY_TOKEN,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=max(1.0, min(PROXY_RECORD_HTTP_TIMEOUT_SECONDS, PROXY_HTTP_TIMEOUT_SECONDS))) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        if FAIL_MODE == "open":
            return {
                "action": "ALLOW",
                "severity": "LOW",
                "risk_score": 0,
                "detection_method": "INSPECTION_ERROR_FAIL_OPEN",
                "explanation": f"Proxy inspection failed but fail-open is enabled: {exc}",
            }

        return {
            "action": "BLOCK",
            "severity": "HIGH",
            "risk_score": 90,
            "detection_method": "INSPECTION_ERROR_FAIL_CLOSED",
            "explanation": f"SQLWatcher proxy inspection failed: {exc}",
        }


async def inspect_sql(sql: str, client_ip: str, protocol_mode: str, db_user: str = "proxy_user") -> dict:
    if FAST_LOCAL_DETECTION:
        return inspect_sql_with_shared_engine(sql, db_user, protocol_mode)
    return await asyncio.to_thread(inspect_sql_sync, sql, client_ip, db_user, protocol_mode)


def extract_simple_query(payload: bytes) -> str:
    if payload.endswith(b"\x00"):
        payload = payload[:-1]
    return payload.decode("utf-8", errors="replace")


class ProxySession:
    def __init__(
        self,
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
        target_reader: asyncio.StreamReader,
        target_writer: asyncio.StreamWriter,
    ) -> None:
        self.client_reader = client_reader
        self.client_writer = client_writer
        self.target_reader = target_reader
        self.target_writer = target_writer
        self.client_addr = client_writer.get_extra_info("peername")
        self.client_ip = self.client_addr[0] if self.client_addr else "unknown"
        self.startup_complete = False
        self.client_buffer = bytearray()
        self.server_buffer = bytearray()

        # Extended query protocol state.
        # statement name -> inspection decision
        self.prepared_statement_decisions: dict[str, dict] = {}
        # statement name -> original SQL template
        self.prepared_statement_sql: dict[str, str] = {}
        # statement name -> logical app/database user
        self.prepared_statement_db_users: dict[str, str] = {}
        # portal name -> statement name
        self.portal_to_statement: dict[str, str] = {}

        # When a Parse/Bind/Execute is blocked, skip client messages until Sync.
        self.suppress_until_sync = False
        self.suppress_reason = ""

    async def run(self) -> None:
        print(f"[proxy] connection from {self.client_addr} -> {TARGET_HOST}:{TARGET_PORT}")
        client_task = asyncio.create_task(self.client_to_server())
        server_task = asyncio.create_task(self.server_to_client())

        done, pending = await asyncio.wait(
            {client_task, server_task},
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()

        self.close()

    def close(self) -> None:
        for writer in (self.client_writer, self.target_writer):
            try:
                writer.close()
            except Exception:
                pass

    async def client_to_server(self) -> None:
        while True:
            data = await self.client_reader.read(65536)
            if not data:
                break

            if not self.startup_complete:
                self.target_writer.write(data)
                await self.target_writer.drain()
                continue

            self.client_buffer.extend(data)
            if len(self.client_buffer) > BUFFER_LIMIT:
                self.client_writer.write(build_pg_error("SQLWatcher proxy buffer limit exceeded."))
                await self.client_writer.drain()
                self.client_buffer.clear()
                continue

            await self.process_client_messages()

    async def process_client_messages(self) -> None:
        while True:
            if len(self.client_buffer) < 5:
                return

            message_type = bytes(self.client_buffer[0:1])
            length = struct.unpack("!I", self.client_buffer[1:5])[0]
            total_length = 1 + length

            if length < 4:
                self.client_writer.write(build_pg_error("Invalid PostgreSQL message length."))
                await self.client_writer.drain()
                self.client_buffer.clear()
                return

            if len(self.client_buffer) < total_length:
                return

            raw_message = bytes(self.client_buffer[:total_length])
            payload = bytes(self.client_buffer[5:total_length])
            del self.client_buffer[:total_length]

            if self.suppress_until_sync:
                # S = Sync. End the blocked extended-query sequence and put the
                # frontend connection back into ReadyForQuery state without forwarding
                # the dangerous sequence to the target database.
                if message_type == b"S":
                    print(f"[proxy] suppressed extended sequence until Sync: {self.suppress_reason}")
                    self.suppress_until_sync = False
                    reason = self.suppress_reason or "SQLWatcher blocked extended query."
                    self.suppress_reason = ""
                    self.client_writer.write(build_pg_error(reason))
                    await self.client_writer.drain()
                continue

            # Q = Simple Query message. It contains textual SQL.
            if message_type == b"Q":
                sql = extract_simple_query(payload)
                db_user, inspected_sql = split_logical_user_tag(sql)
                decision = await inspect_sql(inspected_sql, self.client_ip, "postgres_simple_query", db_user)
                action = decision.get("action", "ALLOW")

                print(f"[proxy] simple query user={db_user} action={action} risk={decision.get('risk_score')} sql={inspected_sql[:120]!r}")

                if FAST_LOCAL_DETECTION:
                    await schedule_record_decision(inspected_sql, self.client_ip, decision, db_user)

                if action == "BLOCK":
                    explanation = decision.get("explanation", "SQLWatcher blocked this query.")
                    self.client_writer.write(build_pg_error(f"SQLWatcher blocked query: {explanation}"))
                    await self.client_writer.drain()
                    continue

                self.target_writer.write(raw_message)
                await self.target_writer.drain()
                continue

            # P = Parse message from the extended query protocol.
            if message_type == b"P":
                await self.handle_parse(raw_message, payload)
                continue

            # B = Bind message. Associate portal with statement and block if the
            # corresponding statement was blocked during Parse.
            if message_type == b"B":
                await self.handle_bind(raw_message, payload)
                continue

            # E = Execute message. Block if the portal maps to a blocked statement.
            if message_type == b"E":
                await self.handle_execute(raw_message, payload)
                continue

            # C = Close. Keep local state clean for prepared statements/portals.
            if message_type == b"C":
                self.handle_close(payload)

            self.target_writer.write(raw_message)
            await self.target_writer.drain()

    async def handle_parse(self, raw_message: bytes, payload: bytes) -> None:
        try:
            statement_name, sql = parse_extended_parse_payload(payload)
        except Exception as exc:
            self.client_writer.write(build_pg_error(f"SQLWatcher proxy could not parse extended Parse message: {exc}"))
            await self.client_writer.drain()
            return

        key = statement_name or ""
        db_user, inspected_sql = split_logical_user_tag(sql)
        decision = await inspect_sql(inspected_sql, self.client_ip, "postgres_extended_parse", db_user)
        self.prepared_statement_decisions[key] = decision
        self.prepared_statement_sql[key] = inspected_sql
        self.prepared_statement_db_users[key] = db_user

        action = decision.get("action", "ALLOW")
        print(f"[proxy] extended Parse user={db_user} statement={statement_name!r} action={action} risk={decision.get('risk_score')} sql={inspected_sql[:120]!r}")

        # For extended protocol, log per Execute, not per Parse. Many real drivers
        # reuse parsed/prepared statements, so Parse count is not equal to execution count.
        # BLOCK is the exception because the sequence is suppressed before Execute.
        if action == "BLOCK":
            if FAST_LOCAL_DETECTION:
                await schedule_record_decision(inspected_sql, self.client_ip, decision, db_user)
            explanation = decision.get("explanation", "SQLWatcher blocked this prepared query.")
            self.suppress_until_sync = True
            self.suppress_reason = f"SQLWatcher blocked prepared query: {explanation}"
            return

        self.target_writer.write(raw_message)
        await self.target_writer.drain()

    async def handle_bind(self, raw_message: bytes, payload: bytes) -> None:
        try:
            portal_name, statement_name = parse_bind_payload(payload)
        except Exception as exc:
            self.client_writer.write(build_pg_error(f"SQLWatcher proxy could not parse extended Bind message: {exc}"))
            await self.client_writer.drain()
            return

        portal_key = portal_name or ""
        statement_key = statement_name or ""
        self.portal_to_statement[portal_key] = statement_key

        decision = self.prepared_statement_decisions.get(statement_key)
        if decision and decision.get("action") == "BLOCK":
            explanation = decision.get("explanation", "SQLWatcher blocked this prepared query.")
            self.suppress_until_sync = True
            self.suppress_reason = f"SQLWatcher blocked prepared query during Bind: {explanation}"
            return

        self.target_writer.write(raw_message)
        await self.target_writer.drain()

    async def handle_execute(self, raw_message: bytes, payload: bytes) -> None:
        try:
            portal_name = parse_execute_payload(payload)
        except Exception as exc:
            self.client_writer.write(build_pg_error(f"SQLWatcher proxy could not parse extended Execute message: {exc}"))
            await self.client_writer.drain()
            return

        portal_key = portal_name or ""
        statement_key = self.portal_to_statement.get(portal_key, "")
        decision = self.prepared_statement_decisions.get(statement_key)

        if decision and decision.get("action") == "BLOCK":
            explanation = decision.get("explanation", "SQLWatcher blocked this prepared query.")
            self.suppress_until_sync = True
            self.suppress_reason = f"SQLWatcher blocked prepared query during Execute: {explanation}"
            return

        # Log each actual Execute, not only Parse. This makes dashboard query_logs
        # represent real query executions during prepared-statement workloads.
        if FAST_LOCAL_DETECTION and decision:
            sql = self.prepared_statement_sql.get(statement_key, f"<prepared statement {statement_key or '<unnamed>'}>")
            db_user = self.prepared_statement_db_users.get(statement_key, "proxy_user")
            exec_decision = dict(decision)
            exec_decision["protocol_mode"] = "postgres_extended_execute"
            await schedule_record_decision(sql, self.client_ip, exec_decision, db_user)

        self.target_writer.write(raw_message)
        await self.target_writer.drain()

    def handle_close(self, payload: bytes) -> None:
        # Close message payload:
        # - type byte: 'S' statement or 'P' portal
        # - name: C string
        if len(payload) < 2:
            return

        close_type = bytes(payload[0:1])
        try:
            name, _ = read_cstring(payload, 1)
        except Exception:
            return

        key = name or ""
        if close_type == b"S":
            self.prepared_statement_decisions.pop(key, None)
            self.prepared_statement_sql.pop(key, None)
            self.prepared_statement_db_users.pop(key, None)
        elif close_type == b"P":
            self.portal_to_statement.pop(key, None)

    async def server_to_client(self) -> None:
        while True:
            data = await self.target_reader.read(65536)
            if not data:
                break

            if not self.startup_complete:
                data = self.process_server_startup_data(data)
                if not data:
                    continue

            self.client_writer.write(data)
            await self.client_writer.drain()

    def process_server_startup_data(self, data: bytes) -> bytes:
        self.server_buffer.extend(data)
        output = bytearray()

        while len(self.server_buffer) >= 5:
            message_type = bytes(self.server_buffer[0:1])
            length = struct.unpack("!I", self.server_buffer[1:5])[0]
            total_length = 1 + length

            if length < 4:
                output.extend(build_pg_error("Invalid PostgreSQL server message length."))
                self.server_buffer.clear()
                break

            if len(self.server_buffer) < total_length:
                break

            raw_message = bytes(self.server_buffer[:total_length])
            del self.server_buffer[:total_length]

            if message_type == b"R":
                raw_message = filter_authentication_sasl_mechanisms(raw_message)

            output.extend(raw_message)

            # Z = ReadyForQuery. The first ReadyForQuery after auth means startup is complete.
            if message_type == b"Z":
                self.startup_complete = True
                self.server_buffer.clear()
                print(f"[proxy] startup complete for {self.client_addr}")
                break

        return bytes(output)



async def connect_target_database() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    """Connect to target PostgreSQL and optionally upgrade proxy->target to TLS.

    PostgreSQL uses SSLRequest negotiation before TLS. This keeps client->proxy
    plaintext for inspection while allowing proxy->cloud-db TLS.
    """
    reader, writer = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)

    if TARGET_SSL_MODE in {"require", "verify-ca", "verify-full"}:
        writer.write(struct.pack("!II", 8, 80877103))
        await writer.drain()
        response = await reader.readexactly(1)
        if response != b"S":
            writer.close()
            await writer.wait_closed()
            raise RuntimeError("Target PostgreSQL server refused SSLRequest.")
        context = ssl.create_default_context()
        if TARGET_SSL_MODE == "require":
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        await writer.start_tls(context, server_hostname=TARGET_HOST)

    return reader, writer

async def handle_client(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
    try:
        target_reader, target_writer = await connect_target_database()
    except Exception as exc:
        client_writer.write(build_pg_error(f"SQLWatcher proxy could not connect to target database: {exc}"))
        await client_writer.drain()
        client_writer.close()
        return

    session = ProxySession(client_reader, client_writer, target_reader, target_writer)
    await session.run()


async def main() -> None:
    if BACKGROUND_RECORDING:
        start_record_workers()

    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT)

    sockets = ", ".join(str(sock.getsockname()) for sock in server.sockets or [])
    print(f"[proxy] SQLWatcher PostgreSQL proxy listening on {sockets}")
    print(f"[proxy] target database: {TARGET_HOST}:{TARGET_PORT} sslmode={TARGET_SSL_MODE}")
    print(f"[proxy] backend inspect API: {BACKEND_URL}/api/proxy/inspect")
    print("[proxy] Phase 7.4 supports proxy-local fast detection, background recording, and Extended Query enforcement.")
    print(f"[proxy] fast local detection: {FAST_LOCAL_DETECTION}; background recording: {BACKGROUND_RECORDING}")
    print(f"[proxy] record workers: {RECORD_SEMAPHORE_SIZE}; pending queue cap: {PROXY_RECORD_MAX_PENDING}")

    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[proxy] stopped")
