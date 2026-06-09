from __future__ import annotations

from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger(__name__)

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from app.core.config import FRONTEND_ORIGINS  # noqa: E402
from app.core.database import close_db_pool, get_control_pool, init_db_pool  # noqa: E402
from app.core.migrations.runner import run_migrations  # noqa: E402
from app.core.middleware import request_id_middleware, security_headers_middleware  # noqa: E402
from app.routes.admin import router as admin_router  # noqa: E402
from app.routes.audit import router as audit_router  # noqa: E402
from app.routes.auth import router as auth_router  # noqa: E402
from app.routes.diagnostics import router as diagnostics_router  # noqa: E402
from app.routes.logs import router as logs_router  # noqa: E402
from app.routes.ml import router as ml_router  # noqa: E402
from app.routes.notifications import router as notifications_router  # noqa: E402
from app.routes.queries import router as queries_router  # noqa: E402
from app.routes.rules import router as rules_router  # noqa: E402
from app.routes.settings import router as settings_router  # noqa: E402
from app.routes.stats import router as stats_router  # noqa: E402
from app.routes.ws import router as ws_router  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup_begin")
    await init_db_pool()
    await run_migrations(get_control_pool())
    logger.info("startup_complete")
    try:
        yield
    finally:
        logger.info("shutdown_begin")
        await close_db_pool()
        logger.info("shutdown_complete")


app = FastAPI(
    title="SQLWatcher API",
    description="Real-Time Database Firewall with Intelligent Query Analysis and Analyst Dashboard",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_id_middleware)
app.middleware("http")(security_headers_middleware)


@app.get("/")
async def root():
    return {
        "project": "SQLWatcher",
        "status": "running",
        "version": "2.0.0",
        "phase": "Backend core infrastructure redesign",
        "docs": "/docs",
    }


app.include_router(auth_router)
app.include_router(stats_router)
app.include_router(queries_router)
app.include_router(logs_router)
app.include_router(rules_router)
app.include_router(ml_router)
app.include_router(notifications_router)
app.include_router(audit_router)
app.include_router(admin_router)
app.include_router(settings_router)
app.include_router(diagnostics_router)
app.include_router(ws_router)
