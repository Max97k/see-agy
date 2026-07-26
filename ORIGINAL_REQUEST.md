# Original User Request

## Initial Request — 2026-07-26T05:44:25Z

<USER_REQUEST>
Build a non-invasive AGY CLI Web Visualizer Dashboard. The system monitors local file changes via chokidar and AGY transcript log events, rendering a 2D Treemap matrix of file access/modify states with a 1.5-second visual decay loop and mascot working state animation.

Working directory: /home/kuo/see-agy
Integrity mode: development

## Requirements

### R1. Backend Middleware Server (Node.js + Express + Socket.io + Chokidar)
- Watch project root for file additions/modifications (WRITE events) via `chokidar`, excluding `.git`, `node_modules`, `dist`.
- Watch AGY CLI transcript logs (`~/.gemini/antigravity-cli/brain/*/logs/transcript.jsonl`) to broadcast `view_file` / `grep_search` read events (READ events) and agent working/idle status.
- Scan workspace directory tree on connection and emit `dir_tree` & `agent_status` via Socket.io (Port 3001).

### R2. Frontend Dashboard (Vite + React + D3 + Tailwind CSS + Lucide Icons)
- Render D3 Treemap layout of workspace file/folder matrix.
- Implement 1.5-second linear color intensity decay loop (`WRITE`: Orange, `READ`: Blue) rendered on Canvas/SVG.
- Display Status Widget showing Agent Working/Idle status, active model, and session activity step counter.

## Acceptance Criteria

### Backend & Real-time Stream
- [ ] Backend server runs cleanly on port 3001 without errors.
- [ ] Socket.io emits `dir_tree` on client connection and updates on file structural changes.
- [ ] File WRITE events (`echo "test" > test.txt`) and READ events trigger socket broadcasts.

### Frontend Visualization & UI
- [ ] Frontend builds without syntax or lint errors (`npm run build` or Vite dev server).
- [ ] D3 Treemap accurately displays project files/folders.
- [ ] File events trigger 1.5s fading orange (WRITE) and blue (READ) highlights.
- [ ] Agent status widget dynamically toggles between Idle and Working.
</USER_REQUEST>
