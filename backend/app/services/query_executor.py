from app.core.database import target_fetch, target_execute
from shared.sql.parser import get_query_type

RESULT_RETURNING_TYPES = {"SELECT", "WITH", "SHOW"}

async def execute_safe_query(sql: str) -> list[dict]:
    """Execute inspected client SQL against the protected target application DB.

    SQLWatcher metadata is stored separately in the control-plane DB. This function
    must not use the control-plane DB because user/application queries should never
    run against SQLWatcher's internal security database.
    """
    query_type = get_query_type(sql)
    if query_type in RESULT_RETURNING_TYPES:
        rows = await target_fetch(sql)
        return [dict(row) for row in rows]

    status = await target_execute(sql)
    return [{"command_status": status}]
