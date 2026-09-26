"""Extract OpenStreetMap destinations around the MARTA rail network."""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable
from pathlib import Path

import geopandas as gpd
import osmnx as ox
import pandas as pd
from shapely.geometry import Point

# West, south, east, north. Covers the rail system past Atlanta city limits.
BBOX = (-84.58, 33.60, -84.05, 34.02)
BUFFER_MILES = 2
BUFFER_METERS = BUFFER_MILES * 1609.344
METRIC_CRS = "EPSG:32616"
SOURCE = "openstreetmap"

POI_TAGS = {
    "amenity": ["hospital", "clinic", "school", "university", "library", "townhall"],
    "shop": ["supermarket"],
}
STATION_TAGS = {"railway": "station", "station": "subway"}
AMENITY_CATEGORIES = {
    "hospital": "hospital",
    "clinic": "clinic",
    "school": "school",
    "university": "university",
    "library": "library",
    "townhall": "government",
}

logger = logging.getLogger(__name__)
RAW_DIR = Path(__file__).resolve().parent / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)
ox.settings.timeout = 180
ox.settings.use_cache = True
ox.settings.cache_folder = str(RAW_DIR / "cache")


def _as_text(value: object) -> str:
    if value is None or value is pd.NA:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, Iterable) and not isinstance(value, str):
        return " ".join(str(item) for item in value)
    return str(value)


def _first_match(value: object, allowed: dict[str, str]) -> str | None:
    text = _as_text(value).lower()
    for token in text.replace(";", " ").split():
        if token in allowed:
            return allowed[token]
    return None


def _category(row: pd.Series) -> str | None:
    amenity = _first_match(row.get("amenity"), AMENITY_CATEGORIES)
    if amenity:
        return amenity
    if _first_match(row.get("shop"), {"supermarket": "grocery"}):
        return "grocery"
    return None


def _source_id(index: object) -> str:
    if isinstance(index, tuple):
        return f"{index[0]}/{index[1]}"
    return str(index)


def _marta_stations(stations: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if stations.empty:
        return stations
    stations = stations.reset_index()
    blob = []
    for _, row in stations.iterrows():
        parts = [_as_text(row.get(column)) for column in ("network", "operator", "name")]
        blob.append(" ".join(parts).lower())
    stations = stations.assign(_blob=blob)
    matched = stations[stations["_blob"].str.contains("marta", regex=False)]
    return matched.drop(columns="_blob")


def _to_point(geom) -> Point | None:
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "Point":
        return geom
    point = geom.representative_point()
    if point.is_empty:
        return None
    return point


def fetch_pois() -> gpd.GeoDataFrame:
    logger.info("Downloading MARTA stations from OpenStreetMap")
    stations = ox.features_from_bbox(BBOX, STATION_TAGS)
    stations = _marta_stations(stations)
    if len(stations) < 10:
        raise RuntimeError(f"Expected MARTA rail stations from OpenStreetMap, found {len(stations)}")
    station_points = []
    for geom in stations.geometry:
        point = _to_point(geom)
        if point is not None:
            station_points.append(point)
    station_frame = gpd.GeoDataFrame(geometry=station_points, crs=4326).to_crs(METRIC_CRS)
    service_area = station_frame.buffer(BUFFER_METERS).union_all()
    logger.info("Using %s MARTA stations with a %s-mile buffer", len(station_frame), BUFFER_MILES)

    logger.info("Downloading POIs from OpenStreetMap")
    features = ox.features_from_bbox(BBOX, POI_TAGS)
    features = features.to_crs(METRIC_CRS)
    features = features[features.geometry.intersects(service_area)].copy()
    features = features.to_crs(4326)

    rows = []
    skipped = 0
    for index, feature in features.iterrows():
        name = _as_text(feature.get("name")).strip()
        category = _category(feature)
        point = _to_point(feature.geometry)
        if not name or category is None or point is None:
            skipped += 1
            continue
        kind = index[0] if isinstance(index, tuple) else "node"
        rows.append(
            {
                "name": name,
                "category": category,
                "source_id": _source_id(index),
                "kind_rank": {"way": 0, "relation": 1, "node": 2}.get(kind, 3),
                "geometry": point,
            }
        )
    pois = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)
    if pois.empty:
        raise RuntimeError("OpenStreetMap returned no named POIs in the MARTA buffer")

    pois = pois.sort_values("kind_rank")
    projected = pois.to_crs(METRIC_CRS)
    keep: list[object] = []
    accepted: list[tuple[str, str, Point]] = []
    for idx, feature in projected.iterrows():
        point = feature.geometry
        duplicate = False
        for name, category, other in accepted:
            if name == feature["name"].casefold() and category == feature["category"]:
                if point.distance(other) <= 100:
                    duplicate = True
                    break
        if duplicate:
            continue
        accepted.append((feature["name"].casefold(), feature["category"], point))
        keep.append(idx)
    pois = pois.loc[keep].drop(columns="kind_rank")
    logger.info("Kept %s named POIs; skipped %s unnamed or uncategorized features", len(pois), skipped)
    counts = pois.groupby("category").size().to_dict()
    logger.info("POI counts: %s", counts)
    return pois
