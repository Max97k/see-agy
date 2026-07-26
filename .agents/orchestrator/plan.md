# Master Plan: AGY CLI Web Visualizer Dashboard

## Objective
Build a non-invasive web visualizer dashboard monitoring file changes via chokidar and AGY transcript log events, rendering a 2D Treemap matrix with a 1.5s visual decay loop and mascot working state animation.

## Phases & Strategy
1. **Survey (Phase 0)**: Dispatch 3 parallel Explorers to inspect existing codebase structure in `/home/kuo/see-agy`, AGY log location (`~/.gemini/antigravity-cli/brain/*/logs/transcript.jsonl`), dependencies, package setups, etc.
2. **Decomposition (Phase 1)**: Formulate `PROJECT.md` with full feature inventory, interface contracts, and milestone breakdown.
3. **Execution (Phase 2)**:
   - **Track 1**: E2E Testing Track — build opaque-box E2E test runner and test cases (Tiers 1-4).
   - **Track 2**: Backend Middleware Server — Socket.io server on port 3001, Chokidar file watcher, AGY log watcher, `dir_tree` & `agent_status` events.
   - **Track 3**: Frontend Dashboard — Vite + React + D3 + Tailwind CSS + Lucide Icons, 2D Treemap, 1.5s decay loop, status widget.
4. **Verification & Audit (Phase 3)**: E2E test execution, Challenger verification, Forensic Audit (`teamwork_preview_auditor`).
5. **Completion (Phase 4)**: Final report & delivery.
