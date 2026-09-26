"""Build the frontend hospital-bed lookup from current CMS provider files."""

from __future__ import annotations

import csv
import json
import ssl
import urllib.request
from pathlib import Path

try:
    import certifi
except ImportError:  # pragma: no cover - system Python may already have usable CA roots
    certifi = None


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = Path(__file__).resolve().parent / "raw"
OUTPUT = ROOT / "frontend" / "src" / "data" / "hospitalBeds.json"

PSF_URLS = {
    "inpatient": "https://pds.mps.cms.gov/fiss/inpatient/export?format=csv&latestRecordOnly=Y",
    "psychiatric": "https://pds.mps.cms.gov/fiss/inpatient/export?facilityType=IPF&format=csv&latestRecordOnly=Y",
    "longTermCare": "https://pds.mps.cms.gov/fiss/inpatient/export?facilityType=LTCH&format=csv&latestRecordOnly=Y",
}
COST_REPORT_URL = (
    "https://data.cms.gov/data-api/v1/dataset/"
    "44060663-47d8-4ced-a115-b53b4c270acb/data?size=7000&offset=0"
)

# Hand-reviewed crosswalk between the OSM feature used by the app and its CMS CCN.
# A POI is intentionally omitted when the identity or comparable bed measure is unclear.
OSM_TO_CCN = {
    "way/692241977": "114032",       # Anchor Hospital
    "way/933073925": "113300",       # Arthur M. Blank Hospital
    "way/34845332": "110076",        # Emory Decatur Hospital
    "way/34845193": "110226",        # Emory Hillandale Hospital
    "way/494853109": "110082",       # Emory Saint Joseph's Hospital
    "way/61494982": "110010",        # Emory University Hospital
    "relation/3612501": "110078",    # Emory University Hospital Midtown
    "node/358779826": "114019",      # Georgia Regional Hospital Atlanta
    "relation/5675786": "110079",    # Grady Memorial Hospital
    "way/34845864": "110161",        # Northside Hospital
    "node/10834409036": "110252",    # Northside Hospital Duluth
    "way/561382363": "114010",       # Peachford Behavioral Health System
    "way/34845384": "110083",        # Piedmont Atlanta Hospital
    "node/10834460762": "114012",    # Ridgeview Institute
    "way/494853126": "113301",       # Children's Healthcare Scottish Rite
    "way/34844784": "110165",        # Southern Regional Medical Center
    "way/493718918": "110198",       # Wellstar North Fulton Medical Center
}


def download(url: str, destination: Path) -> None:
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "HackGT13 data builder"})
    context = ssl.create_default_context(cafile=certifi.where() if certifi else None)
    with urllib.request.urlopen(request, context=context) as response, destination.open("wb") as output:
        output.write(response.read())


def load_beds(paths: list[Path]) -> dict[str, int]:
    beds: dict[str, int] = {}
    for path in paths:
        with path.open(newline="", encoding="utf-8-sig") as source:
            for row in csv.DictReader(source):
                ccn = (row.get("oscarNumber") or "").strip()
                try:
                    count = int(float(row.get("bedSize") or 0))
                except ValueError:
                    continue
                if ccn and count > 0:
                    beds[ccn] = count
    return beds


def load_utilization(path: Path) -> dict[str, dict[str, float | str]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    utilization: dict[str, dict[str, float | str]] = {}
    for row in rows:
        ccn = str(row.get("Provider CCN") or "").strip()
        try:
            patient_days = float(row.get("Total Days (V + XVIII + XIX + Unknown)") or 0)
            bed_days = float(row.get("Total Bed Days Available") or 0)
            discharges = float(row.get("Total Discharges (V + XVIII + XIX + Unknown)") or 0)
        except (TypeError, ValueError):
            continue
        if not ccn or patient_days <= 0 or bed_days <= 0 or discharges <= 0:
            continue
        utilization[ccn] = {
            "baselineOccupancyRate": round(min(1, patient_days / bed_days), 6),
            "averageLengthOfStayDays": round(patient_days / discharges, 3),
            "utilizationReportEnd": str(row.get("Fiscal Year End Date") or ""),
        }
    return utilization


def main() -> None:
    paths: list[Path] = []
    for name, url in PSF_URLS.items():
        path = RAW_DIR / f"cms_{name}_latest.csv"
        download(url, path)
        paths.append(path)

    beds_by_ccn = load_beds(paths)
    cost_report_path = RAW_DIR / "cms_hospital_cost_report_2023.json"
    download(COST_REPORT_URL, cost_report_path)
    utilization_by_ccn = load_utilization(cost_report_path)
    missing = sorted(set(OSM_TO_CCN.values()) - beds_by_ccn.keys())
    if missing:
        raise RuntimeError(f"CMS files do not contain bed counts for: {', '.join(missing)}")

    entries = {
        f"openstreetmap:{osm_id}": {
            "beds": beds_by_ccn[ccn],
            "providerId": ccn,
            "source": "CMS Provider Specific File",
            **utilization_by_ccn.get(ccn, {}),
        }
        for osm_id, ccn in sorted(OSM_TO_CCN.items())
    }
    payload = {
        "metadata": {
            "unit": "CMS PSF bedSize",
            "sourcePage": "https://www.cms.gov/medicare/payment/prospective-payment-systems/provider-specific-data-public-use-parquet-format",
            "sourceFiles": list(PSF_URLS.values()),
            "utilizationSource": COST_REPORT_URL,
            "notes": [
                "Only hand-matched facilities with a positive CMS bedSize are included.",
                "Unmatched hospitals remain capacity-unknown; no median or inferred fallback is used.",
                "Starting occupancy and average length of stay use the latest CMS cost-report utilization fields available in the 2023 dataset.",
            ],
        },
        "hospitals": entries,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(entries)} matched hospitals")


if __name__ == "__main__":
    main()
