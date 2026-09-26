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
├── design.md                 # this document
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
| `app/config.py` | Settings (`DATABASE_URL`, Gemini/OpenAI, CORS) |
| `app/db.py` | psycopg connection pool |
| `app/migrate.py` | Applies `sql/001`–`004` |
| `app/api/` | HTTP routers |
| `app/repositories/` | SQL |
| `app/schemas.py` | Pydantic models |
| `app/gemini.py`, `openai.py`, `events.py` | LLM event interpretation |
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

### External services

| Service | Use |
|---------|-----|
| MARTA GTFS zip | Rail stations and edges |
| MARTA realtime arrivals | Live trains |
| Census ACS 2024 5-year | Demographics |
| Census TIGER 2024 block groups | Zone polygons |
| Census LODES (GA) | Commute / workplace jobs |
| OpenStreetMap / OSMnx / Geofabrik Georgia PBF | POIs, walking routes |
| CMS Provider / Cost Report / HSA | Hospital beds and Medicare origins |
| NHTS 2022, CDC NHAMCS 2022, AHRQ MEPS | Hourly demand |
| Google Gemini (e.g. `gemini-3.5-flash`) | Intelligence events |
| OpenAI Chat Completions (e.g. `gpt-4o-mini`) | Fallback intelligence |
| NCES CCD (optional) | School enrollment overlay |
| National Transit Database | Activity-model boarding calibration |

---

## 4. User flows and modes

`AppMode` in `frontend/src/store/scenarioStore.ts`:

| Mode | Intent |
|------|--------|
| **disrupt** | Set stations to `maintenance` (board blocked, trains pass) or `shutdown` (line cut). Map shows delay; impact panel shows communities, POI pressure, forecasts. |
| **add** | Place or drag new POIs (or CIP-optimal sites). Green indicates ≥ 15 minutes access gain vs baseline, optionally over an active disruption. |
| **intel** | Natural-language event → Gemini/OpenAI tool call → station impacts + radius → same disruption simulator. |

Typical path:

1. App mounts → `AppShell` → `loadNetwork()` fetches network, zones, POIs, access edges, experimental context, street routes, activity model.
2. Map renders MARTA, zones, and POIs; optional live trains.
3. Left sidebar: scenario controls. Right: impact or intelligence. Bottom: timeline.
4. Station state / added POI / intel event → `buildAccessSimulation` or `buildAdditionSimulation`.
5. Click a zone → path before/after. Timeline sets failure start and elapsed clock.

Other flows:

- **POI critical index** — which station closures hurt a facility most; cached by network fingerprint (`/api/v1/poi-critical-cache/{fingerprint}`).
- **CIP planner** — budget + sector → `planCapitalImprovements` → `addedPois`; optional PDF (`cipPdf.ts`).
- **Forecast charts** — 6 / 12 / 24 hour person-minutes and hospital occupancy paths (`forecast.ts`).

---

## 5. Data sources

### MARTA GTFS

- Source: `https://itsmarta.com/google_transit_feed/google_transit.zip`
- Scripts: `data/gtfs/fetch_gtfs.py`, `data/gtfs/load_gtfs.py`
- Loads: upsert `stations`, replace `transit_edges` (Red, Gold, Blue, Green rail)

### Residential zones (TIGER + ACS)

- TIGER 2024 Georgia block groups (`tl_2024_13_bg.zip`), Fulton (`121`) and DeKalb (`089`)
- ACS 2024 5-year: population, income, vehicles, transit, poverty, disability, age, LEP, etc.
- Scripts: `fetch_block_groups.py`, `fetch_acs.py`, `load_residential_zones.py`
- Load: `residential_zones` near stations (optional `CENSUS_API_KEY`)

### POIs (OpenStreetMap)

- Tags: hospital, clinic, school, university, library, townhall, supermarket
- Scripts: `data/poi/fetch_pois.py`, `data/poi/load_pois.py` → `points_of_interest`

### Access edges

- Script: `data/access_edges/load_access_edges.py`
- Straight-line walk at 80 m/min; nearest station plus up to two more within 1.5 miles
- Table: `access_edges` (`zone` or `poi`)

### Hourly demand profiles

- Builder: `data/time_profiles/build_hourly_profiles.py`
- Artifact: `frontend/src/data/hourlyDemandProfiles.json`
- NHTS 2022 purpose arrivals, NHAMCS 2022 ED arrivals, MEPS outpatient proxy (~1 visit/person-year)
- Density uplift vs Atlanta urban density (1,998 people/mi², cap 2.5×)

### Hospitals (CMS)

- `data/hospitals/build_hospital_beds.py` → `frontend/src/data/hospitalBeds.json` (keyed by OSM id)
- Occupancy = inpatient days / bed-days available; ALOS = inpatient days / discharges
- `data/hospitals/build_hospital_choice.py` → `data/hospitals/atlanta_medicare_origins.json` (ZIP × CCN discharges for a future choice-model fit)
- Unmatched OSM hospitals stay without assumed bed counts

### Experimental overlay (files only)

- Builder: `data/experimental/build_experimental_data.py`
- Output: `backend/data/experimental/context.json` (gitignored)
- ACS, LODES commute/jobs, POI hours/capacity; optional NCES enrollment
- Walking cache: `street_routes.json` from Geofabrik Georgia OSM PBF (`backend/scripts/download_street_network.py`)
- Not written to PostgreSQL

### Activity day model

- Trainer: `data/activity/train_day_model.py` → `data/activity/atlanta_day_model.json`
- Served at `GET /api/v1/activity/model`; used when present to adjust trip rates and walk/transfer constants

---

## 6. Database schema

Core tables (`backend/sql/001_schema.sql` plus later migrations):

| Table | Contents |
|-------|----------|
| `stations` | Rail stops, lines (`Red`/`Gold`/`Blue`/`Green`), geography |
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

- Left: `ScenarioSidebar` (station / add / intel + `ServiceLayerToggle`)
- Right: `ImpactPanel` or `IntelligencePanel`
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

Backend prior (`hospital_choice.py`): untrained conditional logit on travel minutes, log beds, and occupancy (`trained: false`). Training table `atlanta_medicare_origins.json` is prepared for a future CE fit. Runtime assignment uses **nearest travel time** plus CMS beds from `hospitalBeds.json`.

### Intelligence

User prompt + station catalog → `POST /api/v1/intelligence/events`. Prefer Gemini; fall back to OpenAI. Tool schema `simulate_urban_event` in `events.py`. `applyIntelEvent` sets station states, focus bounds, and runs the disruption sim.

---

## 10. Local run

```bash
# API
cd backend
# DATABASE_URL (and optional GEMINI / OPENAI keys) in .env
# apply migrations, then:
uvicorn app.main:app --reload --port 8000

# UI
cd frontend
npm install
npm run dev   # http://localhost:5173
```

ETL scripts under `data/` expect the same `DATABASE_URL` as the API (except experimental/time-profile/hospital builders, which write JSON files).
