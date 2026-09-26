"""Fetch ACS 5-year population and income for Fulton and DeKalb block groups."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

from fetch_block_groups import COUNTIES

ACS_URL = "https://api.census.gov/data/2024/acs/acs5"
BACKEND_ENV = Path(__file__).resolve().parents[2] / "backend" / ".env"

# Census uses negative sentinels when an estimate is missing or suppressed.
MISSING = {
    "",
    "null",
    "-222222222",
    "-333333333",
    "-666666666",
    "-888888888",
    "-999999999",
}

logger = logging.getLogger(__name__)


def census_api_key() -> str:
    load_dotenv(BACKEND_ENV)
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    if not key:
        raise RuntimeError("CENSUS_API_KEY is missing from backend/.env")
    return key


def parse_population(value: object) -> int:
    if value is None or str(value).strip() in MISSING:
        return 0
    number = int(float(str(value)))
    return number if number >= 0 else 0


def parse_income(value: object) -> int | None:
    if value is None or str(value).strip() in MISSING:
        return None
    number = int(float(str(value)))
    return number if number >= 0 else None


def _geoid(row: dict[str, str]) -> str:
    return (
        str(row["state"]).zfill(2)
        + str(row["county"]).zfill(3)
        + str(row["tract"]).zfill(6)
        + str(row["block group"]).zfill(1)
    )


def fetch_county(county: str, api_key: str) -> list[dict[str, object]]:
    response = requests.get(
        ACS_URL,
        params=[
            ("get", "NAME,B01003_001E,B19013_001E"),
            ("for", "block group:*"),
            ("in", "state:13"),
            ("in", f"county:{county}"),
            ("key", api_key),
        ],
        timeout=120,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Census API failed for county {county} with status {response.status_code}")
    payload = response.json()
    header = payload[0]
    records = []
    for raw in payload[1:]:
        row = dict(zip(header, raw, strict=True))
        records.append(
            {
                "GEOID": _geoid(row),
                "name": row["NAME"],
                "population": parse_population(row["B01003_001E"]),
                "median_income": parse_income(row["B19013_001E"]),
            }
        )
    logger.info("Fetched %s ACS block groups for %s", len(records), COUNTIES[county])
    return records


def fetch_acs(api_key: str | None = None) -> dict[str, dict[str, object]]:
    key = api_key or census_api_key()
    estimates: dict[str, dict[str, object]] = {}
    for county in COUNTIES:
        for record in fetch_county(county, key):
            estimates[str(record["GEOID"])] = record
    return estimates


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    rows = fetch_acs()
    print(f"{len(rows)} block groups")
