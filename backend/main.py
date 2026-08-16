"""Sankat AI FastAPI backend (mobile) — application wiring.

Composes configuration, middleware, and the API routers. All request handling
lives in ``app/api/routes``; business logic in ``app/services``; data access in
``app/repositories``; external systems in ``app/integrations``.

Auto-generated docs are available at /docs (Swagger UI) and /openapi.json.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load local configuration before importing any router or module that imports
# app.core.config. Otherwise the module-level settings retain their defaults,
# which sends profile requests to the wrong DynamoDB configuration.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.consultations import router as consultations_router
from app.api.routes.health import router as health_router
from app.api.routes.profile import router as profile_router
from app.api.routes.security import router as security_router
from app.api.routes.triage import router as triage_router
from app.api.routes.uploads import router as uploads_router
from app.core import config
from app.integrations.aws import dynamo_client

logger = logging.getLogger("sankatai")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # For local dev / DynamoDB Local, create tables if requested.
    if config.DYNAMODB_AUTO_CREATE:
        try:
            dynamo_client.ensure_tables()
            logger.info("DynamoDB tables ensured.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not ensure DynamoDB tables: %s", exc)
    if not config.AUTH_ENABLED:
        logger.warning(
            "AUTH DISABLED (AUTH_ENABLED=false): every request gets a dev identity. "
            "Local development only — never deploy with this unset."
        )
    yield


app = FastAPI(
    title="Sankat AI Backend API",
    version="1.0.0",
    description="Emergency triage backend: health check and AI-based symptom analysis endpoints.",
    lifespan=lifespan,
)

# CORS. Credentials are no longer used (Bearer tokens, no cookies), so
# allow_credentials is off. In the deployed stack API Gateway answers CORS
# preflight; this middleware only matters when running the backend directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routers (feature-by-feature).
app.include_router(health_router)
app.include_router(triage_router)
app.include_router(profile_router)
app.include_router(consultations_router)
app.include_router(security_router)
app.include_router(uploads_router)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "5174"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
