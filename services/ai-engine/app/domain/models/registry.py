"""
ModelRegistry — manages available model versions and governance state.

RULES:
- register_model() requires a governance record.
- No model is approved for live trading by default.
- get_active_model() returns the currently active model.
- rollback_model() switches the active model to a previous version.
- Live trading requires explicit approval via approve_for_live() — future sprint.
"""
from __future__ import annotations

from app.core.errors import ModelNotFoundError
from app.core.logging import get_logger
from app.domain.models.baseline_xgboost import BaselineXGBoostModel
from app.domain.models.governance import create_baseline_governance
from app.domain.models.schemas import ModelGovernanceMetadata

logger = get_logger(__name__)


class ModelRegistry:
    """
    In-memory model registry.
    Manages model instances and their governance metadata.
    Persisted registry (database-backed) planned for Sprint 9+.
    """

    def __init__(self) -> None:
        self._models: dict[str, BaselineXGBoostModel] = {}
        self._governance: dict[str, ModelGovernanceMetadata] = {}
        self._active_version: str | None = None

    def register_model(
        self,
        model: BaselineXGBoostModel,
        governance: ModelGovernanceMetadata,
    ) -> None:
        """Register a model with its governance metadata."""
        version = model.get_model_version()
        self._models[version] = model
        self._governance[version] = governance
        if self._active_version is None:
            self._active_version = version
        logger.info("Model registered", version=version, approved_for_live=governance.approved_for_live)

    def get_active_model(self) -> BaselineXGBoostModel:
        if self._active_version is None or self._active_version not in self._models:
            raise ModelNotFoundError("No active model registered")
        return self._models[self._active_version]

    def get_model_by_version(self, version: str) -> BaselineXGBoostModel:
        if version not in self._models:
            raise ModelNotFoundError(f"Model version '{version}' not found")
        return self._models[version]

    def rollback_model(self, version: str) -> None:
        if version not in self._models:
            raise ModelNotFoundError(f"Cannot rollback to unknown version '{version}'")
        logger.warning("Model rollback", from_version=self._active_version, to_version=version)
        self._active_version = version

    def list_models(self) -> list[dict]:
        return [
            {
                "version": v,
                "active": v == self._active_version,
                "approved_for_paper": self._governance[v].approved_for_paper,
                "approved_for_live": self._governance[v].approved_for_live,
                "validation_status": self._governance[v].validation_status,
            }
            for v in self._models
        ]

    def get_governance(self, version: str) -> ModelGovernanceMetadata:
        if version not in self._governance:
            raise ModelNotFoundError(f"Governance record for '{version}' not found")
        return self._governance[version]


def build_default_registry() -> ModelRegistry:
    """Build and return the default registry with the baseline model registered."""
    registry = ModelRegistry()
    model = BaselineXGBoostModel()
    model.load_model()  # No-op if no model file — uses heuristic placeholder
    governance = create_baseline_governance()
    registry.register_model(model, governance)
    return registry
