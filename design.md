# RIPPLE — DESIGN

RIPPLE IS A MAP-FIRST **MARTA RAIL DISRUPTION AND ACCESS PLANNER** FOR ATLANTA. PLANNERS SET STATION CLOSURES, DESCRIBE CITY-SCALE EVENTS, OR SITE NEW FACILITIES, THEN SEE HOW RESIDENTIAL BLOCK GROUPS LOSE OR GAIN ACCESS TO HOSPITALS, GROCERIES, SCHOOLS, AND OTHER DESTINATIONS.

THE PRODUCT NAME IN THE UI IS **RIPPLE**. THE BACKEND PACKAGE IS `hackgt13-api`; THE FRONTEND PACKAGE IS `ripple`. SIMULATION OF ACCESS AND IMPACT RUNS **IN THE BROWSER**. THE API SUPPLIES GEOGRAPHY, ENRICHMENT JSON, LLM EVENT MAPPING, LIVE TRAINS, AND CACHES.

---

## 1. HIGH-LEVEL ARCHITECTURE

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

DEV: VITE ON `localhost:5173` PROXIES `/api` AND `/health` TO FASTAPI ON `127.0.0.1:8000`.

---

## 2. REPOSITORY STRUCTURE

```
HackGT13/
├── frontend/                 # React app
├── backend/                  # FastAPI app, SQL migrations, experimental JSON
├── data/                     # ETL builders (Postgres loaders + JSON artifacts)
├── design.md                 # this document
└── README.md
```

### FRONTEND (`frontend/`)

| PATH | ROLE |
|------|------|
| `src/App.tsx` | MOUNTS `AppShell` |
| `src/main.tsx` | REACT ENTRY |
| `src/store/scenarioStore.ts` | ZUSTAND: LOAD, MODES, RECOMPUTE, CIP, INTELLIGENCE |
| `src/services/` | API CLIENTS, ACCESS SIM, FORECAST, CIP, LIVE TRAINS |
| `src/components/layout/AppShell.tsx` | MAP + SIDEBARS + TIMELINE |
| `src/components/map/` | MAPLIBRE / DECK.GL LAYERS |
| `src/components/scenario/` | STATION, POI, AND SERVICE CONTROLS |
| `src/components/impact/` | SUMMARY, EQUITY, POI PRESSURE, FORECASTS |
| `src/components/intelligence/` | NATURAL-LANGUAGE EVENT PANEL |
| `src/components/trace/` | ZONE PATH BEFORE/AFTER |
| `src/components/timeline/TimeSlider.tsx` | FAILURE CLOCK |
| `src/data/hourlyDemandProfiles.json` | TIME-OF-DAY DEMAND SHARES |
| `src/data/hospitalBeds.json` | CMS BED / OCCUPANCY LOOKUP |
| `src/types/` | TYPESCRIPT MODELS |
| `vite.config.ts` | `@` ALIAS, API PROXY |

### BACKEND (`backend/`)

| PATH | ROLE |
|------|------|
| `app/main.py` | FASTAPI APP, CORS, LIFESPAN |
| `app/config.py` | SETTINGS (`DATABASE_URL`, GEMINI / XAI / OPENAI, CORS) |
| `app/db.py` | PSYCOPG CONNECTION POOL |
| `app/migrate.py` | APPLIES `sql/001`–`004` |
| `app/api/` | HTTP ROUTERS |
| `app/repositories/` | SQL |
| `app/schemas.py` | PYDANTIC MODELS |
| `app/gemini.py`, `xai.py`, `openai.py`, `events.py` | LLM EVENT INTERPRETATION |
| `app/hospital_choice.py` | CONDITIONAL-LOGIT PRIOR |
| `app/activity_model.py` | SERVES ATLANTA DAY-DEMAND JSON |
| `sql/` | SCHEMA AND MIGRATIONS |
| `data/experimental/` | FILE-BACKED OVERLAY (NOT POSTGRES) |
| `tests/` | HEALTH, OPENAPI SURFACE, HOSPITAL CHOICE |

