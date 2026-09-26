# Ripple — Design

Ripple is a map-first **MARTA rail disruption and access planner** for Atlanta. Planners set station closures, describe city-scale events, or site new facilities, then see how residential block groups lose or gain access to hospitals, groceries, schools, and other destinations.

The product name in the UI is **Ripple**. The backend package is `hackgt13-api`; the frontend package is `ripple`. Simulation of access and impact runs **in the browser**. The API supplies geography, enrichment JSON, LLM event mapping, live trains, and caches.

---

## 1. High-level architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  frontend (Vite + React)    │  /api   │  backend (FastAPI)           │
│  MapLibre + deck.gl         │ ──────► │  repositories + LLM          │
│  Zustand store              │         │  file-backed experimental    │
│  accessSimulator (client)   │         └──────────────┬───────────────┘
└─────────────────────────────┘                        │ psycopg
                                                       ▼
                                        PostgreSQL + PostGIS + TimescaleDB
                                                       ▲
                                        data/ ETL scripts (GTFS, ACS, OSM, CMS)
```

Dev: Vite on `localhost:5173` proxies `/api` and `/health` to FastAPI on `127.0.0.1:8000`.

---

## 2. Repository structure

```
HackGT13/
├── frontend/                 # React app
├── backend/                  # FastAPI app, SQL migrations, experimental JSON
├── data/                     # ETL builders (Postgres loaders + JSON artifacts)
├── DESIGN.md                 # this document
└── README.md
```

### Frontend (`frontend/`)

| Path | Role |
|------|------|
| `src/App.tsx` | Mounts `AppShell` |
| `src/main.tsx` | React entry |
| `src/store/scenarioStore.ts` | Zustand: load, modes, recompute, CIP, intelligence |
| `src/services/` | API clients, access sim, forecast, CIP, live trains |
| `src/components/layout/AppShell.tsx` | Map + sidebars + timeline |
| `src/components/map/` | MapLibre / deck.gl layers |
| `src/components/scenario/` | Station, POI, and service controls |
| `src/components/impact/` | Summary, equity, POI pressure, forecasts |
| `src/components/intelligence/` | Natural-language event panel |
| `src/components/trace/` | Zone path before/after |
| `src/components/timeline/TimeSlider.tsx` | Failure clock |
| `src/data/hourlyDemandProfiles.json` | Time-of-day demand shares |
| `src/data/hospitalBeds.json` | CMS bed / occupancy lookup |
| `src/types/` | TypeScript models |
| `vite.config.ts` | `@` alias, API proxy |

### Backend (`backend/`)

| Path | Role |
|------|------|
| `app/main.py` | FastAPI app, CORS, lifespan |
| `app/config.py` | Settings (`DATABASE_URL`, Gemini / xAI / OpenAI, CORS) |
| `app/db.py` | psycopg connection pool |
| `app/migrate.py` | Applies `sql/001`–`004` |
| `app/api/` | HTTP routers |
| `app/repositories/` | SQL |
| `app/schemas.py` | Pydantic models |
| `app/gemini.py`, `xai.py`, `openai.py`, `events.py` | LLM event interpretation |
| `app/hospital_choice.py` | Conditional-logit prior |
| `app/activity_model.py` | Serves Atlanta day-demand JSON |
| `sql/` | Schema and migrations |
| `data/experimental/` | File-backed overlay (not Postgres) |
| `tests/` | Health, OpenAPI surface, hospital choice |

### Data pipelines (`data/`)

| Path | Role |
|------|------|
| `gtfs/` | Fetch/load MARTA GTFS → `stations`, `transit_edges` |
| `residentials/` | TIGER block groups + ACS → `residential_zones` |
| `poi/` | OSMnx Overpass → `points_of_interest` |
| `access_edges/` | Walk links zone/POI → stations |
| `experimental/` | ACS / LODES / OSM → `backend/data/experimental/context.json` |
| `time_profiles/` | NHTS + NHAMCS → `hourlyDemandProfiles.json` |
| `hospitals/` | CMS beds + Medicare origin table |
| `activity/` | Train Atlanta day-demand model JSON |
| `requirements.txt` | geopandas, osmnx, psycopg, requests, python-dotenv |

---

## 3. Technologies

### Frontend

| Tech | Version (declared) |
|------|-------------------|
| React / React DOM | ^19.2.8 |
| TypeScript | ~6.0.2 |
| Vite | ^8.3.0 |
| Tailwind CSS + `@tailwindcss/vite` | ^4.3.3 |
| Zustand | ^5.0.15 |
| MapLibre GL | ^6.11.2 |
| react-map-gl | ^8.1.3 |
| deck.gl (`@deck.gl/core`, layers, mapbox, react, extensions) | ^9.4.0 |
| lucide-react | ^1.48.0 |
| clsx / tailwind-merge | ^2.1.1 / ^3.7.0 |
| oxlint | ^1.81.0 |

Basemap: Carto Dark Matter (no labels). Fonts: Geist, Geist Mono, Instrument Serif.

### Backend

| Tech | Spec |
|------|------|
| Python | ≥ 3.11 (Ruff target py312) |
| FastAPI | ≥ 0.115.6 |
| Uvicorn | ≥ 0.34.0 |
| pydantic-settings | ≥ 2.7.0 |
| psycopg / psycopg-pool | ≥ 3.2.4 |
| pytest / httpx (dev) | ≥ 8.3.0 / ≥ 0.28.0 |
| osmium (optional `[data]`) | ≥ 4.3.0 |

### Database

PostgreSQL with **PostGIS** (geography) and **TimescaleDB** (hypertable on `travel_times`).

Upstream sources, live feeds, and model APIs are listed in section 5.

---

## 4. User flows and modes

`AppMode` in `frontend/src/store/scenarioStore.ts`:

| Mode | Intent |
|------|--------|
| **disrupt** | Set stations to `maintenance` (board blocked, trains pass) or `shutdown` (line cut). Map shows delay; impact panel shows communities, POI pressure, forecasts. |
| **add** | Place or drag new POIs (or CIP-optimal sites). Green indicates ≥ 15 minutes access gain vs baseline, optionally over an active disruption. |
| **intel** | Natural-language event → Gemini, then Grok, then OpenAI → station impacts + radius → same disruption simulator. |
| **build** | Add or remove stations and destinations in the shared database. Unlike the other tabs, these changes are permanent. |

Typical path:

1. App mounts → `AppShell` → `loadNetwork()` fetches network, zones, POIs, access edges, experimental context, street routes, activity model.
2. Map renders MARTA, zones, and POIs; optional live trains.
3. Left sidebar: scenario controls. Right: impact, intelligence, or build. Bottom: timeline.
4. Station state / added POI / intel event → `buildAccessSimulation` or `buildAdditionSimulation`.
5. Click a zone → path before/after. Timeline sets failure start and elapsed clock.

Other flows:

- **POI critical index** — which station closures hurt a facility most; cached by network fingerprint (`/api/v1/poi-critical-cache/{fingerprint}`).
- **CIP planner** — budget + sector → `planCapitalImprovements` → `addedPois`; optional PDF (`cipPdf.ts`).
- **Forecast charts** — 6 / 12 / 24 hour person-minutes and hospital occupancy paths (`forecast.ts`).

---

## 5. Data sources

Every upstream input is listed once. Derived tables and JSON built from these inputs are at the end of this section.

### Static datasets

| # | Source | Publisher | Vintage | Supplies | Lands in | Builder |
|---|--------|-----------|---------|----------|----------|---------|
| 1 | MARTA GTFS (`google_transit.zip`) | MARTA | Current feed | Rail stations and directed ride edges (Red, Gold, Blue, Green) | `stations`, `transit_edges` | `data/gtfs/fetch_gtfs.py`, `data/gtfs/load_gtfs.py` |
| 2 | TIGER/Line block groups (`tl_2024_13_bg.zip`) | U.S. Census Bureau | 2024 | Fulton (`121`) and DeKalb (`089`) block-group polygons and internal points | `residential_zones` | `data/residentials/fetch_block_groups.py`, `load_residential_zones.py` |
| 3 | American Community Survey 5-year | U.S. Census Bureau | 2024 | Population, income, vehicles, transit commute, poverty, disability, age, limited English | `residential_zones`; also `context.json` | `data/residentials/fetch_acs.py` (`CENSUS_API_KEY` optional) |
| 4 | LODES 8.4 OD and WAC (Georgia) | U.S. Census Bureau / LEHD | 2023 | Commute flows and workplace jobs | `backend/data/experimental/context.json` | `data/experimental/build_experimental_data.py` |
| 5 | 2020 Atlanta urban area facts | U.S. Census Bureau | 2020 | Density benchmark, 1,998 people per square mile | Density uplift inside `hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 6 | OpenStreetMap POIs | OSM contributors, via OSMnx / Overpass | Live extract | Hospital, clinic, school, university, library, townhall, supermarket | `points_of_interest`; hours and capacity tags in `context.json` | `data/poi/fetch_pois.py`, `data/poi/load_pois.py` |
| 7 | Georgia OSM PBF | Geofabrik | Latest extract | Walking-route cache | `backend/data/experimental/street_routes.json` | `backend/scripts/download_street_network.py` |
| 8 | OpenStreetMap streets | OSM contributors, via Overpass | Live extract | Local walking graph for experimentation | `backend/data/experimental/streets.graph.json` (gitignored) | `backend/scripts/download_street_network.py` |
| 9 | Provider Specific Files | CMS | Latest record | Inpatient, psychiatric, and long-term-care bed counts | `frontend/src/data/hospitalBeds.json` | `data/hospitals/build_hospital_beds.py` |
| 10 | Hospital Provider Cost Report | CMS | 2023 utilization fields | Inpatient days, bed-days, discharges → occupancy and length of stay | `frontend/src/data/hospitalBeds.json` | `data/hospitals/build_hospital_beds.py` |
| 11 | Hospital Service Area | CMS | Calendar year 2024 | Atlanta ZIP × CCN Medicare inpatient discharges | `data/hospitals/atlanta_medicare_origins.json` | `data/hospitals/build_hospital_choice.py` |
| 12 | National Household Travel Survey v2.1 | FHWA | 2022 | Weighted arrival hour by trip purpose | `frontend/src/data/hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 13 | National Hospital Ambulatory Medical Care Survey, ED file | CDC / NCHS | 2022 | 24-hour emergency-department arrival profile | `frontend/src/data/hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 14 | Medical Expenditure Panel Survey, outpatient visits | AHRQ | 2024 | National outpatient volume; model uses 1 visit per person-year | Hospital demand blend in `hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 15 | Common Core of Data, school membership | NCES | 2023–24 | Public-school enrollment, matched by normalized name | `context.json`, only with `--with-nces` | `data/experimental/build_experimental_data.py` |
| 16 | National Transit Database monthly ridership (`ntd_id` 40022, mode HR) | FTA | 2025 | System weekday boarding total used to scale the day model | `data/activity/atlanta_day_model.json` | `data/activity/train_day_model.py` |
| 17 | MARTA average weekday station entries | MARTA | 2019 | Station mix; scaled so the system total matches the 2025 NTD weekday | `data/activity/atlanta_day_model.json` | `data/activity/train_day_model.py` |

URLs:

1. `https://itsmarta.com/google_transit_feed/google_transit.zip`
2. `https://www2.census.gov/geo/tiger/TIGER2024/BG/tl_2024_13_bg.zip`
3. `https://api.census.gov/data/2024/acs/acs5`
4. `https://lehd.ces.census.gov/data/lodes/LODES8/ga`
5. `https://www.census.gov/programs-surveys/geography/guidance/geo-areas/urban-rural/2020-ua-facts.html`
6. OpenStreetMap via OSMnx (Overpass). Source tag on rows: `openstreetmap`.
7. `https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf`
8. Overpass (`overpass.kumi.systems`, `overpass-api.de`). Street data © OpenStreetMap contributors, ODbL.
9. `https://pds.mps.cms.gov/fiss/inpatient/export` (inpatient, IPF, and LTCH, latest record only)
10. `https://data.cms.gov/data-api/v1/dataset/44060663-47d8-4ced-a115-b53b4c270acb/data`
11. `https://data.cms.gov/sites/default/files/2025-07/8fca1932-adaa-411d-a912-78fb0854a286/Hospital_Service_Area_2024.csv`
12. `https://nhts.ornl.gov/media/2022/download/csv.zip`
13. `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHAMCS/ed2022.zip`
14. `https://meps.ahrq.gov/data_stats/download_data/pufs/h254f/h254fdoc.shtml`
15. `https://nces.ed.gov/ccd/Data/zip/ccd_sch_052_2324_l_1a_073124.zip`
16. `https://data.transportation.gov/resource/8bui-9xvu.json`
17. Published station table embedded in `data/activity/train_day_model.py` (`ENTRIES_2019`).

