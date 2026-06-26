"""Scheduler HTTP endpoints — internal use by NestJS only."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import get_settings
from app.core.security import validate_internal_api_key
from app.domain.scheduler.schemas import (
    SessionSchedulerResponse,
    SessionStartRequest,
    SessionStopRequest,
)
from app.domain.scheduler.signal_scheduler import SignalScheduler

router = APIRouter()

INTERNAL_API_KEY_HEADER = "x-irexpro-internal-api-key"


def get_scheduler() -> SignalScheduler:
    from app.main import app_state

    scheduler: SignalScheduler = app_state["scheduler"]
    return scheduler


async def require_internal_api_key(request: Request) -> None:
    key = request.headers.get(INTERNAL_API_KEY_HEADER, "")
    if not key or not validate_internal_api_key(key):
        raise HTTPException(status_code=401, detail="Invalid or missing internal API key")


@router.post(
    "/scheduler/sessions/start",
    response_model=SessionSchedulerResponse,
    tags=["Scheduler (Internal)"],
    dependencies=[Depends(require_internal_api_key)],
)
async def start_session_scheduler(
    request: SessionStartRequest,
    scheduler: SignalScheduler = Depends(get_scheduler),
) -> SessionSchedulerResponse:
    """
    Register a paper-mode scheduled signal job for a trading session.
    Protected by x-irexpro-internal-api-key.
    """
    settings = get_settings()
    if request.mode != "paper":
        raise HTTPException(status_code=403, detail="Only paper mode is supported")

    if request.source == "mock" and settings.is_production and not settings.ai_allow_mock_market_data:
        raise HTTPException(status_code=403, detail="Mock source is blocked in production")

    registered = scheduler.register_session(request)
    return SessionSchedulerResponse(
        registered=registered,
        trading_session_id=request.trading_session_id,
        message="Session scheduler registered" if registered else "Scheduler disabled or duplicate",
    )


@router.post(
    "/scheduler/sessions/stop",
    response_model=SessionSchedulerResponse,
    tags=["Scheduler (Internal)"],
    dependencies=[Depends(require_internal_api_key)],
)
async def stop_session_scheduler(
    request: SessionStopRequest,
    scheduler: SignalScheduler = Depends(get_scheduler),
) -> SessionSchedulerResponse:
    """Unregister scheduled signal job for a trading session."""
    removed = scheduler.unregister_session(request.trading_session_id)
    return SessionSchedulerResponse(
        registered=removed,
        trading_session_id=request.trading_session_id,
        message="Session scheduler stopped" if removed else "No active scheduler job found",
    )