### DATA PIPELINES (`data/`)

| PATH | ROLE |
|------|------|
| `gtfs/` | FETCH/LOAD MARTA GTFS → `stations`, `transit_edges` |
| `residentials/` | TIGER BLOCK GROUPS + ACS → `residential_zones` |
| `poi/` | OSMNX OVERPASS → `points_of_interest` |
| `access_edges/` | WALK LINKS ZONE/POI → STATIONS |
| `experimental/` | ACS / LODES / OSM → `backend/data/experimental/context.json` |
| `time_profiles/` | NHTS + NHAMCS → `hourlyDemandProfiles.json` |
| `hospitals/` | CMS BEDS + MEDICARE ORIGIN TABLE |
| `activity/` | TRAIN ATLANTA DAY-DEMAND MODEL JSON |
| `requirements.txt` | GEOPANDAS, OSMNX, PSYCOPG, REQUESTS, PYTHON-DOTENV |

---

## 3. TECHNOLOGIES

### FRONTEND

| TECH | VERSION (DECLARED) |
|------|-------------------|
| REACT / REACT DOM | ^19.2.8 |
| TYPESCRIPT | ~6.0.2 |
| VITE | ^8.3.0 |
| TAILWIND CSS + `@tailwindcss/vite` | ^4.3.3 |
| ZUSTAND | ^5.0.15 |
| MAPLIBRE GL | ^6.11.2 |
| REACT-MAP-GL | ^8.1.3 |
| DECK.GL (`@deck.gl/core`, LAYERS, MAPBOX, REACT, EXTENSIONS) | ^9.4.0 |
| LUCIDE-REACT | ^1.48.0 |
| CLSX / TAILWIND-MERGE | ^2.1.1 / ^3.7.0 |
| OXLINT | ^1.81.0 |

BASEMAP: CARTO DARK MATTER (NO LABELS). FONTS: GEIST, GEIST MONO, INSTRUMENT SERIF.

### BACKEND

| TECH | SPEC |
|------|------|
| PYTHON | ≥ 3.11 (RUFF TARGET PY312) |
| FASTAPI | ≥ 0.115.6 |
| UVICORN | ≥ 0.34.0 |
| PYDANTIC-SETTINGS | ≥ 2.7.0 |
| PSYCOPG / PSYCOPG-POOL | ≥ 3.2.4 |
| PYTEST / HTTPX (DEV) | ≥ 8.3.0 / ≥ 0.28.0 |
| OSMIUM (OPTIONAL `[data]`) | ≥ 4.3.0 |

### DATABASE

POSTGRESQL WITH **POSTGIS** (GEOGRAPHY) AND **TIMESCALEDB** (HYPERTABLE ON `travel_times`).

UPSTREAM SOURCES, LIVE FEEDS, AND MODEL APIS ARE LISTED IN SECTION 5.

---

## 4. USER FLOWS AND MODES

`AppMode` IN `frontend/src/store/scenarioStore.ts`:

| MODE | INTENT |
|------|--------|
| **DISRUPT** | SET STATIONS TO `maintenance` (BOARD BLOCKED, TRAINS PASS) OR `shutdown` (LINE CUT). MAP SHOWS DELAY; IMPACT PANEL SHOWS COMMUNITIES, POI PRESSURE, FORECASTS. |
| **ADD** | PLACE OR DRAG NEW POIS (OR CIP-OPTIMAL SITES). GREEN INDICATES ≥ 15 MINUTES ACCESS GAIN VS BASELINE, OPTIONALLY OVER AN ACTIVE DISRUPTION. |
| **INTEL** | NATURAL-LANGUAGE EVENT → GEMINI, THEN GROK, THEN OPENAI → STATION IMPACTS + RADIUS → SAME DISRUPTION SIMULATOR. |
| **BUILD** | ADD OR REMOVE STATIONS AND DESTINATIONS IN THE SHARED DATABASE. UNLIKE THE OTHER TABS, THESE CHANGES ARE PERMANENT. |

