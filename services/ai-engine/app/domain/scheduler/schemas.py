"""Scheduler request/response schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SessionStartRequest(BaseModel):
    user_id: str = Field(..., alias="userId")
    trading_session_id: str = Field(..., alias="tradingSessionId")
    broker_connection_id: str = Field(..., alias="brokerConnectionId")
    instruments: list[str] = Field(..., min_length=1)
    timeframe: str = "H1"
    interval_seconds: int | None = Field(default=None, alias="intervalSeconds")
    source: Literal["broker", "mock"] = "broker"
    mode: Literal["paper"] = "paper"

    model_config = {"populate_by_name": True}


class SessionStopRequest(BaseModel):
    trading_session_id: str = Field(..., alias="tradingSessionId")

    model_config = {"populate_by_name": True}


class SessionSchedulerResponse(BaseModel):
    registered: bool
    trading_session_id: str
    message: str
