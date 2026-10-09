# Survey Analysis Report: AGY CLI Web Visualizer Dashboard

**Target Workspace**: `/home/user/see-agy`  
**Date**: 2026-07-26  
**Investigator**: `explorer_1`  
**Milestone**: Survey Phase  

---

## 1. Executive Summary

This report presents the complete survey of the workspace `/home/user/see-agy`, the system execution environment, existing backend/frontend code bases, and dependency state for building the non-invasive **AGY CLI Web Visualizer Dashboard**.

The project aims to monitor local file system changes (WRITE events via `chokidar`) and AGY CLI transcript logs (READ events & Agent status via `transcript.jsonl`), streaming data via `Socket.io` to a Vite + React + D3 + Tailwind CSS frontend that renders a 2D Treemap matrix with a 1.5-second visual decay loop.

---

## 2. Workspace File Inventory & Git Repository State

### 2.1 File & Directory Map
```
/home/user/see-agy
├── .agents/
│   └── teamwork_preview_explorer_survey_1/   # Metadata directory for explorer_1
│       ├── DISPATCH.md
│       ├── BRIEFING.md
│       ├── analysis.md                       # This analysis report
│       └── handoff.md                        # Handoff report
├── AGY_Web_Visualizer_Development_Plan.md    # Initial technical design document (129 lines)
├── ORIGINAL_REQUEST.md                       # Requirements and acceptance criteria (36 lines)
├── backend/
│   ├── package.json                          # Backend dependencies and scripts
│   ├── package-lock.json                     # Locked versions
│   ├── server.js                             # Express + Socket.io + Chokidar server implementation (168 lines)
│   └── node_modules/                         # Installed backend packages (chokidar, express, socket.io, cors)
└── frontend/
    ├── package.json                          # Frontend package configuration (missing node_modules)
    ├── vite.config.js                        # Vite React configuration (port 3000)
    └── postcss.config.js                     # PostCSS config with Tailwind CSS & Autoprefixer
```

### 2.2 Git Repository State
- **Git status**: Not a git repository (`fatal: not a git repository`).
- No `.git` folder present in workspace root.

---

## 3. Detailed Inspection of Existing Codebase

### 3.1 Backend Server (`backend/server.js`)
The existing `backend/server.js` contains a well-structured implementation (~168 lines):
1. **Express & Socket.io Initialization**:
   - Express server created on `PORT` (`process.env.PORT || 3001`).
   - `Socket.io` attached with CORS enabled (`origin: "*"`).
   - `WATCH_DIR` set to parent root directory (`path.resolve(__dirname, '..')`).
2. **Directory Tree Generator (`getDirTree`)**:
   - Recursively scans `WATCH_DIR` excluding hidden files (`.`), `node_modules`, `dist`, `build`.
   - Returns structured JSON `{ name, path, value, children }` required for D3 Treemap layout.
3. **File System Watcher (`chokidar`)**:
   - Watches `WATCH_DIR`, ignoring `node_modules`, `dist`, `build`, `.git`, hidden files.
   - Listens to `change` and `add` events, emitting `{ path, type: 'WRITE', timestamp }` via Socket.io.
   - Listens to `add` and `unlink` events, emitting updated `dir_tree`.
4. **Agent Status Manager**:
   - Tracks state `{ status: 'Idle'|'Working', activeModel: 'Gemini 3.6 Flash', totalStepCount, lastActivity }`.
   - Emits `agent_status` on state changes and auto-resets status to `Idle` after 3 seconds of inactivity.
5. **AGY CLI Log / Transcript Watcher**:
   - Watches `~/.gemini/antigravity-cli/brain` (depth 4) for `transcript.jsonl`.
   - Increments `totalStepCount` and parses `tool_calls` (`view_file`, `grep_search`) to emit `{ path, type: 'READ', timestamp }`.
6. **Endpoints & Socket Events**:
   - Emits `dir_tree` and `agent_status` upon socket client connection.
   - `/api/health` REST endpoint returning `{ status: 'ok', agentState, watchDir }`.

### 3.2 Frontend Infrastructure (`frontend/`)
- **Existing files**:
  - `package.json`: Configured with React 18.3.1, Socket.io-client 4.7.5, D3 7.9.0, Lucide React 0.380.0, Vite 5.2.11, Tailwind CSS 3.4.4, PostCSS 8.4.38, Autoprefixer 10.4.19.
  - `vite.config.js`: React plugin enabled, port set to 3000.
  - `postcss.config.js`: Tailwind CSS and Autoprefixer configured.
