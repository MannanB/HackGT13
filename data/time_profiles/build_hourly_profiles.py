"""Build hourly destination-arrival profiles from public federal microdata."""

from __future__ import annotations

import csv
import io
import json
import urllib.request
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = Path(__file__).resolve().parent / "raw"
OUTPUT = ROOT / "frontend" / "src" / "data" / "hourlyDemandProfiles.json"

NHTS_URL = "https://nhts.ornl.gov/media/2022/download/csv.zip"
NHAMCS_URL = (
    "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHAMCS/ed2022.zip"
)

# WHYTO codes from the 2022 NHTS public-use codebook.
PURPOSE_CODES = {
    "employment": {"03", "04", "05"},
    "education": {"06", "07"},
    "medical": {"11"},
    "shopping": {"13"},
    "errands": {"08", "10", "14", "19"},
    "other": {"12", "15", "16", "17", "18", "97"},
}


def download(url: str, destination: Path) -> None:
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, destination)


def normalize(values: list[float]) -> list[float]:
    total = sum(values)
    if total <= 0:
        raise ValueError("Cannot normalize an empty hourly profile")
    return [round(value / total, 8) for value in values]


def nhts_profiles(path: Path) -> tuple[dict[str, list[float]], dict[str, int]]:
    totals = {name: [0.0] * 24 for name in PURPOSE_CODES}
    samples = defaultdict(int)
    with ZipFile(path) as archive:
        with archive.open("tripv2pub.csv") as raw:
            rows = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
            for row in rows:
                try:
                    end_time = int(row["ENDTIME"])
                    hour, minute = divmod(end_time, 100)
                    weight = float(row["WTTRDFIN"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not (0 <= hour < 24 and 0 <= minute < 60) or weight <= 0:
                    continue
                purpose = row["WHYTO"]
                for name, codes in PURPOSE_CODES.items():
                    if purpose in codes:
                        totals[name][hour] += weight
                        samples[name] += 1
    return ({name: normalize(values) for name, values in totals.items()}, dict(samples))


def emergency_profile(path: Path) -> tuple[list[float], int]:
    """Read ARRTIME and PATWT from the CDC fixed-width ED file.

    Positions come from the official 2022 SAS input statement: ARRTIME begins
    at column 4 with width 4; PATWT begins at column 2359 with width 11.
    """

    totals = [0.0] * 24
    samples = 0
    with ZipFile(path) as archive:
        with archive.open("ed2022") as raw:
            for binary_line in raw:
                line = binary_line.decode("ascii")
                arrival = line[3:7]
                try:
                    hour = int(arrival[:2])
                    minute = int(arrival[2:])
                    weight = float(line[2358:2369])
                except ValueError:
                    continue
                if not (0 <= hour < 24 and 0 <= minute < 60) or weight <= 0:
                    continue
                totals[hour] += weight
                samples += 1
    return normalize(totals), samples


def main() -> None:
    nhts_zip = RAW_DIR / "nhts_2022_csv.zip"
    nhamcs_zip = RAW_DIR / "nhamcs_2022_ed.zip"
    download(NHTS_URL, nhts_zip)
    download(NHAMCS_URL, nhamcs_zip)

    nhts, nhts_samples = nhts_profiles(nhts_zip)
    emergency, emergency_samples = emergency_profile(nhamcs_zip)
    category_profiles = {
        "hospital": emergency,
        "clinic": nhts["medical"],
        "grocery": nhts["shopping"],
        "pharmacy": nhts["shopping"],
        "school": nhts["education"],
        "university": nhts["education"],
        "library": nhts["errands"],
        "government": nhts["errands"],
        "employment": nhts["employment"],
        "other": nhts["other"],
    }
    payload = {
        "metadata": {
            "unit": "share of daily arrivals in each local-clock hour",
            "generatedFrom": [
                {
                    "name": "2022 National Household Travel Survey V2.1",
                    "url": NHTS_URL,
                    "variables": ["ENDTIME", "WHYTO", "WTTRDFIN"],
                    "sampleTripsByProfile": nhts_samples,
                },
                {
                    "name": "2022 National Hospital Ambulatory Medical Care Survey ED",
                    "url": NHAMCS_URL,
                    "variables": ["ARRTIME", "PATWT"],
                    "sampleVisits": emergency_samples,
                },
                {
                    "name": "2024 Medical Expenditure Panel Survey Outpatient Visits File",
                    "url": "https://meps.ahrq.gov/data_stats/download_data/pufs/h254f/h254fdoc.shtml",
                    "measure": "340 million hospital outpatient visits nationally",
                    "usage": "One outpatient hospital visit per person-year planning proxy",
                },
                {
                    "name": "2020 Census Atlanta Urban Area Facts",
                    "url": "https://www.census.gov/programs-surveys/geography/guidance/geo-areas/urban-rural/2020-ua-facts.html",
                    "measure": "1,998 people per square mile",
                    "usage": "Baseline for the bounded block-group density uplift",
                },
            ],
            "notes": [
                "NHTS trip weights are used for non-hospital destination profiles.",
                "The CDC emergency-department arrival profile keeps hospital demand active overnight.",
                "Hospital demand blends the ED profile with daytime NHTS medical trips for outpatient visits.",
                "Atlanta block groups above 1,998 people per square mile receive a square-root density uplift capped at 2.5x.",
                "Profiles are national proxies, not observed counts for individual Atlanta facilities.",
            ],
        },
        "profiles": category_profiles,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
