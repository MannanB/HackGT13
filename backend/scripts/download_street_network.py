#!/usr/bin/env python3
"""Download a local OSM walking graph and precompute experimental access routes."""

from __future__ import annotations

import argparse
import heapq
import json
import math
import ssl
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import certifi

OVERPASS_ENDPOINTS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
HIGHWAY_EXCLUSIONS = "motorway|motorway_link|trunk|trunk_link|raceway|construction|proposed"
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "Ripple-HackGT/1.0"})
    with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
        return json.load(response)


def get_all(api_base: str, path: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        payload = get_json(f"{api_base}{path}?limit=200&offset={offset}")
        rows.extend(payload["items"])
        offset += len(payload["items"])
        if offset >= payload["total"]:
            return rows


def fetch_tile(bbox: tuple[float, float, float, float], attempt_offset: int) -> dict:
    south, west, north, east = bbox
    query = (
        f'[out:json][timeout:180];way["highway"]'
        f'["highway"!~"{HIGHWAY_EXCLUSIONS}"]'
        f'["foot"!~"no|private"]({south},{west},{north},{east});out geom;'
    )
    encoded = urllib.parse.urlencode({"data": query}).encode()
    error: Exception | None = None
    for retry in range(4):
        endpoint = OVERPASS_ENDPOINTS[(attempt_offset + retry) % len(OVERPASS_ENDPOINTS)]
        request = urllib.request.Request(
            endpoint,
            data=encoded,
            headers={"User-Agent": "Ripple-HackGT/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=240, context=SSL_CONTEXT) as response:
                return json.load(response)
        except Exception as exc:  # network mirrors can be transient
            error = exc
            time.sleep(3 + retry * 3)
    raise RuntimeError(f"Overpass tile failed: {bbox}") from error


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    scale = math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon2 - lon1) * scale, lat2 - lat1) * 111.2


def simplify(points: list[list[float]], tolerance: float = 0.000045) -> list[list[float]]:
    if len(points) <= 2:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    best_distance = 0.0
    best_index = 0
    for index, (x, y) in enumerate(points[1:-1], 1):
        if denominator == 0:
            distance = math.hypot(x - ax, y - ay)
        else:
            amount = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / denominator))
            distance = math.hypot(x - (ax + amount * dx), y - (ay + amount * dy))
        if distance > best_distance:
            best_distance = distance
            best_index = index
    if best_distance <= tolerance:
        return [points[0], points[-1]]
    left = simplify(points[: best_index + 1], tolerance)
    right = simplify(points[best_index:], tolerance)
    return left[:-1] + right


def nearest_node(
    point: tuple[float, float],
    coords: dict[int, tuple[float, float]],
    buckets: dict[tuple[int, int], list[int]],
    cell: float,
) -> int | None:
    lon, lat = point
    origin = (math.floor(lon / cell), math.floor(lat / cell))
    candidates: list[int] = []
    for radius in range(6):
        for x in range(origin[0] - radius, origin[0] + radius + 1):
            for y in range(origin[1] - radius, origin[1] + radius + 1):
                if radius and abs(x - origin[0]) < radius and abs(y - origin[1]) < radius:
                    continue
                candidates.extend(buckets.get((x, y), ()))
        if candidates:
            return min(candidates, key=lambda node: haversine(point, coords[node]))
    return None


def largest_component(adjacency: dict[int, dict[int, float]]) -> set[int]:
    """Keep access points on the same connected walkable street network."""
    unseen = set(adjacency)
    largest: set[int] = set()
    while unseen:
        seed = unseen.pop()
        component = {seed}
        stack = [seed]
        while stack:
            node = stack.pop()
            for neighbor in adjacency[node]:
                if neighbor not in unseen:
                    continue
                unseen.remove(neighbor)
                component.add(neighbor)
                stack.append(neighbor)
        if len(component) > len(largest):
            largest = component
    return largest


def shortest_tree(
    root: int,
    adjacency: dict[int, dict[int, float]],
    targets: set[int],
    max_distance_km: float = 30,
) -> dict[int, int]:
    distances = {root: 0.0}
    previous: dict[int, int] = {}
    queue = [(0.0, root)]
    remaining = set(targets)
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances.get(node):
            continue
        if distance > max_distance_km:
            break
        remaining.discard(node)
        if not remaining:
            break
        for neighbor, weight in adjacency[node].items():
            candidate = distance + weight
            if candidate >= distances.get(neighbor, math.inf):
                continue
            distances[neighbor] = candidate
            previous[neighbor] = node
            heapq.heappush(queue, (candidate, neighbor))
    return previous


def shortest_path(
    start: int,
    goal: int,
    adjacency: dict[int, dict[int, float]],
    coords: dict[int, tuple[float, float]],
) -> list[int]:
    """A* route for the comparatively short zone-to-nearest-POI walking trips."""
    if start == goal:
        return [start]
    direct = haversine(coords[start], coords[goal])
    distances = {start: 0.0}
    previous: dict[int, int] = {}
    queue = [(direct, 0.0, start)]
    while queue:
        _, distance, node = heapq.heappop(queue)
        if distance != distances.get(node):
            continue
        if node == goal:
            path = [goal]
            while path[-1] != start:
                path.append(previous[path[-1]])
            path.reverse()
            return path
        for neighbor, weight in adjacency[node].items():
            candidate = distance + weight
            if candidate >= distances.get(neighbor, math.inf):
                continue
            distances[neighbor] = candidate
            previous[neighbor] = node
            estimate = candidate + haversine(coords[neighbor], coords[goal])
            heapq.heappush(queue, (estimate, candidate, neighbor))
    return []


