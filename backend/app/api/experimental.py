"""Read-only, file-backed data used by the ripple experiment."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/experimental", tags=["experimental"])
CONTEXT_PATH = Path(__file__).resolve().parents[2] / "data" / "experimental" / "context.json"


@router.get("/context")
def experimental_context() -> dict:
    if not CONTEXT_PATH.exists():
        return {
            "available": False,
            "metadata": {"experimental": True, "databaseWrites": False},
            "zones": {},
            "flows": [],
            "employmentCenters": [],
            "poiEnrichment": [],
        }
    payload = json.loads(CONTEXT_PATH.read_text(encoding="utf-8"))
    # OD pairs stay on the backend for later trace/aggregation endpoints.  The
    # map only needs per-origin demand and employment centers.
    flows = payload.pop("flows", [])
    payload.setdefault("metadata", {})["localFlowCount"] = len(flows)
    return payload
