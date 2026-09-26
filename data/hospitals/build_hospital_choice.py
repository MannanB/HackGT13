"""Download CMS Hospital Service Area discharges and keep the Atlanta training table.

The served choice model is not fit to this file. The table is the target a later
fit will match: for each Atlanta ZIP, the share of Medicare inpatient discharges
across the hospitals already on the map.
"""

from __future__ import annotations

import csv
import json
import ssl
import sys
import urllib.request
from pathlib import Path

try:
    import certifi
except ImportError:  # pragma: no cover - system Python may already have usable CA roots
    certifi = None

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_hospital_beds import OSM_TO_CCN

RAW_DIR = Path(__file__).resolve().parent / "raw"
OUTPUT = Path(__file__).resolve().parent / "atlanta_medicare_origins.json"
HSA_URL = (
    "https://data.cms.gov/sites/default/files/2025-07/"
    "8fca1932-adaa-411d-a912-78fb0854a286/Hospital_Service_Area_2024.csv"
)
ATLANTA_PREFIXES = ("300", "301", "302", "303", "311")


def download(url: str, destination: Path) -> None:
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "HackGT13 data builder"})
    context = ssl.create_default_context(cafile=certifi.where() if certifi else None)
    with urllib.request.urlopen(request, context=context) as response, destination.open("wb") as output:
        output.write(response.read())


def main() -> None:
    source = RAW_DIR / "Hospital_Service_Area_2024.csv"
    download(HSA_URL, source)
    wanted = set(OSM_TO_CCN.values())
    rows: list[dict[str, str | int]] = []
    with source.open(newline="", encoding="utf-8-sig") as handle:
        for record in csv.DictReader(handle):
            ccn = (record.get("MEDICARE_PROV_NUM") or "").strip()
            zip_code = (record.get("ZIP_CD_OF_RESIDENCE") or "").strip()
            cases = (record.get("TOTAL_CASES") or "").strip()
            if ccn not in wanted or not zip_code.startswith(ATLANTA_PREFIXES) or not cases.isdigit():
                continue
            discharges = int(cases)
            if discharges <= 0:
                continue
            rows.append({"ccn": ccn, "zip": zip_code, "discharges": discharges})
    rows.sort(key=lambda row: (str(row["zip"]), str(row["ccn"])))
    payload = {
        "source": "CMS Hospital Service Area, calendar year 2024",
        "sourceUrl": HSA_URL,
        "features": ["travel_minutes", "log_beds", "occupancy"],
        "target": (
            "Share of Medicare inpatient discharges from each Atlanta ZIP "
            "across the hospitals already on the map"
        ),
        "loss": "cross_entropy",
        "notes": [
            "CMS suppresses small ZIP-hospital counts as '*'; those rows are omitted.",
            "The choice set is the app's hand-matched hospitals, not every hospital in the file.",
            "Zones in the simulator are census areas. This table trains ZIP-level shares; inference uses travel time, beds, and occupancy.",
        ],
        "rows": rows,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(rows)} ZIP-hospital rows")


if __name__ == "__main__":
    main()
