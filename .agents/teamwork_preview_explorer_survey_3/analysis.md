# Technical Architecture Analysis Report: AGY CLI Web Visualizer Dashboard

**Author**: `explorer_3` (Technical Architecture Investigator)  
**Date**: 2026-07-26  
**Scope**: Backend Integration Architecture, Frontend Visualizer & Rendering Engine, E2E Testability & Mock Strategy  

---

## 1. Executive Summary

This report provides an in-depth technical architectural analysis for the **AGY CLI Web Visualizer Dashboard**. The dashboard is a zero-invasive monitoring system designed to visualize file system access/modification events and agent working states in real-time.

The architecture comprises three primary subsystems:
1. **Backend Integration Pipeline**: Built on Node.js, Express, Socket.io, and Chokidar. It scans the directory hierarchy, watches workspace file mutations (WRITE events), parses AGY transcript logs for file read tool calls (`view_file`, `grep_search`), and manages agent status state transitions.
2. **Frontend Visualizer Engine**: Built with Vite, React 18, D3.js (`d3-hierarchy`), and Tailwind CSS. It computes a 2D squarified Treemap layout, executes a 60fps Canvas-based 1.5-second visual decay loop (`WRITE` = Orange `#F97316`, `READ` = Blue `#38BDF8`), and renders an animated Agent Status Widget & Mascot.
3. **E2E Testability & Mock Suite**: Designed for isolated automated testing without dependency on live AGY CLI runs. It exposes REST mock ingestion endpoints and provides a CLI mock generator script to stream synthetic events into the pipeline.

---

## 2. Backend Integration Architecture (Express + Socket.io + Chokidar)

### 2.1 Workspace Directory Tree Scanning (`dir_tree`)

The backend dynamically constructs a JSON tree representing the target workspace directory to feed the D3 Treemap engine on the frontend.

#### Data Schema Contract
```typescript
interface TreeNode {
  name: string;           // File or folder name (e.g. "server.js" or "backend")
  path: string;           // Workspace-relative path (e.g. "backend/server.js")
  value?: number;         // File size in bytes (min 10) for leaf nodes
  children?: TreeNode[];  // Child nodes for directory nodes
}
```

#### Traversal & Node Calculation Logic
- **Recursive Scanning (`getDirTree`)**:
  - For **directory nodes**: `value` defaults to `children.length || 1` (or leaf aggregation in D3), containing a child array of filtered items.
  - For **leaf nodes (files)**: `value` is calculated as `Math.max(10, stats.size)` to guarantee non-zero tile areas in D3 layout computations.
- **Noise Filter Rules**:
  - Excluded patterns: `node_modules`, `.git`, `dist`, `build`, hidden directories (`.*`).
- **Lifecycle Triggers**:
  - **Connection Init**: Emitted immediately to newly connected Socket.io clients upon connection.
  - **Structural File Mutations**: Re-scanned and broadcasted whenever Chokidar emits an `add` (file addition) or `unlink` (file deletion) event.

---

### 2.2 Dual-Stream File Event Pipeline (WRITE vs READ)

The backend handles two distinct streams of file activity and unifies them into Socket.io broadcasts.

```
┌────────────────────────┐      ┌─────────────────────────┐
│ Local Workspace Files  │      │ AGY Transcript Logs     │
│ (Chokidar Watcher)     │      │ (transcript.jsonl)      │
└───────────┬────────────┘      └────────────┬────────────┘
            │ WRITE                          │ READ (tool_calls)
            ▼                                ▼
┌─────────────────────────────────────────────────────────┐
│           Node.js Middleware / Event Router             │
│   - Relative path conversion                            │
│   - Out-of-workspace filtering                          │
│   - Agent Working state trigger                         │
└───────────────────────────┬─────────────────────────────┘
                            │ Socket.io emit ('file_event')
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Frontend Real-time Visualizer              │
└─────────────────────────────────────────────────────────┘
```

#### 1. WRITE Stream (File Modifications & Additions)
- **Source**: Chokidar watcher on `WATCH_DIR`.
- **Event Listeners**: `.on('change')` and `.on('add')`.
- **Stabilization / Debouncing**: `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }` prevents intermediate partial write event floods during atomic saves or continuous log writes.
- **Payload Schema**:
  ```json
  {
    "path": "backend/server.js",
    "type": "WRITE",
    "timestamp": 1785000000000
  }
  ```

