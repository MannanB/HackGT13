"""Download MARTA GTFS and build rail stations plus ride edges."""

from __future__ import annotations

import csv
import io
import logging
import statistics
import zipfile
from collections import defaultdict
from pathlib import Path

import requests

GTFS_URL = "https://itsmarta.com/google_transit_feed/google_transit.zip"
RAIL_ROUTE_TYPE = "1"
LINE_NAMES = {"RED": "Red", "GOLD": "Gold", "BLUE": "Blue", "GREEN": "Green"}
RAW_DIR = Path(__file__).resolve().parent / "raw"
ZIP_PATH = RAW_DIR / "google_transit.zip"

logger = logging.getLogger(__name__)


def download_gtfs(path: Path = ZIP_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 0:
        logger.info("Using cached GTFS zip %s", path)
        return path
    logger.info("Downloading %s", GTFS_URL)
    with requests.get(GTFS_URL, stream=True, timeout=120) as response:
        response.raise_for_status()
        temporary = path.with_suffix(".zip.part")
        with temporary.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
        temporary.replace(path)
    return path


def _read_csv(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        return list(csv.DictReader(text))


def _clock_seconds(value: str) -> int | None:
    parts = value.strip().split(":")
    if len(parts) != 3:
        return None
    hours, minutes, seconds = (int(part) for part in parts)
    return hours * 3600 + minutes * 60 + seconds


def _station_id(stop: dict[str, str]) -> str:
    parent = (stop.get("parent_station") or "").strip()
    if stop.get("location_type") == "1" or not parent:
        return stop["stop_id"]
    return parent


def _display_name(name: str) -> str:
    name = name.strip()
    if name.isupper():
        return name.title()
    return name


def _weekday_services(calendar_rows: list[dict[str, str]]) -> set[str]:
    weekdays = {"monday", "tuesday", "wednesday", "thursday", "friday"}
    services = set()
    for row in calendar_rows:
        if all(row.get(day) == "1" for day in weekdays):
            services.add(row["service_id"])
    return services


def parse_rail_network(path: Path = ZIP_PATH) -> tuple[list[dict], list[dict]]:
    """Return station rows and directed transit-edge rows for Red/Gold/Blue/Green."""
    path = download_gtfs(path)
    with zipfile.ZipFile(path) as archive:
        routes = {
            row["route_id"]: LINE_NAMES[row["route_short_name"].strip().upper()]
            for row in _read_csv(archive, "routes.txt")
            if row.get("route_type") == RAIL_ROUTE_TYPE
            and row.get("route_short_name", "").strip().upper() in LINE_NAMES
        }
        if len(routes) != 4:
            raise RuntimeError(f"Expected 4 MARTA rail lines, found {sorted(set(routes.values()))}")

        weekday_services = _weekday_services(_read_csv(archive, "calendar.txt"))
        trips: dict[str, dict[str, str]] = {}
        for row in _read_csv(archive, "trips.txt"):
            if row["route_id"] in routes:
                trips[row["trip_id"]] = row

        stops = {row["stop_id"]: row for row in _read_csv(archive, "stops.txt")}
        times_by_trip: dict[str, list[dict[str, str]]] = defaultdict(list)
        with archive.open("stop_times.txt") as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
            for row in csv.DictReader(text):
                if row["trip_id"] in trips:
                    times_by_trip[row["trip_id"]].append(row)

    station_lines: dict[str, set[str]] = defaultdict(set)
    travel_samples: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    departures: dict[tuple[str, str, str], list[int]] = defaultdict(list)

    for trip_id, rows in times_by_trip.items():
        trip = trips[trip_id]
        line = routes[trip["route_id"]]
        weekday = trip["service_id"] in weekday_services if weekday_services else True
        rows.sort(key=lambda row: int(row["stop_sequence"]))
        previous: tuple[str, int] | None = None
        for row in rows:
            stop = stops.get(row["stop_id"])
            if stop is None:
                continue
            station_id = _station_id(stop)
            station_lines[station_id].add(line)
            depart = _clock_seconds(row.get("departure_time") or row.get("arrival_time") or "")
            arrive = _clock_seconds(row.get("arrival_time") or row.get("departure_time") or "")
            if previous is not None and previous[0] != station_id and arrive is not None:
                minutes = (arrive - previous[1]) / 60
                if minutes >= 0:
                    travel_samples[(previous[0], station_id, line)].append(minutes)
                    if weekday and previous[1] is not None:
                        departures[(previous[0], station_id, line)].append(previous[1])
            if depart is not None:
                previous = (station_id, depart)

    stations = []
    for station_id, lines in sorted(station_lines.items()):
        stop = stops.get(station_id)
        if stop is None:
            raise RuntimeError(f"GTFS is missing station {station_id}")
        stations.append(
            {
                "id": station_id,
                "name": _display_name(stop["stop_name"]),
                "lon": float(stop["stop_lon"]),
                "lat": float(stop["stop_lat"]),
                "lines": sorted(lines, key=["Red", "Gold", "Blue", "Green"].index),
            }
        )

    edges = []
    for key, samples in sorted(travel_samples.items()):
        from_station, to_station, line = key
        times = sorted(departures.get(key, []))
        headways = [times[i] - times[i - 1] for i in range(1, len(times)) if times[i] > times[i - 1]]
        frequency = statistics.median(headways) / 60 if headways else 10.0
        edges.append(
            {
                "from_station": from_station,
                "to_station": to_station,
                "travel_minutes": max(statistics.median(samples), 0.5),
                "line": line,
                "frequency_minutes": max(frequency, 1.0),
            }
        )

    logger.info("Parsed %s rail stations and %s directed edges", len(stations), len(edges))
    return stations, edges


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    stations, edges = parse_rail_network()
    print(f"{len(stations)} stations, {len(edges)} edges")