TYPICAL PATH:

1. APP MOUNTS → `AppShell` → `loadNetwork()` FETCHES NETWORK, ZONES, POIS, ACCESS EDGES, EXPERIMENTAL CONTEXT, STREET ROUTES, ACTIVITY MODEL.
2. MAP RENDERS MARTA, ZONES, AND POIS; OPTIONAL LIVE TRAINS.
3. LEFT SIDEBAR: SCENARIO CONTROLS. RIGHT: IMPACT, INTELLIGENCE, OR BUILD. BOTTOM: TIMELINE.
4. STATION STATE / ADDED POI / INTEL EVENT → `buildAccessSimulation` OR `buildAdditionSimulation`.
5. CLICK A ZONE → PATH BEFORE/AFTER. TIMELINE SETS FAILURE START AND ELAPSED CLOCK.

OTHER FLOWS:

- **POI CRITICAL INDEX** — WHICH STATION CLOSURES HURT A FACILITY MOST; CACHED BY NETWORK FINGERPRINT (`/api/v1/poi-critical-cache/{fingerprint}`).
- **CIP PLANNER** — BUDGET + SECTOR → `planCapitalImprovements` → `addedPois`; OPTIONAL PDF (`cipPdf.ts`).
- **FORECAST CHARTS** — 6 / 12 / 24 HOUR PERSON-MINUTES AND HOSPITAL OCCUPANCY PATHS (`forecast.ts`).

---

## 5. DATA SOURCES

EVERY UPSTREAM INPUT IS LISTED ONCE. DERIVED TABLES AND JSON BUILT FROM THESE INPUTS ARE AT THE END OF THIS SECTION.

### STATIC DATASETS

