## 2026-07-26T05:46:17Z
You are worker_m0_test assigned to Milestone 0 (E2E Testing Infrastructure).
Working directory for your metadata: /home/kuo/see-agy/.agents/teamwork_preview_worker_m0_test

MANDATORY READ:
1. Read /home/kuo/see-agy/ORIGINAL_REQUEST.md
2. Read /home/kuo/see-agy/.agents/orchestrator/PROJECT.md

WRITE OWNERSHIP FILE BOUNDARIES:
- Exclusive ownership: /home/kuo/see-agy/scripts/, /home/kuo/see-agy/tests/, /home/kuo/see-agy/TEST_READY.md
- Read access: all project files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK:
1. Create /home/kuo/see-agy/scripts/mock_generator.js:
   - Command-line script to emit mock events to the backend REST ingestion endpoints (http://localhost:3001/api/mock/file_event and http://localhost:3001/api/mock/agent_status) or via Socket.io.
   - Support flags/arguments to trigger READ (blue), WRITE (orange), and agent_status (working/idle, step counter, active model).
2. Create /home/kuo/see-agy/tests/e2e.test.js:
   - Comprehensive test suite testing backend REST/socket endpoints and frontend API integration.
   - Tier 1 (Feature Coverage): Verify dir_tree structure, file_event WRITE/READ socket broadcasts, agent_status transitions.
   - Tier 2 (Boundary & Corner Cases): Test non-existent paths, empty payload, rapid burst events, out-of-workspace paths.
   - Tier 3 (Cross-Feature Combinations): Simultaneous WRITE and READ events with concurrent agent status updates.
   - Tier 4 (Real-World Application Scenarios): Full lifecycle simulation (session start -> workspace scan -> file read -> file write -> session idle).
3. Execute the tests against a running backend server or node runner.
4. Publish /home/kuo/see-agy/TEST_READY.md detailing test runner commands, tier breakdown, and test count summary once complete.

OUTPUT:
Write your handoff report to /home/kuo/see-agy/.agents/teamwork_preview_worker_m0_test/handoff.md with full command execution and build/test outputs. Send a message when finished.
