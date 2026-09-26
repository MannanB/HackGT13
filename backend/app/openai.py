from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException

from app.config import get_settings
from app.gemini import SIMULATE_EVENT_TOOL, SYSTEM_PROMPT, _normalize_event

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": SIMULATE_EVENT_TOOL["name"],
            "description": SIMULATE_EVENT_TOOL["description"],
            "parameters": SIMULATE_EVENT_TOOL["parameters"],
        },
    }
]


def _openai_post(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    models = [settings.openai_model, "gpt-4o-mini"]
    last_error = "OpenAI request failed"
    seen: set[str] = set()
    for model in models:
        if model in seen:
            continue
        seen.add(model)
        body = {**payload, "model": model}
        request = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.openai_api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_error = exc.read().decode("utf-8", errors="replace")[:800]
            if exc.code not in {404, 400}:
                raise HTTPException(status_code=502, detail=f"OpenAI request failed: {last_error}") from exc
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail="Could not reach OpenAI") from exc
    raise HTTPException(status_code=502, detail=f"OpenAI request failed: {last_error}")


def _assistant_message(body: dict[str, Any]) -> dict[str, Any]:
    choices = body.get("choices") or []
    if not choices:
        return {}
    message = choices[0].get("message") or {}
    return message if isinstance(message, dict) else {}


def _function_call(message: dict[str, Any]) -> dict[str, Any] | None:
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        if function.get("name") == "simulate_urban_event":
            return call
    return None


def _text_from_message(message: dict[str, Any]) -> str:
    content = message.get("content") or ""
    return str(content).strip()


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
    first = _openai_post(
        {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text},
            ],
            "tools": OPENAI_TOOLS,
            "tool_choice": {"type": "function", "function": {"name": "simulate_urban_event"}},
        }
    )
    assistant = _assistant_message(first)
    call = _function_call(assistant)
    if not call:
        raise HTTPException(status_code=502, detail="OpenAI did not call simulate_urban_event")
    args = (call.get("function") or {}).get("arguments") or {}
    if isinstance(args, str):
        args = json.loads(args)
    event_model = _normalize_event(args, stations)
    second = _openai_post(
        {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text},
                assistant,
                {
                    "role": "tool",
                    "tool_call_id": call.get("id") or "simulate_urban_event",
                    "content": json.dumps(
                        {
                            "ok": True,
                            "stationsApplied": len(event_model["stationImpacts"]),
                            "message": "Scenario loaded into the MARTA simulator.",
                        }
                    ),
                },
            ],
            "tools": OPENAI_TOOLS,
        }
    )
    narrative = _text_from_message(_assistant_message(second)) or event_model["summary"]
    return {"narrative": narrative, "event": event_model}