#### 2. READ Stream (Transcript Log Inspection)
- **Source**: Chokidar watcher targeting `~/.gemini/antigravity-cli/brain/*/logs/transcript.jsonl`.
- **Mechanism**:
  - On log file `change`, the backend inspects the appended line.
  - Parses the JSON record to locate `tool_calls`.
  - Filters for tool names: `view_file` (arguments: `AbsolutePath`) and `grep_search` (arguments: `SearchPath`).
- **Path Resolution & Filtering**:
  - Converts absolute path target (`AbsolutePath` / `SearchPath`) to workspace-relative path: `path.relative(WATCH_DIR, targetFile)`.
  - Filters out out-of-workspace paths (`relPath.startsWith('..')` or absolute paths outside root).
- **Payload Schema**:
  ```json
  {
    "path": "frontend/src/App.jsx",
    "type": "READ",
    "timestamp": 1785000000000
  }
  ```

---

### 2.3 Agent Status Lifecycle Manager (`agent_status`)

The backend maintains an in-memory state object representing the current state of the AGY CLI agent.

#### Agent State Object Contract
```typescript
interface AgentState {
  status: 'Idle' | 'Working';
  activeModel: string;        // e.g. "Gemini 3.6 Flash"
  totalStepCount: number;     // Increments on each agent tool call / transcript line
  lastActivity: number;       // Epoch timestamp of last activity
}
```

#### State Transition Logic
1. **Idle -> Working**: Triggered immediately when any `WRITE` event, `ADD` event, or transcript `tool_call` line is detected.
2. **Step Increment**: `totalStepCount` increments by 1 for each parsed transcript line or tool invocation.
3. **Working -> Idle Timer**:
   - A reset timer (`idleTimer`) is set for `3000ms`.
   - Subsequent activity clears and re-arms the timer.
   - Upon expiry, `agentState.status` transitions back to `'Idle'`, and `io.emit('agent_status', agentState)` is broadcast.

---

### 2.4 Socket.io Communication Channels

| Event Name | Direction | Payload Contract | Description |
| :--- | :--- | :--- | :--- |
| `dir_tree` | Server -> Client | `TreeNode` | Directory structure tree for D3 Treemap layout |
| `file_event` | Server -> Client | `{ path: string, type: 'READ' \| 'WRITE', timestamp: number }` | File access or modification event |
| `agent_status` | Server -> Client | `AgentState` | Agent activity state, model name, and step count |

---

## 3. Frontend Visualizer Architecture (Vite + React + D3 + Tailwind)

### 3.1 Component Architecture & Data Flow

```
┌────────────────────────────────────────────────────────┐
│                        App.jsx                         │
│  - Top Navbar with connection status indicator         │
│  - Main layout grid (Sidebar/Overlay + Treemap)        │
└───────────┬────────────────────────────────────────────┘
            │
      ┌─────┴─────────────────────────────┐
      ▼                                   ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│    StatusWidget.jsx       │   │    TreemapCanvas.jsx      │
│ - Agent Status Badge      │   │ - D3 Treemap Hierarchy    │
│ - Active Model Display    │   │ - 60fps Canvas Decay Loop │
│ - Total Step Counter      │   │ - Tooltip Hover Overlay   │
│ - Mascot State Animation  │   └───────────────────────────┘
└───────────────────────────┘
```

---

### 3.2 D3 Treemap Data Structure & Layout Computation

The visualizer uses `d3-hierarchy` to convert nested directory JSON trees into rectangular coordinates.

#### D3 Pipeline Algorithm
1. **Hierarchy Building**:
   ```javascript
   const root = d3.hierarchy(dirTreeData)
     .sum(d => d.value || 0)
     .sort((a, b) => b.value - a.value);
   ```
2. **Treemap Generator**:
   ```javascript
   const treemapLayout = d3.treemap()
     .size([containerWidth, containerHeight])
     .paddingInner(3)
     .paddingOuter(5)
     .paddingTop(22) // Space for folder headers
     .tile(d3.treemapSquarify);
   
   treemapLayout(root);
   ```
3. **Rectangular Bounding Output**:
   Each node gets computed pixel attributes: `x0, y0, x1, y1`.
   Leaf nodes (`root.leaves()`) map directly to individual workspace files.

---

### 3.3 Canvas vs SVG Hybrid Rendering Engine Strategy

To achieve 60fps high performance under rapid file events while maintaining clean text labels and interactive tooltips, a **Hybrid Canvas/SVG Engine** strategy is specified:

- **Canvas Layer (Background & Fading Blocks)**:
  - Renders all colored file rectangles and dynamic opacity overlays.
  - Avoids DOM thrashing when recalculating fill colors every frame for hundreds of files.
