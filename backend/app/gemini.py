from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException

from app.config import get_settings
from app.events import SIMULATE_EVENT_TOOL, SYSTEM_PROMPT, event_user_text, normalize_event
from app.net import SSL_CONTEXT

_gemini_quota_exhausted = False


def gemini_is_exhausted() -> bool:
    return _gemini_quota_exhausted


def _mark_gemini_exhausted() -> None:
    global _gemini_quota_exhausted
    _gemini_quota_exhausted = True


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
            quota = exc.code == 429 or "RESOURCE_EXHAUSTED" in last_error
            if quota:
                _mark_gemini_exhausted()
                raise HTTPException(status_code=502, detail=f"Gemini request failed: {last_error}") from exc
            if exc.code not in {400, 404, 500, 503}:
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


def interpret_event(event: str, stations: list[dict[str, Any]]) -> dict[str, Any]:
    user_text = event_user_text(event, stations)
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
    event_model = normalize_event(args, stations)
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
