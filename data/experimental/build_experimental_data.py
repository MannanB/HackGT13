"""Build a file-backed experimental overlay without writing to PostgreSQL.

Sources:
* Census ACS 2024 5-year detailed tables (block-group demographics)
* Census LODES 8.4 2023 OD/WAC files (commutes and workplace jobs)
* OpenStreetMap (hours and capacity-like tags on the existing POI universe)

The generated JSON is read by ``/api/v1/experimental/context``.  It can be
deleted at any time to return the application to its database-only behavior.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import logging
import math
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import requests

DATA_DIR = Path(__file__).resolve().parents[1]
ROOT = DATA_DIR.parent
BACKEND = ROOT / "backend"
OUTPUT = BACKEND / "data" / "experimental" / "context.json"
RAW_DIR = Path(__file__).resolve().parent / "raw"
LODES_ROOT = "https://lehd.ces.census.gov/data/lodes/LODES8/ga"
LODES_YEAR = 2023
NCES_YEAR = "2023-24"
NCES_MEMBERSHIP_URL = (
    "https://nces.ed.gov/ccd/Data/zip/ccd_sch_052_2324_l_1a_073124.zip"
)
TARGET_COUNTIES = {"13089", "13121"}  # DeKalb and Fulton

sys.path.insert(0, str(DATA_DIR / "residentials"))
sys.path.insert(0, str(DATA_DIR / "poi"))

from fetch_acs import fetch_acs  # noqa: E402
from fetch_block_groups import load_block_groups  # noqa: E402
from fetch_pois import SOURCE as POI_SOURCE, fetch_pois  # noqa: E402

logger = logging.getLogger(__name__)


def _download(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0:
        logger.info("Using cached %s", destination)
        return destination
    temporary = destination.with_suffix(destination.suffix + ".part")
    logger.info("Downloading %s", url)
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with temporary.open("wb") as handle:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    handle.write(chunk)
    temporary.replace(destination)
    return destination


def _lodes_file(kind: str) -> Path:
    if kind == "od":
        name = f"ga_od_main_JT00_{LODES_YEAR}.csv.gz"
        url = f"{LODES_ROOT}/od/{name}"
    else:
        name = f"ga_wac_S000_JT00_{LODES_YEAR}.csv.gz"
        url = f"{LODES_ROOT}/wac/{name}"
    return _download(url, RAW_DIR / name)


def build_lodes(zone_points: dict[str, tuple[float, float]]) -> dict:
    commute_jobs: defaultdict[str, int] = defaultdict(int)
    local_flows: defaultdict[tuple[str, str], int] = defaultdict(int)
    with gzip.open(_lodes_file("od"), "rt", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            home = row["h_geocode"][:12]
            if home[:5] not in TARGET_COUNTIES:
                continue
            work = row["w_geocode"][:12]
            jobs = int(row["S000"])
            commute_jobs[home] += jobs
            if work[:5] in TARGET_COUNTIES:
                local_flows[(home, work)] += jobs

    workplace_jobs: defaultdict[str, int] = defaultdict(int)
    with gzip.open(_lodes_file("wac"), "rt", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            work = row["w_geocode"][:12]
            if work[:5] in TARGET_COUNTIES:
                workplace_jobs[work] += int(row["C000"])

    centers = []
    for zone_id, jobs in workplace_jobs.items():
        point = zone_points.get(zone_id)
        # Keep meaningful employment hubs in the browser graph. The complete
        # WAC totals remain in the backend artifact.
        if point is None or jobs < 1000:
            continue
        centers.append(
            {
                "id": f"lodes-{zone_id}",
                "source": "census-lodes",
                "sourceId": f"work-bg-{zone_id}-{LODES_YEAR}",
                "name": f"Employment center {zone_id[-4:]}",
                "category": "employment",
                "latitude": point[1],
                "longitude": point[0],
                "jobsCount": jobs,
                "capacity": jobs,
            }
        )

    return {
        "vintage": LODES_YEAR,
        "commuteJobs": dict(commute_jobs),
        "flows": [
            {"homeZoneId": home, "workZoneId": work, "jobs": jobs}
            for (home, work), jobs in local_flows.items()
        ],
        "employmentCenters": centers,
    }


def _normalized_name(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.casefold()))


def build_nces_enrollment() -> dict[str, int]:
    """Return Georgia public-school enrollment keyed by normalized school name.

    NCES publishes the membership file as a large national ZIP, so this import
    is opt-in. Only Georgia education-unit total rows are retained.
    """
    archive = _download(NCES_MEMBERSHIP_URL, RAW_DIR / "nces_membership_2023_24.zip")
    enrollment: dict[str, int] = {}
    with zipfile.ZipFile(archive) as package:
        member = next(name for name in package.namelist() if name.lower().endswith(".csv"))
        with package.open(member) as raw:
            lines = (line.decode("utf-8-sig") for line in raw)
            for row in csv.DictReader(lines):
                if row.get("ST") != "GA":
                    continue
                indicator = (row.get("TOTAL_INDICATOR") or "").casefold()
                if "education unit total" not in indicator:
                    continue
                try:
                    count = int(row.get("STUDENT_COUNT") or "0")
                except ValueError:
                    continue
                if count > 0:
                    name = _normalized_name(row.get("SCH_NAME") or "")
                    if name:
                        enrollment[name] = max(count, enrollment.get(name, 0))
    logger.info("Loaded enrollment for %s Georgia public schools from NCES", len(enrollment))
    return enrollment


def build_poi_enrichment(nces_enrollment: dict[str, int] | None = None) -> list[dict]:
    def clean(value):
        if isinstance(value, float) and math.isnan(value):
            return None
        return value

    records = []
    for poi in fetch_pois().itertuples(index=False):
        enrollment = clean(poi.enrollment)
        if enrollment is None and nces_enrollment and poi.category == "school":
            enrollment = nces_enrollment.get(_normalized_name(poi.name))
        capacity = clean(poi.capacity) or enrollment
        records.append(
            {
                "source": POI_SOURCE,
                "sourceId": poi.source_id,
                "openingHours": clean(poi.opening_hours),
                "capacity": capacity,
                "enrollment": enrollment,
            }
        )
    return records


def build(*, include_pois: bool = True, include_nces: bool = False) -> Path:
    block_groups = load_block_groups()
    points = {
        str(row.GEOID): (float(row.origin_lon), float(row.origin_lat))
        for row in block_groups.itertuples(index=False)
    }
    demographics = fetch_acs()
    lodes = build_lodes(points)
    zones = {}
    for zone_id, row in demographics.items():
        values = {key: value for key, value in row.items() if key not in {"GEOID", "name"}}
        values["commute_jobs"] = lodes["commuteJobs"].get(zone_id, 0)
        zones[zone_id] = values

    payload = {
        "available": True,
        "metadata": {
            "experimental": True,
            "acsVintage": 2024,
            "lodesVintage": LODES_YEAR,
            "databaseWrites": False,
        },
        "zones": zones,
        "flows": lodes["flows"],
        "employmentCenters": lodes["employmentCenters"],
        "poiEnrichment": (
            build_poi_enrichment(build_nces_enrollment() if include_nces else None)
            if include_pois
            else []
        ),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.part")
    temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temporary.replace(OUTPUT)
    logger.info("Wrote experimental overlay to %s", OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-pois", action="store_true", help="Skip the slower OSM refresh")
    parser.add_argument(
        "--with-nces",
        action="store_true",
        help="Download the large NCES membership ZIP and match school enrollment",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(build(include_pois=not args.skip_pois, include_nces=args.with_nces))