Notes on hospitals and demand:

- CMS beds are a hand-reviewed OSM id → CCN crosswalk. Unmatched OSM hospitals stay without assumed bed counts.
- Occupancy = reported inpatient days / reported bed-days available. Average length of stay = reported inpatient days / reported discharges. These are annual operating estimates, not live beds.
- CMS suppresses small ZIP–hospital counts as `*`; those rows are omitted from the origin table. The choice model is not fit to that table yet.
- Hourly profiles are national proxies. Block groups denser than 1,998 people per square mile get a square-root density uplift capped at 2.5×.
- NCES is optional. Without `--with-nces`, school capacity is used only where OpenStreetMap publishes a capacity-like tag.

### Live feeds

| # | Source | Publisher | Supplies | Lands in |
|---|--------|-----------|----------|----------|
| 18 | Rail realtime arrivals | MARTA | Train id, position, waiting time | `GET /api/v1/live/trains` proxies the feed; the browser never calls MARTA directly |

URL: `https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata`

### Model APIs

Intelligence tries these in order. Keys stay on the server.

| # | Source | Default model | Role | Code |
|---|--------|---------------|------|------|
| 19 | Google Gemini | `gemini-3.5-flash` | First interpreter for a natural-language event | `backend/app/gemini.py` |
| 20 | xAI Grok | `grok-4` | Fallback if Gemini fails | `backend/app/xai.py` |
| 21 | OpenAI Chat Completions | `gpt-4o-mini` | Fallback if Gemini and Grok both fail | `backend/app/openai.py` |

