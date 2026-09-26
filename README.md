# Ripple

Ripple is a map of MARTA rail access in Atlanta. It shows how station closures, disasters, and new facilities change how long it takes residents to reach hospitals, groceries, schools, and other destinations.

The access simulation runs in the browser. The API serves the rail network, neighborhoods, destinations, and the Intelligence models.

## Tabs

The bar across the top of the map, left to right:

| Tab | What it does |
| --- | --- |
| **Disrupt** | Put a station on maintenance or shut it down, or shut down a destination. The map shades communities by added travel time. The side panel lists who is affected and which destinations absorb the extra visitors. |
| **Intelligence** | Describe an event in plain language, such as an earthquake near Midtown. Gemini interprets it first, then Grok, then ChatGPT. The result can close stations, destroy destinations inside the zone, start an evacuation, and fill nearby hospitals. Edits in Disrupt stay in sync with this chat. |
| **Plan** | Place a new destination, or build a budgeted set of sites. Areas that save 15 minutes or more turn green. |
| **Report** | Add or remove stations and destinations in the shared database. Unlike the other tabs, these changes are permanent. |

Hover a tab to see its color: red, blue, green, and yellow.

**Restore all stations** in Disrupt clears the whole scenario, including an Intelligence event: stations, shut-down and destroyed destinations, the evacuation circle, and the impact shading.

## Run locally

Use two terminals.

**API**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Fill DATABASE_URL, and optionally GEMINI_API_KEY, XAI_API_KEY, and OPENAI_API_KEY.
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**App**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/health` to `http://127.0.0.1:8000`.

## Configuration

Copy `backend/.env.example` to `backend/.env`. That file is gitignored. Do not commit it.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres with PostGIS and TimescaleDB |
| `GEMINI_API_KEY` | First Intelligence model |
| `XAI_API_KEY` | Grok, used if Gemini fails. `XAI_MODEL` defaults to `grok-4` |
| `OPENAI_API_KEY` | ChatGPT, used if Gemini and Grok both fail. `OPENAI_MODEL` defaults to `gpt-4o-mini` |

API keys stay on the server. The browser never receives them.

## Layout

```
frontend/     React, Vite, MapLibre, deck.gl
backend/      FastAPI, SQL, Intelligence models
data/         Loaders for GTFS, Census, OSM, hospitals, and demand profiles
design.md     Architecture and data notes
```

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind, Zustand, MapLibre, deck.gl
- **Backend:** Python 3.11+, FastAPI, Uvicorn, psycopg
- **Database:** PostgreSQL, PostGIS, TimescaleDB
