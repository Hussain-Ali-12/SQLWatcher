import json
import os
from dotenv import load_dotenv

load_dotenv()

# SecureShop reads final connection URLs from docker-compose.yml. Compose builds
# these URLs from the single root .env values so passwords are edited in one place.
DIRECT_DATABASE_URL = os.getenv(
    "DIRECT_DATABASE_URL",
    "postgresql://appuser:apppass123@localhost:5433/appdb?sslmode=disable",
)
SQLWATCHER_PROXY_DATABASE_URL = os.getenv(
    "SQLWATCHER_PROXY_DATABASE_URL",
    "postgresql://appuser:apppass123@localhost:15432/appdb?sslmode=disable",
)
DEFAULT_CONNECTION_MODE = os.getenv("DEFAULT_CONNECTION_MODE", "proxy").lower().strip()
def _parse_origins(raw: str | None) -> list[str]:
    value = (raw or "http://localhost:5174,http://127.0.0.1:5174").strip()
    # Be forgiving when a platform UI value is accidentally pasted as KEY=value.
    if value.startswith("CORS_ORIGINS="):
        value = value.split("=", 1)[1].strip()
    if value.startswith("["):
        try:
            decoded = json.loads(value)
            if isinstance(decoded, list):
                return [str(origin).strip() for origin in decoded if str(origin).strip()]
        except json.JSONDecodeError:
            pass
    return [origin.strip().strip('\"\'') for origin in value.split(",") if origin.strip().strip('\"\'')]


CORS_ORIGINS = _parse_origins(os.getenv("CORS_ORIGINS"))
