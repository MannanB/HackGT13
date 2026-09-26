"""Train the Atlanta day model.

A person generates a daily trip rate for each activity. That rate depends on the
population makeup of the block group and how far it sits from downtown. Walk
speed and the rail transfer penalty decide which of those trips board MARTA,
and at which station. The fit matches published station entries, scaled so the
system total equals an average 2025 weekday of National Transit Database
heavy-rail boardings.
"""

from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import numpy as np

try:
    import certifi
except ImportError:
    certifi = None

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where()) if certifi else ssl.create_default_context()

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(__file__).resolve().parent / "atlanta_day_model.json"
API = "http://127.0.0.1:8000"
WALK_AT_80 = 80.0
ANCHORED = {"school", "university", "government"}
FEATURES = (
    "worker_share",
    "employed_share",
    "transit_share",
    "limited_english_share",
    "log_income",
    "jobs_per_resident",
    "km_to_downtown",
)
# MARTA average weekday station entries, 2019. The station mix is this table.
# Names are the app's station names.
ENTRIES_2019 = {
    "Airport Station": 9228,
    "Arts Center Station": 6340,
    "Ashby Station": 1419,
    "Avondale Station": 2482,
    "Bankhead Station": 889,
    "Brookhaven-Oglethorpe Station": 2156,
    "Buckhead Station": 3001,
    "Chamblee Station": 3201,
    "Civic Center Station": 2209,
    "College Park Station": 8061,
    "Decatur Station": 2759,
    "Doraville Station": 4967,
    "Dunwoody Station": 3089,
    "East Lake Station": 1199,
    "East Point Station": 5743,
    "Edgewood-Candler Park Station": 1061,
    "Five Points Station": 14713,
    "Garnett Station": 1287,
    "Georgia State Station": 3826,
    "Hamilton E Holmes Station": 5164,
    "Indian Creek Station": 4107,
    "Inman Park-Reynoldstown Station": 2259,
    "Kensington Station": 4902,
    "King Memorial Station": 1251,
    "Lakewood-Ft Mcpherson Station": 2821,
    "Lenox Station": 2456,
    "Lindbergh Center Station": 6925,
    "Medical Center Station": 1461,
    "Midtown Station": 5367,
    "North Ave Station": 5273,
    "North Springs Station": 6036,
    "Oakland City Station": 3436,
    "Peachtree Center Station": 8821,
    "Sandy Springs Station": 2965,
    "Sec District Station": 1105,
    "Vine City Station": 607,
    "West End Station": 5029,
    "West Lake Station": 1149,
}
# February 2023: a weekend day was 53,880 boardings against a 90,618 weekday.
WEEKEND_TO_WEEKDAY = 53880 / 90618


def fetch(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "HackGT13"})
    with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
        return json.loads(response.read().decode())


def fetch_pages(path: str) -> list[dict]:
    items: list[dict] = []
    offset = 0
    while True:
        page = fetch(f"{API}{path}{'&' if '?' in path else '?'}limit=200&offset={offset}")
        batch = page["items"]
        items.extend(batch)
        offset += len(batch)
        if not batch or offset >= page["total"]:
            break
    return items


def haversine_km(lat1, lon1, lat2, lon2):
    lat1 = np.radians(lat1)
    lon1 = np.radians(lon1)
    lat2 = np.radians(lat2)
    lon2 = np.radians(lon2)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 6371 * 2 * np.arctan2(np.sqrt(h), np.sqrt(1 - h))


def ntd_weekday_boardings() -> tuple[float, int]:
    query = urllib.parse.urlencode({
        "$select": "date,upt",
        "$where": (
            "ntd_id='40022' AND mode='HR' AND date >= '2025-01-01T00:00:00.000' "
            "AND date < '2026-01-01T00:00:00.000'"
        ),
        "$order": "date",
        "$limit": "20",
    })
    rows = fetch(f"https://data.transportation.gov/resource/8bui-9xvu.json?{query}")
    annual = sum(int(row["upt"]) for row in rows)
    weekdays = 0
    weekend_days = 0
    cursor = date(2025, 1, 1)
    while cursor.year == 2025:
        if cursor.weekday() < 5:
            weekdays += 1
        else:
            weekend_days += 1
        cursor += timedelta(days=1)
    weekday = annual / (weekdays + weekend_days * WEEKEND_TO_WEEKDAY)
    return weekday, annual


