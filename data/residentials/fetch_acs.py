"""Fetch ACS 5-year population and income for Fulton and DeKalb block groups."""

from __future__ import annotations

import logging
import math
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

# Estimates used by the experimental accessibility overlay.  Every estimate is
# fetched with its ACS margin of error so the UI can distinguish a measured
# difference from sampling noise later.  All of these detailed tables are
# available at block-group geography in the ACS 5-year product.
DIRECT_VARIABLES = {
    "population": "B01003_001",
    "median_income": "B19013_001",
    "households": "B08201_001",
    "no_vehicle_households": "B08201_002",
    "workers": "B08301_001",
    "transit_commuters": "B08301_010",
    "poverty_universe": "B17001_001",
    "poverty_population": "B17001_002",
    "employed_population": "B23025_004",
    "children": "C18108_002",
    "seniors": "C18108_010",
    "limited_english_universe": "C16002_001",
}

SUMMED_VARIABLES = {
    "disabled_population": [
        "C18108_003",
        "C18108_004",
        "C18108_007",
        "C18108_008",
        "C18108_011",
        "C18108_012",
    ],
    "limited_english_households": [
        "C16002_004",
        "C16002_007",
        "C16002_010",
        "C16002_013",
    ],
}


def census_api_key() -> str:
    load_dotenv(BACKEND_ENV)
    return os.environ.get("CENSUS_API_KEY", "").strip()


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


def parse_count(value: object) -> int | None:
    if value is None or str(value).strip() in MISSING:
        return None
    number = int(float(str(value)))
    return number if number >= 0 else None


def _sum_estimates(row: dict[str, str], variables: list[str]) -> int | None:
    values = [parse_count(row.get(f"{variable}E")) for variable in variables]
    present = [value for value in values if value is not None]
    return sum(present) if present else None


def _combined_moe(row: dict[str, str], variables: list[str]) -> int | None:
    """ACS guidance combines independent component MOEs by root-sum-square."""
    values = [parse_count(row.get(f"{variable}M")) for variable in variables]
    present = [value for value in values if value is not None]
    return round(math.sqrt(sum(value * value for value in present))) if present else None


def _geoid(row: dict[str, str]) -> str:
    return (
        str(row["state"]).zfill(2)
        + str(row["county"]).zfill(3)
        + str(row["tract"]).zfill(6)
        + str(row["block group"]).zfill(1)
    )


def fetch_county(county: str, api_key: str) -> list[dict[str, object]]:
    variable_names = [
        suffix
        for variable in [
            *DIRECT_VARIABLES.values(),
            *(item for group in SUMMED_VARIABLES.values() for item in group),
        ]
        for suffix in (f"{variable}E", f"{variable}M")
    ]
    params: list[tuple[str, str]] = [
        ("get", ",".join(["NAME", *variable_names])),
        ("for", "block group:*"),
        ("in", "state:13"),
        ("in", f"county:{county}"),
    ]
    if api_key:
        params.append(("key", api_key))
    response = requests.get(
        ACS_URL,
        params=params,
        timeout=120,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Census API failed for county {county} with status {response.status_code}")
    payload = response.json()
    header = payload[0]
    records = []
    for raw in payload[1:]:
        row = dict(zip(header, raw, strict=True))
        record: dict[str, object] = {"GEOID": _geoid(row), "name": row["NAME"]}
        margins: dict[str, int | None] = {}
        for field, variable in DIRECT_VARIABLES.items():
            parser = parse_income if field == "median_income" else parse_count
            value = parser(row.get(f"{variable}E"))
            record[field] = 0 if field == "population" and value is None else value
            margins[field] = parse_count(row.get(f"{variable}M"))
        for field, variables in SUMMED_VARIABLES.items():
            record[field] = _sum_estimates(row, variables)
            margins[field] = _combined_moe(row, variables)
        record["margins"] = margins
        records.append(record)
    logger.info("Fetched %s ACS block groups for %s", len(records), COUNTIES[county])
    return records


def fetch_acs(api_key: str | None = None) -> dict[str, dict[str, object]]:
    key = census_api_key() if api_key is None else api_key
    if not key:
        logger.warning("CENSUS_API_KEY is missing; requesting ACS without a key")
    estimates: dict[str, dict[str, object]] = {}
    for county in COUNTIES:
        for record in fetch_county(county, key):
            estimates[str(record["GEOID"])] = record
    return estimates


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    rows = fetch_acs()
    print(f"{len(rows)} block groups")
