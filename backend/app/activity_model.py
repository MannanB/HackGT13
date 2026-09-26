"""Serve the trained Atlanta day model."""

from __future__ import annotations

import json
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parents[2] / "data" / "activity" / "atlanta_day_model.json"


def model_payload() -> dict:
    if not MODEL_PATH.exists():
        return {
            "name": "atlanta_day",
            "kind": "activity_rate",
            "trained": False,
            "features": [],
            "categories": [],
            "bias": [],
            "sensitivity": [],
            "makeupWeights": [],
        }
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))
