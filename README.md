# 3D Repository City (MVP)

MVP web app that visualizes the commit history of a public GitHub repository as an interactive 3D city.

## What is implemented

- Input and validation of a GitHub repo URL (`https://github.com/user/repo`)
- Parsing of full commit history via paginated GitHub REST API (Octokit)
- WebSocket progress streaming (`progress`) and final payload (`result`)
- Progressive city streaming during parsing (`partial_result`) before final payload
- File-based 3D city model: each file is a building, each commit is a floor
- Floor color by author, floor height by `log(1 + additions + deletions)`
- Hover highlight + click to open file details card
- Time Machine slider to replay repository state by date
- Auto-tour flight mode with smooth camera transitions to hotspots
- Atmospheric scene (sky, clouds, district zoning by folders)
- 2D cyberpunk post-FX canvas overlay (scanlines, neon data streaks, grain, vignette, glitch bands)
- Code-weather overlays for file activity (`sun` / `rain` / `storm`)
- Import roads between files (relative `import/require` links)
- Branch orbits around city perimeter from real branch refs + merge-message fallback
- View modes: `Overview / Architecture / Risk / Stack`
- Branch Map panel with branch tree + `show only branch changes` mode
- Graph intelligence: hubs, dependency cycles, layer-violation counters
- Architecture rule overlay on roads (`forbidden imports` and `cycle edges` highlighted)
- Stack Passport from manifests (`package.json`, `requirements.txt`, `pom.xml`, `go.mod`, `Cargo.toml`, `Dockerfile`, CI configs)
- Deterministic City DNA per repository (unique layout + palette + architecture)
- Risk overlays (`risk = churn * bugfix_ratio * low_bus_factor`) on buildings and districts
- Filtering and jump-to-file controls (language, author, district, branch, risk, path search)
- Compare-dates mode with baseline slider, `Ghost/Split` overlays, and delta chips (`files`, `roads`, `risk`, `hubs`)
- Minimap overlay for quick navigation and click-to-focus
- Adaptive LOD for floors on large repositories (fewer rendered floors per building when scene is dense)
- Instanced floor rendering per building for lower draw-call overhead
- Import-road bundling to reduce visual spaghetti and keep dependency highways readable
- Summary export button (copies executive markdown summary to clipboard)
- Export buttons: `PNG` scene snapshot, `JSON` report, `CSV` risk hotspots
- Live watch polling mode (auto-refresh parse every 2 minutes)
- Share button to copy URL with `?repo=<url>`
- Backend cache with TTL (1 hour), `lastFetched`, and `etag` support
- Parse cancel/restart safety: new parse request for same socket cancels previous run
- Parse diagnostics in payload: stage timing and GitHub request counts
- REST fallback endpoint for manual parse calls
- Mobile-friendly UI layout for form and info card

## Stack

- Backend: NestJS, Sequelize, SQLite, Socket.io, Octokit
- Frontend: React + Vite + TypeScript, MUI, Zustand, react-three-fiber, drei

## Project structure

- `backend/` NestJS API + websocket gateway
- `frontend/` React app with Three.js scene

## Run locally

### 1) Install dependencies

```bash
npm install --workspaces
```

### 2) Start backend

```bash
npm run dev:backend
```

Backend starts at `http://localhost:3000`.

### 3) Start frontend (new terminal)

```bash
npm run dev:frontend
```

Frontend starts at `http://localhost:5173`.

## Frontend controls