def build_graph(station_ids: list[str], edges: list[dict]):
    index = {station_id: position for position, station_id in enumerate(station_ids)}
    size = len(station_ids)
    dist = np.full((size, size), np.inf)
    nxt = np.full((size, size), -1, dtype=np.int16)
    np.fill_diagonal(dist, 0)
    np.fill_diagonal(nxt, np.arange(size))
    edge_by_pair: dict[tuple[int, int], tuple[float, float, str]] = {}
    for edge in edges:
        start = index.get(edge["from_station"])
        end = index.get(edge["to_station"])
        if start is None or end is None:
            continue
        travel = float(edge["travel_minutes"])
        record = (travel, float(edge["frequency_minutes"]), str(edge["line"]))
        for src, dst in ((start, end), (end, start)):
            if travel >= dist[src, dst]:
                continue
            dist[src, dst] = travel
            nxt[src, dst] = dst
            edge_by_pair[(src, dst)] = record
    for mid in range(size):
        for start in range(size):
            start_to_mid = dist[start, mid]
            if not np.isfinite(start_to_mid):
                continue
            first_hop = nxt[start, mid]
            for end in range(size):
                mid_to_end = dist[mid, end]
                if not np.isfinite(mid_to_end):
                    continue
                through = start_to_mid + mid_to_end
                if through < dist[start, end]:
                    dist[start, end] = through
                    nxt[start, end] = first_hop
    fixed = np.full((size, size), np.inf)
    transfers = np.zeros((size, size))
    np.fill_diagonal(fixed, 0)
    for start in range(size):
        for end in range(size):
            if start == end or not np.isfinite(dist[start, end]):
                continue
            cursor = start
            path = [start]
            while cursor != end:
                cursor = int(nxt[cursor, end])
                if cursor < 0:
                    path = []
                    break
                path.append(cursor)
            if len(path) < 2:
                continue
            minutes = 0.0
            changes = 0
            previous = None
            for left, right in zip(path, path[1:]):
                travel, frequency, line = edge_by_pair[(left, right)]
                minutes += travel
                if previous is None:
                    minutes += frequency / 2
                elif line != previous:
                    changes += 1
                    minutes += frequency / 2
                previous = line
            fixed[start, end] = minutes
            transfers[start, end] = changes
    return fixed, transfers


def access_tables(keys: list[str], points: np.ndarray, links: dict[str, list[tuple[str, float]]], station_index: dict[str, int], station_points: np.ndarray):
    width = 3
    idx = np.full((len(keys), width), -1, dtype=np.int16)
    minutes = np.zeros((len(keys), width))
    for row, key in enumerate(keys):
        choices = links.get(key) or []
        if not choices:
            distance = haversine_km(points[row, 0], points[row, 1], station_points[:, 0], station_points[:, 1])
            order = np.argsort(distance)[:width]
            choices = [
                (station_ids_global[int(position)], float(distance[int(position)] * 1000 / WALK_AT_80))
                for position in order
            ]
        choices = sorted(choices, key=lambda item: item[1])[:width]
        for column, (station_id, walk) in enumerate(choices):
            idx[row, column] = station_index[station_id]
            minutes[row, column] = walk
    return idx, minutes


station_ids_global: list[str] = []


