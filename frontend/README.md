# Ripple — frontend

Map-first React MVP for simulating MARTA station disruptions in Atlanta.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

Zones and POIs load from the FastAPI app at `/api/v1/zones` and `/api/v1/pois`. Vite proxies those to `http://127.0.0.1:8000` during development. If the API is down, the UI falls back to mock data.

## Stack

Vite, React, TypeScript, Tailwind, MapLibre, deck.gl, Zustand

Simulation results currently come from mock services in `src/services/`. Swap those for FastAPI later without rewriting the UI.
