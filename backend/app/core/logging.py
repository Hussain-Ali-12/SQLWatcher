from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

from app.core.config import settings


def _add_service_context(_: logging.Logger, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    event_dict.setdefault("service", "sqlwatcher-api")
    event_dict.setdefault("environment", settings.environment)
    return event_dict


def configure_logging() -> None:
    """Configure structlog once for the API process."""

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp")
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _add_service_context,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.log_format == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
        force=True,
    )

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)


def get_logger(name: str):
    """Return a structlog logger bound with a stable logger name."""

    return structlog.get_logger(name).bind(logger_name=name)