Tool schema: `simulate_urban_event` in `backend/app/events.py`. Endpoint: `POST /api/v1/intelligence/events`.

### Map tiles

| # | Source | Supplies |
|---|--------|----------|
| 22 | Carto Dark Matter, no labels | Basemap style only. Not used in the access model. |

URL: `https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json`

### Derived, not upstream

| Artifact | Built from | Rule |
|----------|------------|------|
| `access_edges` | Zones, POIs, stations | Straight-line walk at 80 m/min. Nearest station, plus up to two more within 1.5 miles. Script: `data/access_edges/load_access_edges.py`. |
| `backend/data/experimental/context.json` | ACS, LODES, OSM, optional NCES | File overlay. Not written to PostgreSQL. Committed copy omits origin–destination flows. |
| `frontend/src/data/hourlyDemandProfiles.json` | NHTS, NHAMCS, MEPS, Census density | Tracked so the app runs without refreshing the federal ZIPs. |
| `frontend/src/data/hospitalBeds.json` | CMS PSF + cost report, OSM crosswalk | Tracked so the app runs without a runtime CMS request. |
| `data/hospitals/atlanta_medicare_origins.json` | CMS Hospital Service Area | Training table for a later conditional-logit fit. |
| `data/activity/atlanta_day_model.json` | ACS-style zone features, 2019 entries, 2025 NTD | Served at `GET /api/v1/activity/model`. Adjusts trip rates and walk/transfer constants when present. |