- **SVG / Overlay Layer (Borders, Directory Labels, Tooltips)**:
  - Renders folder boundary headers (`node.data.name`), clean crisp text labels for larger file blocks, and mouse hover tooltips.

---

### 3.4 1.5-Second Visual Decay Loop Algorithm

#### Mathematical Model
Let $t_{event}$ be the timestamp when a file event (`WRITE` or `READ`) is received for file $p$.
Let $t_{now}$ be the current frame timestamp from `performance.now()`.
The decay duration is $T_{decay} = 1500\text{ ms}$.

The intensity $\alpha(p, t_{now})$ at time $t_{now}$ is given by:

$$\alpha(p, t_{now}) = \max\left(0.0, 1.0 - \frac{t_{now} - t_{event}}{1500}\right)$$

#### Color Mapping Matrix
- **`WRITE` Event**: Orange RGB `(249, 115, 22)`
  $$\text{Color}_{WRITE} = \text{rgba}(249, 115, 22, \alpha)$$
- **`READ` Event**: Blue/Sky RGB `(56, 189, 248)`
  $$\text{Color}_{READ} = \text{rgba}(56, 189, 248, \alpha)$$
- **Base State ($\alpha = 0$)**: Slate RGB `(30, 41, 59, 0.7)` with subtle border `#334155`.

#### Code Implementation Blueprint
```javascript
const fileStates = new Map(); // path -> { type: 'WRITE'|'READ', intensity: 1.0, lastUpdated: number }

// Socket listener
socket.on('file_event', ({ path, type }) => {
  fileStates.set(path, {
    type,
    intensity: 1.0,
    lastUpdated: performance.now()
  });
});

// Render Loop (60 FPS)
function renderFrame(ctx, width, height, leaves) {
  const now = performance.now();
  ctx.clearRect(0, 0, width, height);

  leaves.forEach(node => {
    const relPath = node.data.path;
    const x = node.x0;
    const y = node.y0;
    const w = node.x1 - node.x0;
    const h = node.y1 - node.y0;

    let fillColor = 'rgba(30, 41, 59, 0.7)'; // Base idle color
    let strokeColor = '#334155';

    if (fileStates.has(relPath)) {
      const state = fileStates.get(relPath);
      const elapsed = now - state.lastUpdated;
      
      if (elapsed < 1500) {
        state.intensity = Math.max(0, 1.0 - elapsed / 1500);
        if (state.type === 'WRITE') {
          fillColor = `rgba(249, 115, 22, ${0.2 + state.intensity * 0.8})`;
          strokeColor = `rgba(249, 115, 22, ${state.intensity})`;
        } else {
          fillColor = `rgba(56, 189, 248, ${0.2 + state.intensity * 0.8})`;
          strokeColor = `rgba(56, 189, 248, ${state.intensity})`;
        }
      } else {
        fileStates.delete(relPath); // Clean up expired state
      }
    }

    // Draw file block
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  });

  requestAnimationFrame(() => renderFrame(ctx, width, height, leaves));
}
```

---

### 3.5 Status Widget & Mascot Animation Design

#### Status Widget UI Breakdown
- **Position**: Floating card positioned in the top-right corner with semi-transparent backdrop blur (`backdrop-blur-md bg-slate-900/80 border border-slate-800`).
- **Metrics Displayed**:
  1. **Status Badge**:
     - `'Idle'`: Gray/Green pill badge with steady indicator light.
     - `'Working'`: Animated pulsing Orange/Cyan badge with glowing ring (`animate-pulse`).
  2. **Active Model**: Text label showing model (e.g. `Gemini 3.6 Flash`).
  3. **Total Step Count**: Counter displaying accumulated tool calls.
  4. **Connection Pill**: Green dot for WebSocket connected, red for disconnected.

#### Mascot State Animation
- **Idle State**: Lucide icon (e.g. `Bot` or `Sparkles`) with slow cyan opacity breath effect.
- **Working State**: Active CSS keyframe animation with rotating outer ring (`animate-spin`), glowing radial aura, and pulsing activity icon.

---

## 4. E2E Testability & Mock Event Strategy

To enable rigorous, repeatable end-to-end testing without requiring a live AGY CLI execution or manual disk modifications, the architecture embeds a **Non-Invasive Mock Event Pipeline**.

### 4.1 Mock Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                   Playwright E2E Runner                │
└───────────┬────────────────────────────────────────────┘
            │
            ├────────────────────────────────────────────┐
            ▼ (HTTP Mock Endpoint)                       ▼ (Disk Mock Trigger)
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ Express Server (/api/mock/file_event)│     │ Synthetic Transcript / File Generator│
└───────────────────┬──────────────────┘     └───────────────────┬──────────────────┘
                    │                                            │
                    ▼                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        Socket.io Broadcast Channel                                │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Backend Mock Ingest REST API

