# Project: AGY CLI Web Visualizer Dashboard

## Architecture
- **Backend Middleware**: Node.js + Express + Socket.io + Chokidar (`backend/server.js`) listening on Port 3001.
  - File Watcher: Chokidar watching `/home/kuo/see-agy` excluding `.git`, `node_modules`, `dist`.
  - Log Watcher: Tail watching `~/.gemini/antigravity-cli/brain/*/.system_generated/logs/transcript.jsonl` parsing tool calls (`view_file`, `grep_search`, `write_to_file`, `replace_file_content`).
  - Realtime Broadcasts via Socket.io: `dir_tree`, `file_event`, `agent_status`.
  - Ingestion REST APIs for Mock/Test events: `/api/mock/file_event`, `/api/mock/agent_status`.
- **Frontend Visualizer**: Vite + React + D3 + Tailwind CSS + Lucide Icons (`frontend/`) listening on Port 3000.
  - Treemap Layout: D3 `d3.hierarchy` + `d3.treemap` squarified layout engine.
  - 1.5s Visual Decay Loop: 60fps Canvas renderer computing $\alpha = \max(0, 1.0 - \text{elapsed}/1500)$ with Orange `#F97316` (WRITE) and Blue `#38BDF8` (READ).
  - Status Widget: Agent working state mascot animation, active model display, step index counter, and status indicator (Working vs Idle).
- **Test & E2E Track**: Node.js test script / Playwright runner executing mock & E2E events against port 3001/3000.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Chokidar File Watcher | Watch workspace for WRITE events, excluding `.git`, `node_modules`, `dist` | M1: Backend | R1 / Survey |
| 2 | AGY Transcript Log Watcher | Parse `~/.gemini/antigravity-cli/brain/*/.system_generated/logs/transcript.jsonl` for `view_file` & `grep_search` READ events & unquote strings | M1: Backend | R1 / Survey |
| 3 | Socket.io Realtime Stream | Emit `dir_tree`, `file_event`, `agent_status` on connection and live updates | M1: Backend | R1 / Survey |
| 4 | REST Mock Endpoints | `/api/mock/file_event` and `/api/mock/agent_status` for non-invasive testing | M1: Backend | Survey |
| 5 | D3 Treemap Matrix | Render squarified treemap matrix of project directory tree | M2: Frontend | R2 / Survey |
| 6 | 1.5s Visual Decay Loop | 60fps Canvas color decay loop (WRITE: Orange `#F97316`, READ: Blue `#38BDF8`) | M2: Frontend | R2 / Survey |
| 7 | Agent Status Widget | Mascot working state animation, active model name, step counter, Idle/Working status | M2: Frontend | R2 / Survey |
| 8 | E2E Opaque-box Test Suite | Playwright / Node E2E test runner executing Tiers 1-4 tests verifying sockets, UI rendering, decay, and status transitions | M0: Test Track | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Testing Infrastructure | Build test runner, mock script, and E2E test suite (Tiers 1-4) | None | IN_PROGRESS |
| M1 | Backend Server Implementation | Update `backend/server.js` with `.system_generated/logs/` pathing, unquoting, REST mock endpoints | None | IN_PROGRESS |
| M2 | Frontend Visualizer Implementation | Install deps, build React components, D3 treemap canvas, decay loop, mascot widget | M1 | IN_PROGRESS |
| M3 | Final Integration & Audit | E2E validation (Tiers 1-4), Tier 5 adversarial hardening, and Forensic Audit | M0, M1, M2 | PLANNED |

## Interface Contracts

### Socket.io Events (Port 3001)
1. **`dir_tree`** (Object):
   ```json
   {
     "name": "see-agy",
     "path": "",
     "type": "directory",
     "children": [
       { "name": "backend", "path": "backend", "type": "directory", "children": [...] },
       { "name": "package.json", "path": "package.json", "type": "file", "size": 1234 }
     ]
   }
   ```
2. **`file_event`** (Object):
   ```json
   {
     "path": "backend/server.js",
     "type": "WRITE" // or "READ"
   }
   ```
3. **`agent_status`** (Object):
   ```json
   {
     "status": "working", // or "idle"
     "model": "Gemini 3.6 Flash (High)",
     "stepCount": 42
   }
   ```

### REST Ingestion Mock Endpoints (Port 3001)
- `POST /api/mock/file_event`: Body `{ "path": "backend/server.js", "type": "WRITE" }` -> Broadcasts `file_event` via Socket.io.
- `POST /api/mock/agent_status`: Body `{ "status": "working", "model": "Gemini 3.6 Flash (High)", "stepCount": 42 }` -> Broadcasts `agent_status` via Socket.io.

## Code Layout
- `/home/kuo/see-agy/backend/`
  - `server.js`
  - `package.json`
- `/home/kuo/see-agy/frontend/`
  - `package.json`
  - `vite.config.js`
  - `postcss.config.js`
  - `tailwind.config.js`
  - `index.html`
  - `src/`
    - `main.jsx`
    - `App.jsx`
    - `index.css`
    - `components/`
      - `TreemapCanvas.jsx`
      - `StatusWidget.jsx`
- `/home/kuo/see-agy/scripts/`
  - `mock_generator.js`
- `/home/kuo/see-agy/tests/`
  - `e2e.test.js`
