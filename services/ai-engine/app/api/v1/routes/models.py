"""Model registry endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.domain.models.registry import ModelRegistry

router = APIRouter()


def get_registry() -> ModelRegistry:
    from app.main import app_state
    return app_state["registry"]


@router.get("/models/active", tags=["Models"])
async def get_active_model(registry: ModelRegistry = Depends(get_registry)) -> dict:
    model = registry.get_active_model()
    return model.get_model_metadata()


@router.get("/models", tags=["Models"])
async def list_models(registry: ModelRegistry = Depends(get_registry)) -> list[dict]:
    return registry.list_models()
