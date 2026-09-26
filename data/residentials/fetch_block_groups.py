"""Download Georgia census block groups and keep Fulton and DeKalb."""

from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd
import requests

TIGER_URL = "https://www2.census.gov/geo/tiger/TIGER2024/BG/tl_2024_13_bg.zip"
COUNTIES = {"121": "Fulton", "089": "DeKalb"}
RAW_DIR = Path(__file__).resolve().parent / "raw"
ZIP_PATH = RAW_DIR / "tl_2024_13_bg.zip"

logger = logging.getLogger(__name__)


def download_tiger(path: Path = ZIP_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 0:
        logger.info("Using cached block-group zip %s", path)
        return path
    logger.info("Downloading %s", TIGER_URL)
    with requests.get(TIGER_URL, stream=True, timeout=120) as response:
        response.raise_for_status()
        temporary = path.with_suffix(".zip.part")
        with temporary.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
        temporary.replace(path)
    return path


def load_block_groups(path: Path = ZIP_PATH) -> gpd.GeoDataFrame:
    """Return Fulton and DeKalb block groups in EPSG:4326.

    The routing origin is the Census internal point (INTPTLON, INTPTLAT),
    which lies inside the block group. It is not the geometric centroid.
    """
    download_tiger(path)
    zones = gpd.read_file(path)
    zones["COUNTYFP"] = zones["COUNTYFP"].astype(str).str.zfill(3)
    zones = zones[zones["COUNTYFP"].isin(COUNTIES)].copy()
    zones["GEOID"] = zones["GEOID"].astype(str).str.zfill(12)
    zones = zones.to_crs(4326)
    zones["origin_lon"] = zones["INTPTLON"].astype(float)
    zones["origin_lat"] = zones["INTPTLAT"].astype(float)
    zones = zones[zones.geometry.notna() & zones["origin_lon"].notna() & zones["origin_lat"].notna()]
    logger.info("Loaded %s block groups in Fulton and DeKalb", len(zones))
    return zones[["GEOID", "NAMELSAD", "origin_lon", "origin_lat", "geometry"]]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_block_groups()
