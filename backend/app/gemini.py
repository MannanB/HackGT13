from __future__ import annotations

import json
import math
import ssl
import time
import urllib.error
import urllib.request
from typing import Any

import certifi
from fastapi import HTTPException

from app.config import get_settings

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

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


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _gemini_post(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
    models = [settings.gemini_model, "gemini-3.5-flash", "gemini-2.5-flash"]
    last_error = "Gemini request failed"
    seen: set[str] = set()
    for model in models:
        if model in seen:
            continue
        seen.add(model)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={settings.gemini_api_key}"
        )
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60, context=SSL_CONTEXT) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_error = exc.read().decode("utf-8", errors="replace")[:800]
            if exc.code not in {400, 404, 429, 500, 503}:
                raise HTTPException(status_code=502, detail=f"Gemini request failed: {last_error}") from exc
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail="Could not reach Gemini") from exc
    raise HTTPException(status_code=502, detail=f"Gemini request failed: {last_error}")


def _parts(body: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = body.get("candidates") or []
    if not candidates:
        return []
    content = candidates[0].get("content") or {}
    return content.get("parts") or []


def _function_call(parts: list[dict[str, Any]]) -> dict[str, Any] | None:
    for part in parts:
        call = part.get("functionCall") or part.get("function_call")
        if call:
            return call
    return None


def _text_from_parts(parts: list[dict[str, Any]]) -> str:
    chunks = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(chunk.strip() for chunk in chunks if chunk.strip())


def _resolve_station(token: str, catalog: list[dict[str, Any]]) -> dict[str, Any] | None:
    needle = token.strip().lower()
    by_id = {str(row["id"]).lower(): row for row in catalog}
    if needle in by_id:
        return by_id[needle]
    for row in catalog:
        name = str(row.get("name", "")).lower()
        if needle == name or needle in name or name in needle:
            return row
    return None


def _normalize_event(raw: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    lat = float(raw.get("center_latitude") or raw.get("centerLatitude") or 33.780)
    lon = float(raw.get("center_longitude") or raw.get("centerLongitude") or -84.386)
    radius = max(0.4, min(20.0, float(raw.get("radius_km") or raw.get("radiusKm") or 3)))
    impacts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw.get("station_impacts") or raw.get("stationImpacts") or []:
        token = str(item.get("station_id") or item.get("stationId") or "")
        station = _resolve_station(token, catalog)
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
        station = _resolve_station(str(item.get("station_id") or item.get("stationId") or ""), catalog)
        if not station:
            continue
        repairs.append({"stationId": station["id"], "stationName": station["name"], "why": str(item.get("why") or "")})
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


def interpret_event(event: str, stations: list[dict[str, Any]]) -> dict[str, Any]:
    catalog_lines = [
        f"- {row['id']} | {row['name']} | {','.join(row.get('lines') or [])} | {row['latitude']:.4f},{row['longitude']:.4f}"
        for row in stations
    ]
    user_text = (
        "MARTA station catalog (id | name | lines | lat,lng):\n"
        + "\n".join(catalog_lines)
        + "\n\nEvent description:\n"
        + event.strip()
    )
    first = _gemini_post(
        {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "tools": [{"functionDeclarations": [SIMULATE_EVENT_TOOL]}],
            "toolConfig": {
                "functionCallingConfig": {
                    "mode": "ANY",
                    "allowedFunctionNames": ["simulate_urban_event"],
                }
            },
        }
    )
    call = _function_call(_parts(first))
    if not call:
        raise HTTPException(status_code=502, detail="Gemini did not call simulate_urban_event")
    args = call.get("args") or call.get("arguments") or {}
    if isinstance(args, str):
        args = json.loads(args)
    event_model = _normalize_event(args, stations)
    call_id = call.get("id")
    function_response: dict[str, Any] = {
        "name": "simulate_urban_event",
        "response": {
            "ok": True,
            "stationsApplied": len(event_model["stationImpacts"]),
            "message": "Scenario loaded into the MARTA simulator.",
        },
    }
    if call_id:
        function_response["id"] = call_id
    second = _gemini_post(
        {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {"role": "user", "parts": [{"text": user_text}]},
                {"role": "model", "parts": first.get("candidates", [{}])[0].get("content", {}).get("parts", [])},
                {"role": "user", "parts": [{"functionResponse": function_response}]},
            ],
            "tools": [{"functionDeclarations": [SIMULATE_EVENT_TOOL]}],
        }
    )
    narrative = _text_from_parts(_parts(second)) or event_model["summary"]
    return {"narrative": narrative, "event": event_model}