---

## 6. Database schema

Core tables (`backend/sql/001_schema.sql` plus later migrations):

| Table | Contents |
|-------|----------|
| `stations` | Rail stops, lines (`Red` / `Gold` / `Blue` / `Green`), geography |
| `transit_edges` | Directed rail segments, travel and frequency minutes |
| `residential_zones` | Block-group polygons, centroid, population, income (+ extra ACS via `002`) |
| `points_of_interest` | Destinations; unique `(source, source_id)` (`003`) |
| `access_edges` | Walk minutes zone/POI → station |
| `scenarios` | Named disruption sets |
| `travel_times` | Timescale hypertable of computed times |
| `poi_critical_cache` | Fingerprinted POI-critical results (`004`) |
| `schema_migrations` | Applied SQL files |

---

## 7. API

Mounted from `backend/app/api/router.py`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Process health |
| GET | `/health/db` | Database ping |
| GET | `/api/v1` | Resource list |
| GET/POST | `/api/v1/stations` | Station catalog |
| GET | `/api/v1/stations/nearby` | Spatial lookup |
| GET/PATCH/DELETE | `/api/v1/stations/{station_id}` | Station CRUD |
| GET/POST | `/api/v1/transit-edges` | Rail edges |
| DELETE | `/api/v1/transit-edges/{edge_id}` | Delete edge |
| GET | `/api/v1/network` | Stations + edges together |
| GET/POST | `/api/v1/zones` | Residential zones |
| GET/DELETE | `/api/v1/zones/{zone_id}` | Zone CRUD |
| GET/POST | `/api/v1/pois` | Points of interest |
| GET/DELETE | `/api/v1/pois/{poi_id}` | POI CRUD |
| GET/POST | `/api/v1/access-edges` | Walk links |
| DELETE | `/api/v1/access-edges/{edge_id}` | Delete link |
| GET/POST | `/api/v1/scenarios` | Saved scenarios |
| GET/PATCH/DELETE | `/api/v1/scenarios/{scenario_id}` | Scenario CRUD |
| GET | `/api/v1/scenarios/{scenario_id}/impact` | Server-side impact rows |
| GET/POST | `/api/v1/travel-times` | Timescale results |
| GET/PUT | `/api/v1/poi-critical-cache/{fingerprint}` | Critical-index cache |
| POST | `/api/v1/intelligence/events` | LLM event → station impacts |
| GET | `/api/v1/live/trains` | MARTA realtime proxy |
| GET | `/api/v1/experimental/context` | Enrichment JSON (OD flows stripped) |
| GET | `/api/v1/experimental/street-routes` | Walking-route cache |
| GET | `/api/v1/hospital-choice/model` | Logit prior weights |
| GET | `/api/v1/activity/model` | Day-demand model |