| # | SOURCE | PUBLISHER | VINTAGE | SUPPLIES | LANDS IN | BUILDER |
|---|--------|-----------|---------|----------|----------|---------|
| 1 | MARTA GTFS (`google_transit.zip`) | MARTA | CURRENT FEED | RAIL STATIONS AND DIRECTED RIDE EDGES (RED, GOLD, BLUE, GREEN) | `stations`, `transit_edges` | `data/gtfs/fetch_gtfs.py`, `data/gtfs/load_gtfs.py` |
| 2 | TIGER/LINE BLOCK GROUPS (`tl_2024_13_bg.zip`) | U.S. CENSUS BUREAU | 2024 | FULTON (`121`) AND DEKALB (`089`) BLOCK-GROUP POLYGONS AND INTERNAL POINTS | `residential_zones` | `data/residentials/fetch_block_groups.py`, `load_residential_zones.py` |
| 3 | AMERICAN COMMUNITY SURVEY 5-YEAR | U.S. CENSUS BUREAU | 2024 | POPULATION, INCOME, VEHICLES, TRANSIT COMMUTE, POVERTY, DISABILITY, AGE, LIMITED ENGLISH | `residential_zones`; ALSO `context.json` | `data/residentials/fetch_acs.py` (`CENSUS_API_KEY` OPTIONAL) |
| 4 | LODES 8.4 OD AND WAC (GEORGIA) | U.S. CENSUS BUREAU / LEHD | 2023 | COMMUTE FLOWS AND WORKPLACE JOBS | `backend/data/experimental/context.json` | `data/experimental/build_experimental_data.py` |
| 5 | 2020 ATLANTA URBAN AREA FACTS | U.S. CENSUS BUREAU | 2020 | DENSITY BENCHMARK, 1,998 PEOPLE PER SQUARE MILE | DENSITY UPLIFT INSIDE `hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 6 | OPENSTREETMAP POIS | OSM CONTRIBUTORS, VIA OSMNX / OVERPASS | LIVE EXTRACT | HOSPITAL, CLINIC, SCHOOL, UNIVERSITY, LIBRARY, TOWNHALL, SUPERMARKET | `points_of_interest`; HOURS AND CAPACITY TAGS IN `context.json` | `data/poi/fetch_pois.py`, `data/poi/load_pois.py` |
| 7 | GEORGIA OSM PBF | GEOFABRIK | LATEST EXTRACT | WALKING-ROUTE CACHE | `backend/data/experimental/street_routes.json` | `backend/scripts/download_street_network.py` |
| 8 | OPENSTREETMAP STREETS | OSM CONTRIBUTORS, VIA OVERPASS | LIVE EXTRACT | LOCAL WALKING GRAPH FOR EXPERIMENTATION | `backend/data/experimental/streets.graph.json` (GITIGNORED) | `backend/scripts/download_street_network.py` |
| 9 | PROVIDER SPECIFIC FILES | CMS | LATEST RECORD | INPATIENT, PSYCHIATRIC, AND LONG-TERM-CARE BED COUNTS | `frontend/src/data/hospitalBeds.json` | `data/hospitals/build_hospital_beds.py` |
| 10 | HOSPITAL PROVIDER COST REPORT | CMS | 2023 UTILIZATION FIELDS | INPATIENT DAYS, BED-DAYS, DISCHARGES → OCCUPANCY AND LENGTH OF STAY | `frontend/src/data/hospitalBeds.json` | `data/hospitals/build_hospital_beds.py` |
| 11 | HOSPITAL SERVICE AREA | CMS | CALENDAR YEAR 2024 | ATLANTA ZIP × CCN MEDICARE INPATIENT DISCHARGES | `data/hospitals/atlanta_medicare_origins.json` | `data/hospitals/build_hospital_choice.py` |
| 12 | NATIONAL HOUSEHOLD TRAVEL SURVEY V2.1 | FHWA | 2022 | WEIGHTED ARRIVAL HOUR BY TRIP PURPOSE | `frontend/src/data/hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 13 | NATIONAL HOSPITAL AMBULATORY MEDICAL CARE SURVEY, ED FILE | CDC / NCHS | 2022 | 24-HOUR EMERGENCY-DEPARTMENT ARRIVAL PROFILE | `frontend/src/data/hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 14 | MEDICAL EXPENDITURE PANEL SURVEY, OUTPATIENT VISITS | AHRQ | 2024 | NATIONAL OUTPATIENT VOLUME; MODEL USES 1 VISIT PER PERSON-YEAR | HOSPITAL DEMAND BLEND IN `hourlyDemandProfiles.json` | `data/time_profiles/build_hourly_profiles.py` |
| 15 | COMMON CORE OF DATA, SCHOOL MEMBERSHIP | NCES | 2023–24 | PUBLIC-SCHOOL ENROLLMENT, MATCHED BY NORMALIZED NAME | `context.json`, ONLY WITH `--with-nces` | `data/experimental/build_experimental_data.py` |
| 16 | NATIONAL TRANSIT DATABASE MONTHLY RIDERSHIP (`ntd_id` 40022, MODE HR) | FTA | 2025 | SYSTEM WEEKDAY BOARDING TOTAL USED TO SCALE THE DAY MODEL | `data/activity/atlanta_day_model.json` | `data/activity/train_day_model.py` |
| 17 | MARTA AVERAGE WEEKDAY STATION ENTRIES | MARTA | 2019 | STATION MIX; SCALED SO THE SYSTEM TOTAL MATCHES THE 2025 NTD WEEKDAY | `data/activity/atlanta_day_model.json` | `data/activity/train_day_model.py` |

URLS:

1. `https://itsmarta.com/google_transit_feed/google_transit.zip`
2. `https://www2.census.gov/geo/tiger/TIGER2024/BG/tl_2024_13_bg.zip`
3. `https://api.census.gov/data/2024/acs/acs5`
4. `https://lehd.ces.census.gov/data/lodes/LODES8/ga`
5. `https://www.census.gov/programs-surveys/geography/guidance/geo-areas/urban-rural/2020-ua-facts.html`
6. OPENSTREETMAP VIA OSMNX (OVERPASS). SOURCE TAG ON ROWS: `openstreetmap`.
7. `https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf`
8. OVERPASS (`overpass.kumi.systems`, `overpass-api.de`). STREET DATA © OPENSTREETMAP CONTRIBUTORS, ODBL.
9. `https://pds.mps.cms.gov/fiss/inpatient/export` (INPATIENT, IPF, AND LTCH, LATEST RECORD ONLY)
10. `https://data.cms.gov/data-api/v1/dataset/44060663-47d8-4ced-a115-b53b4c270acb/data`
11. `https://data.cms.gov/sites/default/files/2025-07/8fca1932-adaa-411d-a912-78fb0854a286/Hospital_Service_Area_2024.csv`
12. `https://nhts.ornl.gov/media/2022/download/csv.zip`
13. `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHAMCS/ed2022.zip`
14. `https://meps.ahrq.gov/data_stats/download_data/pufs/h254f/h254fdoc.shtml`
15. `https://nces.ed.gov/ccd/Data/zip/ccd_sch_052_2324_l_1a_073124.zip`
16. `https://data.transportation.gov/resource/8bui-9xvu.json`
17. PUBLISHED STATION TABLE EMBEDDED IN `data/activity/train_day_model.py` (`ENTRIES_2019`).

