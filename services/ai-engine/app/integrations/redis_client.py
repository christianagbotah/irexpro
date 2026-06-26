"""Redis client factory for the AI engine."""
from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: aioredis.Redis | None = None


async def get_redis_client() -> aioredis.Redis | None:
    """Get or create the async Redis client. Returns None if Redis is unavailable."""
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    try:
        client = aioredis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password,
            db=settings.redis_db,
            decode_responses=True,
            socket_connect_timeout=3,
        )
        await client.ping()
        _client = client
        logger.info("Redis client connected", host=settings.redis_host, db=settings.redis_db)
        return _client
    except Exception as e:
        logger.warning("Redis unavailable — cache disabled", error=str(e))
        return None


async def close_redis_client() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