Frontend catalog client: `frontend/src/services/api.ts`. Intelligence and live trains use dedicated `fetch` helpers.

---

## 8. Frontend architecture

### Store

`scenarioStore.ts` holds stations, edges, zones, POIs, street routes, station states, selected destination categories, failure clock, simulation results, CIP plan, intel event, and critical-index progress.

On load it parallel-fetches geo payloads, attaches experimental attributes and hospital beds, attaches access edges, and reads or builds the POI critical cache. Recompute uses generation counters to debounce.

### Services

| File | Role |
|------|------|
| `api.ts` | Base URL, GET/PUT, pagination |
| `stationService.ts` | Network mapping |
| `geoService.ts` | Zones, POIs, access, experimental, hospital beds |
| `accessSimulator.ts` | Rail graph + impact engine |
| `forecast.ts` | Horizon and occupancy forecasts |
| `hourlyDemand.ts` | Demand over profiles + activity model |
| `activityModel.ts` | Optional day-model rates |
| `hospitalChoice.ts` | Logit utility helper (model fetch; assignment in sim is nearest-by-time today) |
| `intelligenceService.ts` | POST events |
| `liveTrains.ts` | Train polling / motion |
| `criticalCache.ts` | Fingerprint + cache API |
| `cipPlanner.ts` / `cipPdf.ts` | Capital plan and PDF |