NOTES ON HOSPITALS AND DEMAND:

- CMS BEDS ARE A HAND-REVIEWED OSM ID → CCN CROSSWALK. UNMATCHED OSM HOSPITALS STAY WITHOUT ASSUMED BED COUNTS.
- OCCUPANCY = REPORTED INPATIENT DAYS / REPORTED BED-DAYS AVAILABLE. AVERAGE LENGTH OF STAY = REPORTED INPATIENT DAYS / REPORTED DISCHARGES. THESE ARE ANNUAL OPERATING ESTIMATES, NOT LIVE BEDS.
- CMS SUPPRESSES SMALL ZIP–HOSPITAL COUNTS AS `*`; THOSE ROWS ARE OMITTED FROM THE ORIGIN TABLE. THE CHOICE MODEL IS NOT FIT TO THAT TABLE YET.
- HOURLY PROFILES ARE NATIONAL PROXIES. BLOCK GROUPS DENSER THAN 1,998 PEOPLE PER SQUARE MILE GET A SQUARE-ROOT DENSITY UPLIFT CAPPED AT 2.5×.
- NCES IS OPTIONAL. WITHOUT `--with-nces`, SCHOOL CAPACITY IS USED ONLY WHERE OPENSTREETMAP PUBLISHES A CAPACITY-LIKE TAG.

### LIVE FEEDS

| # | SOURCE | PUBLISHER | SUPPLIES | LANDS IN |
|---|--------|-----------|----------|----------|
| 18 | RAIL REALTIME ARRIVALS | MARTA | TRAIN ID, POSITION, WAITING TIME | `GET /api/v1/live/trains` PROXIES THE FEED; THE BROWSER NEVER CALLS MARTA DIRECTLY |

URL: `https://developerservices.itsmarta.com:18096/itsmarta/railrealtimearrivals/developerservices/traindata`

### MODEL APIS

INTELLIGENCE TRIES THESE IN ORDER. KEYS STAY ON THE SERVER.

| # | SOURCE | DEFAULT MODEL | ROLE | CODE |
|---|--------|---------------|------|------|
| 19 | GOOGLE GEMINI | `gemini-3.5-flash` | FIRST INTERPRETER FOR A NATURAL-LANGUAGE EVENT | `backend/app/gemini.py` |
| 20 | XAI GROK | `grok-4` | FALLBACK IF GEMINI FAILS | `backend/app/xai.py` |
| 21 | OPENAI CHAT COMPLETIONS | `gpt-4o-mini` | FALLBACK IF GEMINI AND GROK BOTH FAIL | `backend/app/openai.py` |

TOOL SCHEMA: `simulate_urban_event` IN `backend/app/events.py`. ENDPOINT: `POST /api/v1/intelligence/events`.

### MAP TILES

