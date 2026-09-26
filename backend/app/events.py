"""Shared urban-event schema and station-catalog normalization."""

from __future__ import annotations

import math
from typing import Any

SIMULATE_EVENT_TOOL = {
    "name": "simulate_urban_event",
    "description": (
        "Translate a natural-language Atlanta disaster or event into a MARTA disruption "
        "scenario the Civic Stacktrace simulator can run. Always call this tool."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Short event title."},
            "summary": {
                "type": "string",
                "description": "2-4 sentences on what broke and why, including cascade effects.",
            },
            "center_latitude": {
                "type": "number",
                "description": "Event epicenter latitude in Atlanta.",
            },
            "center_longitude": {
                "type": "number",
                "description": "Event epicenter longitude in Atlanta.",
            },
            "radius_km": {
                "type": "number",
                "description": "Impact radius in kilometers around the epicenter.",
            },
            "station_impacts": {
                "type": "array",
                "description": "MARTA stations damaged, overcrowded, or cut off. Use station_id from the catalog.",
                "items": {
                    "type": "object",
                    "properties": {
                        "station_id": {"type": "string"},
                        "effect": {
                            "type": "string",
                            "enum": ["shutdown", "maintenance"],
                            "description": "shutdown cuts the line; maintenance blocks boarding only.",
                        },
                        "reason": {"type": "string"},
                    },
                    "required": ["station_id", "effect", "reason"],
                },
            },
            "cascades": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Secondary impacts (crowding, hospitals, buses, power).",
            },
            "recommended_repairs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "station_id": {"type": "string"},
                        "why": {"type": "string"},
                    },
                    "required": ["station_id", "why"],
                },
                "description": "Order stations to restore first for the most recovery.",
            },
            "recommended_facilities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": [
                                "hospital",
                                "clinic",
                                "grocery",
                                "government",
                                "school",
                                "university",
                                "library",
                            ],
                        },
                        "reason": {"type": "string"},
                    },
                    "required": ["category", "reason"],
                },
                "description": "Facilities to add so a similar event hurts fewer people.",
            },
        },
        "required": [
            "title",
            "summary",
            "center_latitude",
            "center_longitude",
            "radius_km",
            "station_impacts",
        ],
    },
}

SYSTEM_PROMPT = """You interpret shocks to Atlanta for Civic Stacktrace, a MARTA access simulator.

Use only the station catalog in the user message. Pick station_id values from that catalog.
Place the epicenter in metro Atlanta. Radius should match event severity (festival ~1-3 km, earthquake ~3-12 km).
Shutdown stations that would lose power, collapse, flood, or be structurally unsafe.
Use maintenance for crowding, debris, or temporary no-boarding where trains could still pass.
Always call simulate_urban_event. Do not answer with plain text instead of the tool.
"""


def event_user_text(event: str, stations: list[dict[str, Any]]) -> str:
    catalog_lines = [
        f"- {row['id']} | {row['name']} | {','.join(row.get('lines') or [])} | {row['latitude']:.4f},{row['longitude']:.4f}"
        for row in stations
    ]
    return (
        "MARTA station catalog (id | name | lines | lat,lng):\n"
        + "\n".join(catalog_lines)
        + "\n\nEvent description:\n"
        + event.strip()
    )


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    chord = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(chord), math.sqrt(1 - chord))


def _catalog_index(
    catalog: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[tuple[str, dict[str, Any]]]]:
    by_id = {str(row["id"]).lower(): row for row in catalog}
    named = [(str(row.get("name", "")).lower(), row) for row in catalog]
    return by_id, named


def _resolve_station(
    token: str,
    by_id: dict[str, dict[str, Any]],
    named: list[tuple[str, dict[str, Any]]],
) -> dict[str, Any] | None:
    needle = token.strip().lower()
    found = by_id.get(needle)
    if found is not None:
        return found
    for name, row in named:
        if needle == name or needle in name or name in needle:
            return row
    return None


def normalize_event(raw: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    by_id, named = _catalog_index(catalog)
    lat = float(raw.get("center_latitude") or raw.get("centerLatitude") or 33.780)
    lon = float(raw.get("center_longitude") or raw.get("centerLongitude") or -84.386)
    radius = max(0.4, min(20.0, float(raw.get("radius_km") or raw.get("radiusKm") or 3)))
    impacts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw.get("station_impacts") or raw.get("stationImpacts") or []:
        token = str(item.get("station_id") or item.get("stationId") or "")
        station = _resolve_station(token, by_id, named)
        if not station or station["id"] in seen:
            continue
        effect = str(item.get("effect") or "shutdown").lower()
        if effect not in {"shutdown", "maintenance"}:
            effect = "shutdown"
        distance = _haversine_km(lat, lon, float(station["latitude"]), float(station["longitude"]))
        if distance > radius * 1.6:
            continue
        seen.add(station["id"])
        impacts.append(
            {
                "stationId": station["id"],
                "stationName": station["name"],
                "effect": effect,
                "reason": str(item.get("reason") or "Impacted by the event."),
            }
        )
    if not impacts:
        nearby = sorted(
            catalog,
            key=lambda row: _haversine_km(lat, lon, float(row["latitude"]), float(row["longitude"])),
        )[:4]
        for station in nearby:
            impacts.append(
                {
                    "stationId": station["id"],
                    "stationName": station["name"],
                    "effect": "maintenance",
                    "reason": "Closest station to the reported epicenter.",
                }
            )
    repairs = []
    for item in raw.get("recommended_repairs") or raw.get("recommendedRepairs") or []:
        station = _resolve_station(str(item.get("station_id") or item.get("stationId") or ""), by_id, named)
        if not station:
            continue
        repairs.append(
            {"stationId": station["id"], "stationName": station["name"], "why": str(item.get("why") or "")}
        )
    facilities = []
    for item in raw.get("recommended_facilities") or raw.get("recommendedFacilities") or []:
        category = str(item.get("category") or "").lower()
        if not category:
            continue
        facilities.append({"category": category, "reason": str(item.get("reason") or "")})
    return {
        "title": str(raw.get("title") or "Atlanta event"),
        "summary": str(raw.get("summary") or ""),
        "centerLatitude": lat,
        "centerLongitude": lon,
        "radiusKm": radius,
        "stationImpacts": impacts,
        "cascades": [str(item) for item in (raw.get("cascades") or []) if str(item).strip()],
        "recommendedRepairs": repairs,
        "recommendedFacilities": facilities,
    }