def assign_boardings(speed: float, penalty: float, fixed: np.ndarray, transfers: np.ndarray, zones, pois_by_category, categories: list[str]):
    """Station at each end of a rail trip.

    A weekday entry is recorded where the trip starts and, on the way home,
    where it turns around. Walking the whole way records neither.
    """
    scale = WALK_AT_80 / speed
    rail = fixed + transfers * penalty
    origin = np.full((len(zones["id"]), len(categories)), -1, dtype=np.int16)
    destination = np.full_like(origin, -1)
    for category_index, category in enumerate(categories):
        pois = pois_by_category[category]
        poi_count = len(pois["id"])
        if poi_count == 0:
            continue
        for zone_index in range(len(zones["id"])):
            distance = haversine_km(
                zones["lat"][zone_index],
                zones["lon"][zone_index],
                pois["lat"],
                pois["lon"],
            )
            direct = distance * 1000 / speed
            if category in ANCHORED:
                chosen = int(np.argmin(distance))
                best = np.full(poi_count, np.inf)
                best[chosen] = direct[chosen]
            else:
                chosen = None
                best = direct.copy()
            boarded = np.full(poi_count, -1, dtype=np.int16)
            alighted = np.full(poi_count, -1, dtype=np.int16)
            for slot in range(zones["access_idx"].shape[1]):
                board_at = int(zones["access_idx"][zone_index, slot])
                if board_at < 0:
                    continue
                walk_on = zones["access_min"][zone_index, slot] * scale
                for alight_slot in range(pois["access_idx"].shape[1]):
                    alight_at = pois["access_idx"][:, alight_slot]
                    usable = alight_at >= 0
                    if chosen is not None:
                        usable = np.zeros(poi_count, dtype=bool)
                        usable[chosen] = alight_at[chosen] >= 0
                    usable &= alight_at != board_at
                    transit = np.full(poi_count, np.inf)
                    if np.any(usable):
                        transit[usable] = (
                            walk_on
                            + rail[board_at, alight_at[usable]]
                            + pois["access_min"][usable, alight_slot] * scale
                        )
                    better = transit < best
                    best[better] = transit[better]
                    boarded[better] = board_at
                    alighted[better] = alight_at[better]
            if chosen is None:
                floor = best.min()
                tied = np.flatnonzero(best <= floor + 1e-6)
                chosen = int(tied[np.argmin(pois["id"][tied])])
            origin[zone_index, category_index] = boarded[chosen]
            destination[zone_index, category_index] = alighted[chosen]
    return origin, destination


def softplus(values: np.ndarray) -> np.ndarray:
    return np.logaddexp(0, np.clip(values, -40, 40))


def predict_stations(origin, destination, population, features, bias, sensitivity, makeup, station_count: int) -> np.ndarray:
    score = features @ makeup
    predicted = np.zeros(station_count)
    for category in range(origin.shape[1]):
        rate = softplus(bias[category] + sensitivity[category] * score)
        trips = population * rate
        for ends in (origin[:, category], destination[:, category]):
            mask = ends >= 0
            np.add.at(predicted, ends[mask], trips[mask])
    return predicted


def fit_rates(origin, destination, population, features, target):
    station_count = len(target)
    categories = origin.shape[1]
    feature_count = features.shape[1]
    mass = np.zeros((station_count, categories))
    for category in range(categories):
        for ends in (origin[:, category], destination[:, category]):
            mask = ends >= 0
            np.add.at(mass[:, category], ends[mask], population[mask])
    rate, *_ = np.linalg.lstsq(mass, target, rcond=None)
    rate = np.clip(rate, 1e-5, 1.5)
    bias = np.log(np.expm1(rate))
    sensitivity = np.ones(categories)
    makeup = np.full(feature_count, 0.05)
    theta = np.concatenate([bias, sensitivity, makeup])

    def unpack(vector):
        return (
            vector[:categories],
            vector[categories:categories * 2],
            vector[categories * 2:],
        )

    def residuals(vector):
        bias_v, sens_v, makeup_v = unpack(vector)
        predicted = predict_stations(origin, destination, population, features, bias_v, sens_v, makeup_v, station_count)
        scale = np.maximum(np.sqrt(target), 1)
        station_error = (predicted - target) / scale
        total_error = np.array([(predicted.sum() - target.sum()) / target.sum() * math_total])
        return np.concatenate([station_error, total_error, 0.08 * sens_v, 0.08 * makeup_v])

    math_total = np.sqrt(target.sum())
    residual = residuals(theta)
    damping = 1.0
    for _ in range(24):
        jacobian = np.zeros((residual.size, theta.size))
        for index in range(theta.size):
            step = np.zeros_like(theta)
            step[index] = 1e-4
            jacobian[:, index] = (residuals(theta + step) - residual) / 1e-4
        gram = jacobian.T @ jacobian + damping * np.eye(theta.size)
        delta = np.linalg.solve(gram, jacobian.T @ residual)
        candidate = theta - delta
        candidate[:categories] = np.clip(candidate[:categories], -8, 1.5)
        candidate[categories:] = np.clip(candidate[categories:], -2.5, 2.5)
        candidate_residual = residuals(candidate)
        if np.dot(candidate_residual, candidate_residual) < np.dot(residual, residual):
            theta = candidate
            residual = candidate_residual
            damping = max(1e-3, damping / 3)
        else:
            damping = min(1e4, damping * 4)
    bias, sensitivity, makeup = unpack(theta)
    predicted = predict_stations(origin, destination, population, features, bias, sensitivity, makeup, station_count)
    correlation = float(np.corrcoef(predicted, target)[0, 1])
    relative = (predicted - target) / np.maximum(target, 200)
    loss = float(np.mean(relative ** 2))
    return bias, sensitivity, makeup, predicted, loss, correlation