| # | SOURCE | SUPPLIES |
|---|--------|----------|
| 22 | CARTO DARK MATTER, NO LABELS | BASEMAP STYLE ONLY. NOT USED IN THE ACCESS MODEL. |

URL: `https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json`

### DERIVED, NOT UPSTREAM

| ARTIFACT | BUILT FROM | RULE |
|----------|------------|------|
| `access_edges` | ZONES, POIS, STATIONS | STRAIGHT-LINE WALK AT 80 M/MIN. NEAREST STATION, PLUS UP TO TWO MORE WITHIN 1.5 MILES. SCRIPT: `data/access_edges/load_access_edges.py`. |
| `backend/data/experimental/context.json` | ACS, LODES, OSM, OPTIONAL NCES | FILE OVERLAY. NOT WRITTEN TO POSTGRESQL. COMMITTED COPY OMITS ORIGIN–DESTINATION FLOWS. |
| `frontend/src/data/hourlyDemandProfiles.json` | NHTS, NHAMCS, MEPS, CENSUS DENSITY | TRACKED SO THE APP RUNS WITHOUT REFRESHING THE FEDERAL ZIPS. |
| `frontend/src/data/hospitalBeds.json` | CMS PSF + COST REPORT, OSM CROSSWALK | TRACKED SO THE APP RUNS WITHOUT A RUNTIME CMS REQUEST. |
| `data/hospitals/atlanta_medicare_origins.json` | CMS HOSPITAL SERVICE AREA | TRAINING TABLE FOR A LATER CONDITIONAL-LOGIT FIT. |
| `data/activity/atlanta_day_model.json` | ACS-STYLE ZONE FEATURES, 2019 ENTRIES, 2025 NTD | SERVED AT `GET /api/v1/activity/model`. ADJUSTS TRIP RATES AND WALK/TRANSFER CONSTANTS WHEN PRESENT. |

---

## 6. DATABASE SCHEMA

CORE TABLES (`backend/sql/001_schema.sql` PLUS LATER MIGRATIONS):

| TABLE | CONTENTS |
|-------|----------|
| `stations` | RAIL STOPS, LINES (`Red` / `Gold` / `Blue` / `Green`), GEOGRAPHY |
| `transit_edges` | DIRECTED RAIL SEGMENTS, TRAVEL AND FREQUENCY MINUTES |
| `residential_zones` | BLOCK-GROUP POLYGONS, CENTROID, POPULATION, INCOME (+ EXTRA ACS VIA `002`) |
| `points_of_interest` | DESTINATIONS; UNIQUE `(source, source_id)` (`003`) |
| `access_edges` | WALK MINUTES ZONE/POI → STATION |
| `scenarios` | NAMED DISRUPTION SETS |
| `travel_times` | TIMESCALE HYPERTABLE OF COMPUTED TIMES |
| `poi_critical_cache` | FINGERPRINTED POI-CRITICAL RESULTS (`004`) |
| `schema_migrations` | APPLIED SQL FILES |

---

## 7. API

MOUNTED FROM `backend/app/api/router.py`.