- **Missing frontend artifacts**:
  - `frontend/node_modules` (not installed yet; `npm install --dry-run` succeeded in 5s with 226 packages).
  - `index.html` (Vite root HTML entry point).
  - `tailwind.config.js` (Tailwind CSS content matching paths).
  - `src/` directory containing:
    - `src/main.jsx` & `src/App.jsx`
    - `src/index.css` (with `@tailwind base; @tailwind components; @tailwind utilities;`)
    - `src/components/TreemapCanvas.jsx` (D3 Treemap rendering + 1.5s decay loop)
    - `src/components/StatusWidget.jsx` (Mascot / status display)

---

## 4. Environment & System Dependency Audit

| Item / Dependency | Installed Version / Status | Notes / Requirement |
|---|---|---|
| **OS** | Linux x86_64 | Standard Linux kernel |
| **Node.js** | `v22.22.1` | Satisfies Node.js requirement |
| **npm** | `9.2.0` | Package manager ready |
| **Backend Express** | `4.22.2` | Installed in `backend/node_modules` |
| **Backend Socket.io** | `4.8.3` | Installed in `backend/node_modules` |
| **Backend Chokidar** | `3.6.0` | Installed in `backend/node_modules` |
| **Backend Cors** | `2.8.5` | Installed in `backend/node_modules` |
| **Frontend Dependencies** | React 18.3.1, D3 7.9.0, Socket.io-client 4.7.5, Lucide-react 0.380.0, Vite 5.2.11, Tailwind 3.4.4 | Defined in `frontend/package.json`; needs `npm install` |
| **Port 3001 (Backend)** | **Available** | Express + Socket.io server ready to listen on 3001 |
| **Port 3000 (Frontend)** | **Occupied by PID 15142** | Process `node backend/server.js` is currently running on port 3000 from a previous run |
| **AGY Brain Directory** | `/home/user/.gemini/antigravity-cli/brain` | 12 session folders present |

### Port Conflict Discovery & Remediation Strategy:
- Process `PID 15142` (`user 15142 ... node backend/server.js`) is currently occupying port 3000.
- Per `ORIGINAL_REQUEST.md`, **Backend must run on Port 3001** and **Frontend on Port 3000**.
- **Action Needed**: Terminate stale PID 15142 (`kill -9 15142`) before starting the Vite frontend on port 3000 and backend on port 3001.

---

## 5. File Structure Recommendations & Conventions

### 5.1 Recommended Directory Tree
To maintain clean separation of concerns and standard Vite + React project layout:

```
/home/user/see-agy
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
└── frontend/
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── postcss.config.js
    ├── tailwind.config.js          # [TO CREATE] Tailwind content path configuration
    ├── index.html                  # [TO CREATE] HTML entry point with root div & script tag
    └── src/                        # [TO CREATE] Frontend application source
        ├── main.jsx                # React root render
        ├── App.jsx                 # Main Dashboard shell layout
        ├── index.css               # Tailwind directive imports
        └── components/
            ├── TreemapCanvas.jsx   # D3 treemap computation & Canvas 1.5s visual decay loop
            └── StatusWidget.jsx    # Mascot state, model name & step counter
```

### 5.2 Frontend Component & Architecture Conventions
1. **Socket Connection**:
   - Initialize single `socket.io-client` instance connecting to `http://localhost:3001`.
   - Listen for `dir_tree`, `agent_status`, and `file_event` events.
2. **D3 Treemap & Visual Decay Renderer (`TreemapCanvas.jsx`)**:
   - Use `d3.hierarchy(dirTree).sum(d => d.value)` and `d3.treemap()` to generate layout bounding boxes.
   - Maintain a `fileStates` Map (`path -> { type: 'WRITE'|'READ', intensity: 1.0, lastUpdated: performance.now() }`).
   - Run a `requestAnimationFrame` loop on HTML5 Canvas / SVG overlay:
     - Decay formula: `intensity = Math.max(0, 1.0 - (now - lastUpdated) / 1500)`.
     - Fill colors: `WRITE` (Fading Orange: `rgba(249, 115, 22, intensity)`), `READ` (Fading Blue: `rgba(56, 189, 248, intensity)`).
3. **Status Widget (`StatusWidget.jsx`)**:
   - Displays Agent Working/Idle status badge with animated indicator.
   - Displays Active Model name (`Gemini 3.6 Flash`) and Session Activity step count.

---

## 6. Conclusion & Roadmap for Implementer

1. Run `npm install` inside `frontend/`.
2. Free port 3000 by stopping process PID 15142 (`node backend/server.js`).
3. Create missing frontend entry files: `index.html`, `tailwind.config.js`, `src/main.jsx`, `src/index.css`, `src/App.jsx`, `src/components/TreemapCanvas.jsx`, and `src/components/StatusWidget.jsx`.
4. Run `npm run dev` in `frontend/` (port 3000) and `npm start` in `backend/` (port 3001).
5. Verify build via `npm run build` in `frontend/`.