- `Time Machine`: move the slider to view city state at a specific date
- `Compare dates`: enable baseline slider, switch `Ghost/Split`, and see deltas vs current time position
- `View mode`: switch between `Overview`, `Architecture`, `Risk`, and `Stack`
- `GitHub token (optional)`: set personal token in the controls drawer to raise API quota
- `Time of day / Weather`: choose presets manually or enable dynamic atmosphere cycling
- `Construction timelapse`: animate city growth from earliest to latest commit with adjustable speed
- `Branch map`: select branch and enable `Show only branch changes`
- `Auto tour`: camera automatically flies between high-activity buildings
- `Live watch (2m)`: re-parse periodically for near-real-time monitoring
- `Atmosphere`: toggles sky/cloud ambience
- `Cyberpunk FX overlay`: toggles animated post-processing canvas layer over the scene
- `Code weather`: toggles activity overlays for buildings
- `Builders`: toggles animated drones above hotspots
- `Summary`: copies a short executive summary for sharing/reporting
- `PNG / JSON / Hotspots`: export render snapshot and analysis artifacts

## Environment variables

Backend (`backend/.env`, optional):

- `PORT=3000`
- `SQLITE_PATH=./data/repositories.sqlite`
- `MAX_COMMITS=0` (`0` or negative = full history, positive = explicit cap)
- `GITHUB_CONCURRENCY=5`
- `HISTORY_FETCH_MAX_PAGES=90`
- `HISTORY_FETCH_MAX_MS=240000`
- `GITHUB_REQUEST_TIMEOUT_MS=120000`
- `GITHUB_REQUEST_RETRIES=2`
- `GITHUB_RETRY_BASE_DELAY_MS=1200`
- `IMPORT_SCAN_LIMIT=220`
- `IMPORT_CONCURRENCY=4`
- `IMPORT_REQUEST_TIMEOUT_MS=8000`
- `IMPORT_ANALYSIS_TIMEOUT_MS=45000`
- `IMPORT_SOURCE_CHAR_LIMIT=300000`
- `GITHUB_CONTENT_MAX_BYTES=350000`
- `STACK_PROBE_LIMIT=30`
- `STACK_PROBE_CONCURRENCY=4`
- `STACK_PROBE_TIMEOUT_MS=9000`
- `BRANCH_PROBE_LIMIT=22`
- `BRANCH_COMMIT_PROBE_LIMIT=90`
- `BRANCH_PROBE_CONCURRENCY=4`
- `CACHE_TTL_MS=3600000`
- `GITHUB_TOKEN=` (optional, recommended to avoid rate limit)
- `CORS_ORIGIN=*`

Note: without `GITHUB_TOKEN`, GitHub unauthenticated quota is low and parsing may fail with quota errors.
When running via Docker Compose, set `GITHUB_TOKEN` in root `.env` (Compose loads it automatically).

Frontend (`frontend/.env`, optional):

- `VITE_API_URL=http://localhost:3000`

## API and events

### WebSocket namespace

- Namespace: `/parser`
- Client event: `parse` with `{ repoUrl: string }`
- Server event: `progress` with `{ stage, message, percent }`
- Server event: `partial_result` with partial repository payload while commits are still loading
- Server event: `result` with final repository JSON
- Server event: `error` with `{ message }`

### REST fallback

- `POST /repo/parse`
- Body: `{ "repoUrl": "https://github.com/facebook/react" }`

## Caching behavior

- Cache table `repo_cache` keeps:
  - `url`
  - `data` (JSON string)
  - `lastFetched`
  - `etag`
- If cache is fresh (< 1 hour): result returned immediately.
- If stale and ETag matches (304): cached payload is reused and timestamp updated.

## Lint and build

```bash
npm run lint --workspace backend
npm run lint --workspace frontend
npm run test --workspace frontend
npm run build
```

## Docker

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000`

## Notes

- Only public repositories are supported.
- Commit history is fetched page-by-page; building data streams progressively while pages are loading.
- If GitHub API limit is hit before first page, backend fails fast with a clear rate-limit error (no long hang).
- If the limit is hit after some pages, backend returns a truncated but usable city built from already loaded commits.
- GitHub REST quota is account-wide for the token owner (`core.remaining` can be `0` even for a new token from the same account).
- Branch signals use real branch commit probes with merge-message fallback for coverage.