| METHOD | PATH | PURPOSE |
|--------|------|---------|
| GET | `/health` | PROCESS HEALTH |
| GET | `/health/db` | DATABASE PING |
| GET | `/api/v1` | RESOURCE LIST |
| GET/POST | `/api/v1/stations` | STATION CATALOG |
| GET | `/api/v1/stations/nearby` | SPATIAL LOOKUP |
| GET/PATCH/DELETE | `/api/v1/stations/{station_id}` | STATION CRUD |
| GET/POST | `/api/v1/transit-edges` | RAIL EDGES |
| DELETE | `/api/v1/transit-edges/{edge_id}` | DELETE EDGE |
| GET | `/api/v1/network` | STATIONS + EDGES TOGETHER |
| GET/POST | `/api/v1/zones` | RESIDENTIAL ZONES |
| GET/DELETE | `/api/v1/zones/{zone_id}` | ZONE CRUD |
| GET/POST | `/api/v1/pois` | POINTS OF INTEREST |
| GET/DELETE | `/api/v1/pois/{poi_id}` | POI CRUD |
| GET/POST | `/api/v1/access-edges` | WALK LINKS |
| DELETE | `/api/v1/access-edges/{edge_id}` | DELETE LINK |
| GET/POST | `/api/v1/scenarios` | SAVED SCENARIOS |
| GET/PATCH/DELETE | `/api/v1/scenarios/{scenario_id}` | SCENARIO CRUD |
| GET | `/api/v1/scenarios/{scenario_id}/impact` | SERVER-SIDE IMPACT ROWS |
| GET/POST | `/api/v1/travel-times` | TIMESCALE RESULTS |
| GET/PUT | `/api/v1/poi-critical-cache/{fingerprint}` | CRITICAL-INDEX CACHE |
| POST | `/api/v1/intelligence/events` | LLM EVENT → STATION IMPACTS |
| GET | `/api/v1/live/trains` | MARTA REALTIME PROXY |
| GET | `/api/v1/experimental/context` | ENRICHMENT JSON (OD FLOWS STRIPPED) |
| GET | `/api/v1/experimental/street-routes` | WALKING-ROUTE CACHE |
| GET | `/api/v1/hospital-choice/model` | LOGIT PRIOR WEIGHTS |
| GET | `/api/v1/activity/model` | DAY-DEMAND MODEL |

FRONTEND CATALOG CLIENT: `frontend/src/services/api.ts`. INTELLIGENCE AND LIVE TRAINS USE DEDICATED `fetch` HELPERS.

---

## 8. FRONTEND ARCHITECTURE

### STORE

`scenarioStore.ts` HOLDS STATIONS, EDGES, ZONES, POIS, STREET ROUTES, STATION STATES, SELECTED DESTINATION CATEGORIES, FAILURE CLOCK, SIMULATION RESULTS, CIP PLAN, INTEL EVENT, AND CRITICAL-INDEX PROGRESS.

ON LOAD IT PARALLEL-FETCHES GEO PAYLOADS, ATTACHES EXPERIMENTAL ATTRIBUTES AND HOSPITAL BEDS, ATTACHES ACCESS EDGES, AND READS OR BUILDS THE POI CRITICAL CACHE. RECOMPUTE USES GENERATION COUNTERS TO DEBOUNCE.

### SERVICES

| FILE | ROLE |
|------|------|
| `api.ts` | BASE URL, GET/PUT, PAGINATION |
| `stationService.ts` | NETWORK MAPPING |
| `geoService.ts` | ZONES, POIS, ACCESS, EXPERIMENTAL, HOSPITAL BEDS |
| `accessSimulator.ts` | RAIL GRAPH + IMPACT ENGINE |
| `forecast.ts` | HORIZON AND OCCUPANCY FORECASTS |
| `hourlyDemand.ts` | DEMAND OVER PROFILES + ACTIVITY MODEL |
| `activityModel.ts` | OPTIONAL DAY-MODEL RATES |
| `hospitalChoice.ts` | LOGIT UTILITY HELPER (MODEL FETCH; ASSIGNMENT IN SIM IS NEAREST-BY-TIME TODAY) |
| `intelligenceService.ts` | POST EVENTS |
| `liveTrains.ts` | TRAIN POLLING / MOTION |
| `criticalCache.ts` | FINGERPRINT + CACHE API |
| `cipPlanner.ts` / `cipPdf.ts` | CAPITAL PLAN AND PDF |

### MAP LAYERS (`CivicMap.tsx`)

1. `ZoneImpactLayer` — DELAY/GAIN CHOROPLETH
2. `EventRadiusLayer` — INTELLIGENCE RADIUS
3. `MartaNetworkLayer` — RAIL LINES
4. `FlowMapLayer` — PASSENGER FLOWS
5. `PoiLayer` — DESTINATIONS AND HOSPITAL LOAD
6. `RouteLayer` — SELECTED ZONE PATH
7. `StationLayer` — OPERATING STATE
8. `LiveTrainLayer` — REALTIME / SIMULATED TRAINS
9. `AddedPoiLayer` — DRAGGABLE NEW SITES