### Map layers (`CivicMap.tsx`)

1. `ZoneImpactLayer` — delay/gain choropleth
2. `EventRadiusLayer` — intelligence radius
3. `MartaNetworkLayer` — rail lines
4. `FlowMapLayer` — passenger flows
5. `PoiLayer` — destinations and hospital load
6. `RouteLayer` — selected zone path
7. `StationLayer` — operating state
8. `LiveTrainLayer` — realtime / simulated trains
9. `AddedPoiLayer` — draggable new sites

### Layout

- Left: `ScenarioSidebar` (station / add / intel / build + `ServiceLayerToggle`)
- Right: `ImpactPanel`, `IntelligencePanel`, or `BuildPanel`
- Bottom: `TimeSlider`
- Trace: `TraceImpactPanel`, `BeforeAfterComparison`, `DependencyChain`

---

## 9. Simulation, forecast, hospital, and intelligence

### Access simulation (`accessSimulator.ts`)

1. All-pairs rail graph (Floyd–Warshall style `dist` / `next`). Shutdown removes stations from the graph. Maintenance marks stations unboardable.
2. Zone ↔ station walk from `access_edges` (nearest-station fallback).
3. Per category: schools / government / university stay anchored to the geographically closest POI; other categories pick minimum door-to-door minutes.
4. Hospitals: rank by trip time; assign each zone’s demand to the closest hospital under disruption; track redirects for capacity surge.
5. Demand: `hourlyZoneDemand` / `aggregateZoneDemand` (profiles, ACS transit-dependent slice, optional activity model).
6. Outputs: `zoneImpacts`, traces, `poiPressure`, `hospitalCapacity`, flow journeys, summary stats.

**Addition** compares access with vs without `addedPois`. `findOptimalAdditionSite` places a site. CIP stacks sites under budget and sector costs (`facilityCosts.ts`).

### Forecast (`forecast.ts`)

From closure (and optional addition) results: hourly arrivals, delayed trips, person-minutes, and trips beyond 20 / 40 / 60 minutes. Hospitals: occupancy path with exponential stay, `fullAtHour`, overflow ranking, cascade stages.

### Hospital choice

Backend prior (`hospital_choice.py`): untrained conditional logit on travel minutes, log beds, and occupancy (`trained: false`). Training table `atlanta_medicare_origins.json` is prepared for a future cross-entropy fit. Runtime assignment uses **nearest travel time** plus CMS beds from `hospitalBeds.json`.

### Intelligence

User prompt + station catalog → `POST /api/v1/intelligence/events`. Order: Gemini, then Grok, then OpenAI. Tool schema `simulate_urban_event` in `events.py`. `applyIntelEvent` sets station states, focus bounds, and runs the disruption sim.

---

## 10. Local run

```bash
# API
cd backend
# DATABASE_URL (and optional GEMINI / XAI / OPENAI keys) in .env
# apply migrations, then:
uvicorn app.main:app --reload --port 8000

# UI
cd frontend
npm install
npm run dev   # http://localhost:5173
```

ETL scripts under `data/` expect the same `DATABASE_URL` as the API, except the experimental, time-profile, and hospital builders, which write JSON files.
