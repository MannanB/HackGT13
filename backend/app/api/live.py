import json
import logging
import ssl
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/live", tags=["live"])

FEED = (
    "https://developerservices.itsmarta.com:18096"
    "/itsmarta/railrealtimearrivals/developerservices/traindata"
)


@router.get("/trains")
def live_trains() -> dict:
    try:
        # MARTA serves this feed on a nonstandard port whose issuer isn't in the
        # default Python trust store (curl succeeds; urllib does not).
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(FEED, timeout=8, context=context) as response:
            rows = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("MARTA live feed failed: %s", exc)
        raise HTTPException(status_code=502, detail="MARTA live feed unavailable") from exc

    trains: dict[str, dict] = {}
    for row in rows:
        lat = row.get("LATITUDE")
        lon = row.get("LONGITUDE")
        train_id = row.get("TRAIN_ID")
        if not train_id or not lat or not lon:
            continue
        waiting = int(row.get("WAITING_SECONDS") or 0)
        current = trains.get(train_id)
        if current and waiting >= current["waitingSeconds"]:
            continue
        trains[train_id] = {
            "id": train_id,
            "line": str(row.get("LINE", "")).lower(),
            "destination": row.get("DESTINATION") or "",
            "nextStation": row.get("STATION") or "",
            "direction": row.get("DIRECTION") or "",
            "latitude": float(lat),
            "longitude": float(lon),
            "waitingSeconds": waiting,
            "realtime": row.get("IS_REALTIME") == "true",
        }
    return {"trains": list(trains.values())}