### LAYOUT

- LEFT: `ScenarioSidebar` (STATION / ADD / INTEL / BUILD + `ServiceLayerToggle`)
- RIGHT: `ImpactPanel`, `IntelligencePanel`, OR `BuildPanel`
- BOTTOM: `TimeSlider`
- TRACE: `TraceImpactPanel`, `BeforeAfterComparison`, `DependencyChain`

---

## 9. SIMULATION, FORECAST, HOSPITAL, AND INTELLIGENCE

### ACCESS SIMULATION (`accessSimulator.ts`)

1. ALL-PAIRS RAIL GRAPH (FLOYD–WARSHALL STYLE `dist` / `next`). SHUTDOWN REMOVES STATIONS FROM THE GRAPH. MAINTENANCE MARKS STATIONS UNBOARDABLE.
2. ZONE ↔ STATION WALK FROM `access_edges` (NEAREST-STATION FALLBACK).
3. PER CATEGORY: SCHOOLS / GOVERNMENT / UNIVERSITY STAY ANCHORED TO THE GEOGRAPHICALLY CLOSEST POI; OTHER CATEGORIES PICK MINIMUM DOOR-TO-DOOR MINUTES.
4. HOSPITALS: RANK BY TRIP TIME; ASSIGN EACH ZONE’S DEMAND TO THE CLOSEST HOSPITAL UNDER DISRUPTION; TRACK REDIRECTS FOR CAPACITY SURGE.
5. DEMAND: `hourlyZoneDemand` / `aggregateZoneDemand` (PROFILES, ACS TRANSIT-DEPENDENT SLICE, OPTIONAL ACTIVITY MODEL).
6. OUTPUTS: `zoneImpacts`, TRACES, `poiPressure`, `hospitalCapacity`, FLOW JOURNEYS, SUMMARY STATS.

**ADDITION** COMPARES ACCESS WITH VS WITHOUT `addedPois`. `findOptimalAdditionSite` PLACES A SITE. CIP STACKS SITES UNDER BUDGET AND SECTOR COSTS (`facilityCosts.ts`).

### FORECAST (`forecast.ts`)

FROM CLOSURE (AND OPTIONAL ADDITION) RESULTS: HOURLY ARRIVALS, DELAYED TRIPS, PERSON-MINUTES, AND TRIPS BEYOND 20 / 40 / 60 MINUTES. HOSPITALS: OCCUPANCY PATH WITH EXPONENTIAL STAY, `fullAtHour`, OVERFLOW RANKING, CASCADE STAGES.

### HOSPITAL CHOICE

BACKEND PRIOR (`hospital_choice.py`): UNTRAINED CONDITIONAL LOGIT ON TRAVEL MINUTES, LOG BEDS, AND OCCUPANCY (`trained: false`). TRAINING TABLE `atlanta_medicare_origins.json` IS PREPARED FOR A FUTURE CROSS-ENTROPY FIT. RUNTIME ASSIGNMENT USES **NEAREST TRAVEL TIME** PLUS CMS BEDS FROM `hospitalBeds.json`.

### INTELLIGENCE

USER PROMPT + STATION CATALOG → `POST /api/v1/intelligence/events`. ORDER: GEMINI, THEN GROK, THEN OPENAI. TOOL SCHEMA `simulate_urban_event` IN `events.py`. `applyIntelEvent` SETS STATION STATES, FOCUS BOUNDS, AND RUNS THE DISRUPTION SIM.

---

## 10. LOCAL RUN

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

ETL SCRIPTS UNDER `data/` EXPECT THE SAME `DATABASE_URL` AS THE API, EXCEPT THE EXPERIMENTAL, TIME-PROFILE, AND HOSPITAL BUILDERS, WHICH WRITE JSON FILES.
