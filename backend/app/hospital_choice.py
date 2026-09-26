"""Untrained hospital choice model.

A later fit minimizes cross-entropy between this conditional logit and CMS
Medicare discharge shares by Atlanta ZIP. Until that fit exists, the weights
are an explicit prior: shorter trips and larger hospitals score higher, and a
fuller hospital scores lower.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

FEATURES = ("travel_minutes", "log_beds", "occupancy")
# One minute of travel costs 1. An e-fold of beds (about 2.7x) is worth 2 minutes.
# Occupancy is a 0-1 rate; 0.2 of occupancy is worth about 1.6 minutes.
WEIGHTS = (-1.0, 2.0, -8.0)
BIAS = 0.0
TRAINED = False

ORIGINS_PATH = Path(__file__).resolve().parents[2] / "data" / "hospitals" / "atlanta_medicare_origins.json"


def utility(travel_minutes: float, beds: float | None, occupancy: float | None) -> float:
    log_beds = math.log(beds) if beds is not None and beds > 0 else 0.0
    occupied = occupancy if occupancy is not None else 0.0
    return WEIGHTS[0] * travel_minutes + WEIGHTS[1] * log_beds + WEIGHTS[2] * occupied + BIAS


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    return float(value)


def probabilities(options: list[dict[str, float | None]]) -> list[float]:
    scores = [
        utility(
            float(option["travel_minutes"] or 0),
            _optional_float(option.get("beds")),
            _optional_float(option.get("occupancy")),
        )
        for option in options
    ]
    if not scores:
        return []
    peak = max(scores)
    weights = [math.exp(score - peak) for score in scores]
    total = sum(weights)
    return [weight / total for weight in weights]


def training_summary() -> dict[str, str | int]:
    empty: dict[str, str | int] = {
        "source": "CMS Hospital Service Area, calendar year 2024",
        "target": (
            "Share of Medicare inpatient discharges from each Atlanta ZIP "
            "across the hospitals already on the map"
        ),
        "loss": "cross_entropy",
        "rows": 0,
        "zips": 0,
        "hospitals": 0,
        "discharges": 0,
    }
    if not ORIGINS_PATH.exists():
        return empty
    payload = json.loads(ORIGINS_PATH.read_text(encoding="utf-8"))
    rows = payload.get("rows") or []
    empty["source"] = str(payload.get("source") or empty["source"])
    empty["rows"] = len(rows)
    empty["zips"] = len({row.get("zip") for row in rows})
    empty["hospitals"] = len({row.get("ccn") for row in rows})
    empty["discharges"] = sum(int(row.get("discharges") or 0) for row in rows)
    return empty


def model_payload() -> dict[str, object]:
    return {
        "name": "hospital_choice",
        "kind": "conditional_logit",
        "trained": TRAINED,
        "features": list(FEATURES),
        "weights": list(WEIGHTS),
        "bias": BIAS,
        "initialization": (
            "Prior, not a fit. Closer hospitals score higher, more beds score higher, "
            "and a fuller hospital scores lower."
        ),
        "training": training_summary(),
    }