def main() -> None:
    print("loading network, zones, and ridership", flush=True)
    weekday, annual = ntd_weekday_boardings()
    network = fetch(f"{API}/api/v1/network")
    zones_raw = fetch_pages("/api/v1/zones")
    pois_raw = fetch_pages("/api/v1/pois")
    access = fetch_pages("/api/v1/access-edges")
    context = fetch(f"{API}/api/v1/experimental/context")
    stations = network["stations"]
    global station_ids_global
    station_ids_global = [station["id"] for station in stations]
    missing = [station["name"] for station in stations if station["name"] not in ENTRIES_2019]
    if missing:
        raise SystemExit(f"No 2019 entries for: {missing}")
    published = np.array([ENTRIES_2019[station["name"]] for station in stations], dtype=float)
    target = published * (weekday / published.sum())
    downtown = next(station for station in stations if station["name"] == "Five Points Station")
    downtown_lat = downtown["location"]["lat"]
    downtown_lon = downtown["location"]["lon"]

    demo = context.get("zones") or {}
    incomes = []
    for zone in zones_raw:
        people = float(zone.get("population") or 0)
        if people <= 0:
            continue
        row = demo.get(zone["id"]) or {}
        income = row.get("median_income")
        if income:
            incomes.append(float(income))
    income_impute = float(np.median(incomes)) if incomes else 60000.0
    zone_ids = []
    zone_lat = []
    zone_lon = []
    population = []
    raw_features = []
    for zone in zones_raw:
        people = float(zone.get("population") or 0)
        if people <= 0:
            continue
        row = demo.get(zone["id"]) or {}
        english_universe = float(row.get("limited_english_universe") or 0)
        income = float(row.get("median_income") or 0) or income_impute
        raw_features.append([
            float(row.get("workers") or 0) / people,
            float(row.get("employed_population") or 0) / people,
            float(row.get("transit_commuters") or 0) / people,
            (float(row.get("limited_english_households") or 0) / english_universe) if english_universe else 0.0,
            float(np.log(income)),
            float(row.get("commute_jobs") or 0) / people,
            float(haversine_km(zone["centroid"]["lat"], zone["centroid"]["lon"], downtown_lat, downtown_lon)),
        ])
        zone_ids.append(zone["id"])
        zone_lat.append(zone["centroid"]["lat"])
        zone_lon.append(zone["centroid"]["lon"])
        population.append(people)
    population_arr = np.array(population)
    raw = np.array(raw_features)
    mean = np.average(raw, axis=0, weights=population_arr)
    scale = np.sqrt(np.average((raw - mean) ** 2, axis=0, weights=population_arr))
    scale[scale < 1e-6] = 1
    features = (raw - mean) / scale
    print("feature mean", np.round(mean, 3), "scale", np.round(scale, 3), flush=True)

    zone_links: dict[str, list[tuple[str, float]]] = {}
    poi_links: dict[str, list[tuple[str, float]]] = {}
    for edge in access:
        bucket = zone_links if edge["location_type"] == "zone" else poi_links
        bucket.setdefault(edge["location_id"], []).append((edge["station_id"], float(edge["walking_minutes"])))
    station_index = {station_id: index for index, station_id in enumerate(station_ids_global)}
    station_points = np.array([[station["location"]["lat"], station["location"]["lon"]] for station in stations])
    zone_points = np.column_stack([zone_lat, zone_lon])
    zone_access_idx, zone_access_min = access_tables(zone_ids, zone_points, zone_links, station_index, station_points)

    grouped: dict[str, dict] = {}
    def add_poi(poi_id, category, lat, lon):
        bucket = grouped.setdefault(category, {"id": [], "lat": [], "lon": []})
        bucket["id"].append(str(poi_id))
        bucket["lat"].append(float(lat))
        bucket["lon"].append(float(lon))

    for poi in pois_raw:
        add_poi(poi["id"], poi["category"], poi["location"]["lat"], poi["location"]["lon"])
    for poi in context.get("employmentCenters") or []:
        if poi.get("category") != "employment":
            continue
        add_poi(poi["id"], "employment", poi["latitude"], poi["longitude"])
    categories = [category for category, pois in grouped.items() if pois["id"]]
    categories.sort()
    for category, pois in grouped.items():
        points = np.column_stack([pois["lat"], pois["lon"]])
        idx, minutes = access_tables(pois["id"], points, poi_links, station_index, station_points)
        pois["lat"] = np.array(pois["lat"])
        pois["lon"] = np.array(pois["lon"])
        pois["id"] = np.array(pois["id"])
        pois["access_idx"] = idx
        pois["access_min"] = minutes
    zones = {
        "id": zone_ids,
        "lat": np.array(zone_lat),
        "lon": np.array(zone_lon),
        "access_idx": zone_access_idx,
        "access_min": zone_access_min,
    }
    fixed, transfer_counts = build_graph(station_ids_global, network["transit_edges"])
    print(f"{len(zone_ids)} zones, categories {categories}, weekday target {weekday:.0f}", flush=True)

    best = None
    for speed in (60, 75, 90, 105):
        for penalty in (1, 3, 6, 10):
            print(f"fitting walk {speed} m/min, transfer {penalty} min", flush=True)
            origin, destination = assign_boardings(speed, penalty, fixed, transfer_counts, zones, grouped, categories)
            bias, sensitivity, makeup, predicted, loss, correlation = fit_rates(
                origin, destination, population_arr, features, target,
            )
            print(f"  loss {loss:.4f} corr {correlation:.3f} total {predicted.sum():.0f}", flush=True)
            if best is None or loss < best["loss"]:
                best = {
                    "loss": loss,
                    "speed": speed,
                    "penalty": penalty,
                    "bias": bias,
                    "sensitivity": sensitivity,
                    "makeup": makeup,
                    "predicted": predicted,
                    "correlation": correlation,
                }
    assert best is not None
    score = features @ best["makeup"]
    mean_trips = []
    for index in range(len(categories)):
        rate = softplus(best["bias"][index] + best["sensitivity"][index] * score)
        mean_trips.append(float(np.average(rate, weights=population_arr)))
    payload = {
        "name": "atlanta_day",
        "kind": "activity_rate",
        "trained": True,
        "pitch": "How the average person in Atlanta goes about a day, from where they live and who lives around them.",
        "features": list(FEATURES),
        "featureMean": mean.round(6).tolist(),
        "featureScale": scale.round(6).tolist(),
        "downtown": {"latitude": downtown_lat, "longitude": downtown_lon},
        "medianIncomeImpute": round(income_impute, 2),
        "categories": categories,
        "bias": np.round(best["bias"], 6).tolist(),
        "sensitivity": np.round(best["sensitivity"], 6).tolist(),
        "makeupWeights": np.round(best["makeup"], 6).tolist(),
        "meanTripsPerPerson": [round(value, 6) for value in mean_trips],
        "walkMetersPerMinute": best["speed"],
        "transferPenaltyMinutes": best["penalty"],
        "anchoredCategories": sorted(ANCHORED),
        "training": {
            "loss": "relative_station_error",
            "relativeStationMse": round(best["loss"], 6),
            "stationCorrelation": round(best["correlation"], 4),
            "predictedWeekdayBoardings": round(float(best["predicted"].sum()), 1),
            "observedWeekdayBoardings": round(float(target.sum()), 1),
            "ntdHeavyRailTrips2025": annual,
            "stationTable": "MARTA average weekday entries, 2019, scaled to the 2025 NTD weekday. Each modeled rail trip counts at the home station and again at the destination station, the ride back.",
            "weekendToWeekday": round(WEEKEND_TO_WEEKDAY, 4),
        },
        "stations": [
            {
                "id": station["id"],
                "name": station["name"],
                "observed": round(float(target[index]), 1),
                "predicted": round(float(best["predicted"][index]), 1),
            }
            for index, station in enumerate(stations)
        ],
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT}", flush=True)
    print(
        f"walk {best['speed']} m/min, transfer {best['penalty']} min, "
        f"correlation {best['correlation']:.3f}",
        flush=True,
    )


if __name__ == "__main__":
    main()