def load_pbf(
    path: Path,
    bbox: tuple[float, float, float, float],
) -> tuple[dict[int, tuple[float, float]], dict[int, dict[int, float]]]:
    import osmium

    south, west, north, east = bbox
    coords: dict[int, tuple[float, float]] = {}
    adjacency: dict[int, dict[int, float]] = defaultdict(dict)

    class StreetHandler(osmium.SimpleHandler):
        def way(self, way: object) -> None:
            highway = way.tags.get("highway")
            if not highway or highway in HIGHWAY_EXCLUSIONS.split("|"):
                return
            if way.tags.get("foot") in {"no", "private"}:
                return
            nodes: list[tuple[int, tuple[float, float]]] = []
            for node in way.nodes:
                if not node.location.valid():
                    continue
                point = (node.lon, node.lat)
                if west <= point[0] <= east and south <= point[1] <= north:
                    nodes.append((node.ref, point))
                else:
                    nodes.append((node.ref, (math.nan, math.nan)))
            for (start, a), (end, b) in zip(nodes, nodes[1:]):
                if math.isnan(a[0]) or math.isnan(b[0]):
                    continue
                coords[start] = a
                coords[end] = b
                weight = haversine(a, b)
                adjacency[start][end] = min(weight, adjacency[start].get(end, math.inf))
                adjacency[end][start] = min(weight, adjacency[end].get(start, math.inf))

    handler = StreetHandler()
    handler.apply_file(str(path), locations=True, idx="flex_mem")
    return coords, adjacency


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", default="http://127.0.0.1:8000")
    parser.add_argument("--pbf", type=Path)
    args = parser.parse_args()

    api_base = args.api_base.rstrip("/")
    network = get_json(f"{api_base}/api/v1/network")
    zones = get_all(api_base, "/api/v1/zones")
    pois = get_all(api_base, "/api/v1/pois")
    access = get_all(api_base, "/api/v1/access-edges")
    stations = {row["id"]: row for row in network["stations"]}
    locations = {
        "zone": {row["id"]: row["centroid"] for row in zones},
        "poi": {row["id"]: row["location"] for row in pois},
    }

    station_points = [(row["location"]["lon"], row["location"]["lat"]) for row in stations.values()]
    access_points = [
        (point["lon"], point["lat"])
        for edge in access
        if (point := locations[edge["location_type"]].get(edge["location_id"])) is not None
    ]
    coverage_points = station_points + access_points
    west = min(point[0] for point in coverage_points) - 0.02
    east = max(point[0] for point in coverage_points) + 0.02
    south = min(point[1] for point in coverage_points) - 0.02
    north = max(point[1] for point in coverage_points) + 0.02
    tile = 0.12

    default_pbf = Path(__file__).resolve().parents[1] / "data" / "experimental" / "georgia-latest.osm.pbf"
    pbf_path = args.pbf or default_pbf
    if pbf_path.exists():
        print(f"reading {pbf_path.name}", flush=True)
        coords, adjacency = load_pbf(pbf_path, (south, west, north, east))
        print(f"loaded {len(coords):,} nodes", flush=True)
    else:
        coords = {}
        adjacency = defaultdict(dict)
        tile_number = 0
        lat = south
        while lat < north:
            lon = west
            while lon < east:
                bbox = (lat, lon, min(north, lat + tile), min(east, lon + tile))
                payload = fetch_tile(bbox, tile_number)
                tile_number += 1
                for way in payload.get("elements", []):
                    node_ids = way.get("nodes", [])
                    geometry = way.get("geometry", [])
                    if len(node_ids) != len(geometry):
                        continue
                    for node_id, point in zip(node_ids, geometry, strict=True):
                        coords[node_id] = (point["lon"], point["lat"])
                    for start, end in zip(node_ids, node_ids[1:]):
                        weight = haversine(coords[start], coords[end])
                        adjacency[start][end] = min(weight, adjacency[start].get(end, math.inf))
                        adjacency[end][start] = min(weight, adjacency[end].get(start, math.inf))
                print(f"tile {tile_number}: {len(coords):,} nodes", flush=True)
                lon += tile
                time.sleep(1)
            lat += tile

    walkable_component = largest_component(adjacency)
    print(f"using connected street network with {len(walkable_component):,} nodes", flush=True)
    cell = 0.002
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for node_id, (lon, lat) in coords.items():
        if node_id not in walkable_component:
            continue
        buckets[(math.floor(lon / cell), math.floor(lat / cell))].append(node_id)

    station_nodes = {
        station_id: nearest_node(
            (row["location"]["lon"], row["location"]["lat"]), coords, buckets, cell
        )
        for station_id, row in stations.items()
    }
    access_by_station: dict[str, list[dict]] = defaultdict(list)
    for edge in access:
        access_by_station[edge["station_id"]].append(edge)

    routes: dict[str, list[list[float]]] = {}
    for index, (station_id, edges) in enumerate(access_by_station.items(), 1):
        root = station_nodes.get(station_id)
        if root is None:
            continue
        targets: list[tuple[dict, tuple[float, float], int]] = []
        for edge in edges:
            row = locations[edge["location_type"]].get(edge["location_id"])
            if not row:
                continue
            point = (row["lon"], row["lat"])
            if not (west <= point[0] <= east and south <= point[1] <= north):
                continue
            cursor = nearest_node(point, coords, buckets, cell)
            if cursor is not None:
                targets.append((edge, point, cursor))
        previous = shortest_tree(root, adjacency, {target for _, _, target in targets})
        for edge, point, cursor in targets:
            if cursor != root and cursor not in previous:
                continue
            path = [[round(point[0], 6), round(point[1], 6)]]
            guard = 0
            while cursor != root and guard < 20_000:
                lon, lat = coords[cursor]
                path.append([round(lon, 6), round(lat, 6)])
                cursor = previous[cursor]
                guard += 1
            station_point = stations[station_id]["location"]
            path.append([round(station_point["lon"], 6), round(station_point["lat"], 6)])
            key = f'{edge["location_type"]}:{edge["location_id"]}:{station_id}'
            routes[key] = simplify(path)
        print(f"station {index}/{len(access_by_station)}: {len(routes):,} routes")

    pois_by_category: dict[str, list[dict]] = defaultdict(list)
    for poi in pois:
        pois_by_category[poi["category"]].append(poi)
    for index, zone in enumerate(zones, 1):
        zone_point = (zone["centroid"]["lon"], zone["centroid"]["lat"])
        zone_node = nearest_node(zone_point, coords, buckets, cell)
        if zone_node is None:
            continue
        for category_pois in pois_by_category.values():
            poi = min(
                category_pois,
                key=lambda item: haversine(
                    zone_point,
                    (item["location"]["lon"], item["location"]["lat"]),
                ),
            )
            poi_point = (poi["location"]["lon"], poi["location"]["lat"])
            poi_node = nearest_node(poi_point, coords, buckets, cell)
            if poi_node is None:
                continue
            node_path = shortest_path(zone_node, poi_node, adjacency, coords)
            if not node_path:
                continue
            path = [[round(zone_point[0], 6), round(zone_point[1], 6)]]
            path.extend([[round(coords[node][0], 6), round(coords[node][1], 6)] for node in node_path])
            path.append([round(poi_point[0], 6), round(poi_point[1], 6)])
            routes[f'direct:{zone["id"]}:{poi["id"]}'] = simplify(path)
        if index % 50 == 0 or index == len(zones):
            print(f"direct {index}/{len(zones)}: {len(routes):,} total routes", flush=True)

    for index, poi in enumerate(pois, 1):
        poi_point = (poi["location"]["lon"], poi["location"]["lat"])
        zone = min(
            zones,
            key=lambda item: haversine(
                poi_point,
                (item["centroid"]["lon"], item["centroid"]["lat"]),
            ),
        )
        key = f'direct:{zone["id"]}:{poi["id"]}'
        if key in routes:
            continue
        zone_point = (zone["centroid"]["lon"], zone["centroid"]["lat"])
        zone_node = nearest_node(zone_point, coords, buckets, cell)
        poi_node = nearest_node(poi_point, coords, buckets, cell)
        if zone_node is None or poi_node is None:
            continue
        node_path = shortest_path(zone_node, poi_node, adjacency, coords)
        if not node_path:
            continue
        path = [[round(zone_point[0], 6), round(zone_point[1], 6)]]
        path.extend([[round(coords[node][0], 6), round(coords[node][1], 6)] for node in node_path])
        path.append([round(poi_point[0], 6), round(poi_point[1], 6)])
        routes[key] = simplify(path)
        if index % 100 == 0 or index == len(pois):
            print(f"poi coverage {index}/{len(pois)}: {len(routes):,} total routes", flush=True)

    output_dir = Path(__file__).resolve().parents[1] / "data" / "experimental"
    output_dir.mkdir(parents=True, exist_ok=True)
    graph = {
        "metadata": {"source": "OpenStreetMap via Overpass", "bbox": [west, south, east, north]},
        "nodes": [[node_id, round(lon, 6), round(lat, 6)] for node_id, (lon, lat) in coords.items()],
        "edges": [[start, end] for start, neighbors in adjacency.items() for end in neighbors if start < end],
    }
    (output_dir / "streets.graph.json").write_text(json.dumps(graph, separators=(",", ":")))
    payload = {
        "available": True,
        "metadata": {
            "experimental": True,
            "source": "OpenStreetMap",
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "nodeCount": len(coords),
            "routeCount": len(routes),
        },
        "routes": routes,
    }
    (output_dir / "street_routes.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"done: {len(coords):,} street nodes, {len(routes):,} walking routes")


if __name__ == "__main__":
    main()