The Express backend exposes dedicated development/test endpoints (active when `NODE_ENV !== 'production'` or via `--enable-mock` flag):

#### 1. `POST /api/mock/file_event`
- **Request Body**:
  ```json
  {
    "path": "backend/server.js",
    "type": "WRITE"
  }
  ```
- **Behavior**:
  - Validates relative path against workspace.
  - Broadcasts `file_event` via Socket.io.
  - Automatically triggers `updateAgentStatus('Working')`.

#### 2. `POST /api/mock/agent_status`
- **Request Body**:
  ```json
  {
    "status": "Working",
    "activeModel": "Gemini 3.6 Flash",
    "totalStepCount": 42
  }
  ```
- **Behavior**: Updates internal `agentState` and broadcasts `agent_status`.

#### 3. `POST /api/mock/reset`
- **Behavior**: Resets step counter and restores status to `Idle`.

---

### 4.3 CLI Mock Generator Script (`scripts/mock_generator.js`)

A standalone CLI tool provided in `scripts/mock_generator.js` allows developers and automated test scripts to simulate continuous file system activity.

```javascript
// Usage: node scripts/mock_generator.js --burst 10 --interval 200
// Or: node scripts/mock_generator.js --file backend/server.js --type READ
```

#### Supported Generator Modes
1. **Single Event Mode**: Fires a single `READ` or `WRITE` event to a specified file.
2. **Burst Stream Mode**: Generates a random sequence of `READ` and `WRITE` events across workspace files at specified intervals (e.g., 200ms) to test visual decay rendering under load.
3. **Transcript File Append Mode**: Appends synthetic JSONL records to a temporary file watching location to test the real log parsing pipeline.

---

### 4.4 Automated E2E Test Strategy (Playwright)

#### Test Cases Inventory
1. **TC-01: Directory Tree Render**: Connect to dashboard -> verify D3 Treemap populates leaf file rectangles matching workspace files.
2. **TC-02: WRITE Event Visual Decay**: Trigger `POST /api/mock/file_event` with `WRITE` -> verify target rectangle highlights in Orange (`#F97316`) -> verify intensity fades to baseline after 1.5 seconds.
3. **TC-03: READ Event Visual Decay**: Trigger `POST /api/mock/file_event` with `READ` -> verify target rectangle highlights in Blue (`#38BDF8`) -> verify fading decay.
4. **TC-04: Agent Status Widget State Transition**: Trigger mock event -> verify Status Widget transitions from `Idle` to `Working` -> verify mascot animation updates -> verify status reverts to `Idle` after 3 seconds.
5. **TC-05: Real Disk File Write Integration**: Execute shell command `echo "test" >> backend/server.js` -> verify Socket event emitted and canvas block highlights.

---

## 5. Architectural Gap Analysis & Recommendations

| Issue / Gap | Risk Level | Architectural Solution |
| :--- | :--- | :--- |
| **Missing Transcript Directory at Startup** | Medium | If `~/.gemini/antigravity-cli/brain` does not exist on startup, watcher fails silently. **Fix**: Add recursive fallback watcher or interval checker that attaches log watcher as soon as directory is created. |
| **D3 Treemap Re-layout Overhead** | Low-Medium | Re-computing `d3.treemap()` layout on every `file_event` causes unnecessary CPU usage. **Fix**: Store computed rectangle layout coordinates (`nodeMap: path -> rect`) and only re-calculate treemap layout when `dir_tree` updates. |
| **Transcript Log File Truncation / Partial Writes** | Low | High-frequency log appends can lead to reading incomplete JSON strings. **Fix**: Use readline / line-buffered stream reading with `try-catch` JSON parse guards. |
| **Canvas Redraw Batching** | Low | Calling `requestAnimationFrame` continuously when no active decay events exist wastes GPU/CPU. **Fix**: Pause animation loop when `fileStates.size === 0` and resume on new event. |

---

## 6. Conclusion & Implementation Guidance

The specified architecture fulfills all functional requirements (R1, R2) and acceptance criteria:
- **Express + Socket.io + Chokidar** backend provides robust dual-stream tracking for disk WRITEs and transcript log READs with minimal overhead.
- **Vite + React + D3 + Canvas** frontend delivers 60fps rendering of the 1.5s visual decay loop with high visual clarity.
- **REST Mock API + Script Generator** guarantees 100% E2E testability without live AGY dependencies.

This completes the survey phase analysis for `explorer_3`.
