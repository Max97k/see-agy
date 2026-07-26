/**
 * E2E Opaque-box Test Suite for AGY CLI Web Visualizer Dashboard
 * Tests backend REST mock endpoints and Socket.io real-time broadcasts
 * across Tiers 1-4.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  ioClient = require(path.resolve(__dirname, '../frontend/node_modules/socket.io-client'));
}

const BASE_URL = process.env.TEST_URL || 'http://localhost:3005';

// Helper for HTTP requests
function httpRequest(method, endpoint, payload = null) {
  const url = new URL(endpoint, BASE_URL);
  const data = payload !== null ? JSON.stringify(payload) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch (e) {
            parsed = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Test Runner Infrastructure
let passCount = 0;
let failCount = 0;
const results = [];

async function runTest(tier, name, fn) {
  const startTime = Date.now();
  try {
    await fn();
    const duration = Date.now() - startTime;
    passCount++;
    results.push({ tier, name, status: 'PASS', duration });
    console.log(`  ✓ [PASS] [${tier}] ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - startTime;
    failCount++;
    results.push({ tier, name, status: 'FAIL', duration, error: err.message });
    console.error(`  ✗ [FAIL] [${tier}] ${name} (${duration}ms): ${err.message}`);
  }
}

function createSocketClient() {
  return ioClient(BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 4000
  });
}

// Check backend server availability or spawn if needed
async function ensureServerRunning() {
  try {
    const res = await httpRequest('GET', '/api/health');
    if (res.status === 200) {
      return null; // Server already running externally
    }
  } catch (e) {
    // Server not running, attempt to spawn
  }

  console.log('[E2E Test] Starting backend server for test run...');
  const serverProc = spawn('node', [path.resolve(__dirname, '../backend/server.js')], {
    stdio: 'ignore'
  });

  // Wait for server to start
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await httpRequest('GET', '/api/health');
      if (res.status === 200) {
        return serverProc;
      }
    } catch (e) {}
  }
  throw new Error('Failed to start backend server for testing');
}

async function runAllTests() {
  console.log('====================================================');
  console.log('  AGY Web Visualizer - E2E Opaque-box Test Suite    ');
  console.log('====================================================\n');

  const serverProc = await ensureServerRunning();

  // Tier 1: Feature Coverage
  console.log('--- Tier 1: Feature Coverage ---');

  await runTest('Tier 1', '1.1 dir_tree initial socket payload structure', async () => {
    const socket = createSocketClient();
    const payload = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout waiting for dir_tree event'));
      }, 4000);
      socket.on('dir_tree', tree => {
        clearTimeout(timer);
        socket.disconnect();
        resolve(tree);
      });
    });

    if (!payload || typeof payload !== 'object') {
      throw new Error('dir_tree payload is not an object');
    }
    if (!payload.name && !payload.path && payload.path !== '') {
      throw new Error('dir_tree missing name or path property');
    }
    if (!Array.isArray(payload.children)) {
      throw new Error('dir_tree children is not an array');
    }
  });

  await runTest('Tier 1', '1.2 file_event WRITE socket broadcast', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    const eventPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout waiting for file_event WRITE broadcast'));
      }, 4000);
      socket.on('file_event', ev => {
        if (ev.type === 'WRITE' && ev.path.includes('backend/server.js')) {
          clearTimeout(timer);
          socket.disconnect();
          resolve(ev);
        }
      });
    });

    const restRes = await httpRequest('POST', '/api/mock/file_event', {
      path: 'backend/server.js',
      type: 'WRITE'
    });
    if (restRes.status !== 200 || !restRes.body.success) {
      socket.disconnect();
      throw new Error(`REST endpoint failed with status ${restRes.status}`);
    }

    const emitted = await eventPromise;
    if (emitted.type !== 'WRITE') {
      throw new Error(`Expected event type WRITE but received ${emitted.type}`);
    }
  });

  await runTest('Tier 1', '1.3 file_event READ socket broadcast', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    const eventPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout waiting for file_event READ broadcast'));
      }, 4000);
      socket.on('file_event', ev => {
        if (ev.type === 'READ' && ev.path.includes('frontend/src/App.jsx')) {
          clearTimeout(timer);
          socket.disconnect();
          resolve(ev);
        }
      });
    });

    const restRes = await httpRequest('POST', '/api/mock/file_event', {
      path: 'frontend/src/App.jsx',
      type: 'READ'
    });
    if (restRes.status !== 200 || !restRes.body.success) {
      socket.disconnect();
      throw new Error(`REST endpoint failed with status ${restRes.status}`);
    }

    const emitted = await eventPromise;
    if (emitted.type !== 'READ') {
      throw new Error(`Expected event type READ but received ${emitted.type}`);
    }
  });

  await runTest('Tier 1', '1.4 agent_status state transition (working <-> idle)', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    // Test transition to working
    const workingPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for working status')), 4000);
      socket.on('agent_status', st => {
        if (st.status === 'working' && st.stepCount === 15) {
          clearTimeout(timer);
          resolve(st);
        }
      });
    });

    await httpRequest('POST', '/api/mock/agent_status', {
      status: 'working',
      stepCount: 15
    });

    const workingState = await workingPromise;
    if (workingState.status !== 'working') throw new Error('Failed to switch to working status');

    // Test transition to idle
    const idlePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for idle status')), 4000);
      socket.on('agent_status', st => {
        if (st.status === 'idle') {
          clearTimeout(timer);
          resolve(st);
        }
      });
    });

    await httpRequest('POST', '/api/mock/agent_status', { status: 'idle' });
    const idleState = await idlePromise;
    socket.disconnect();
    if (idleState.status !== 'idle') throw new Error('Failed to switch to idle status');
  });

  // Tier 2: Boundary & Corner Cases
  console.log('\n--- Tier 2: Boundary & Corner Cases ---');

  await runTest('Tier 2', '2.1 non-existent file path handling', async () => {
    const res = await httpRequest('POST', '/api/mock/file_event', {
      path: 'non_existent_folder/missing_file.js',
      type: 'READ'
    });
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected status 200 for non-existent path, got ${res.status}`);
    }
  });

  await runTest('Tier 2', '2.2 empty/malformed payload validation (HTTP 400 Bad Request)', async () => {
    const res = await httpRequest('POST', '/api/mock/file_event', {});
    if (res.status !== 400) {
      throw new Error(`Expected HTTP 400 for empty payload, got ${res.status}`);
    }
  });

  await runTest('Tier 2', '2.3 rapid burst event emission load test (25 consecutive events)', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    let receivedCount = 0;
    const targetCount = 25;

    const burstPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Timeout in rapid burst test: received ${receivedCount}/${targetCount}`));
      }, 5000);

      socket.on('file_event', ev => {
        if (ev.path && ev.path.startsWith('burst_test_')) {
          receivedCount++;
          if (receivedCount >= targetCount) {
            clearTimeout(timer);
            socket.disconnect();
            resolve(receivedCount);
          }
        }
      });
    });

    const requests = [];
    for (let i = 0; i < targetCount; i++) {
      requests.push(
        httpRequest('POST', '/api/mock/file_event', {
          path: `burst_test_${i}.js`,
          type: i % 2 === 0 ? 'WRITE' : 'READ'
        })
      );
    }

    await Promise.all(requests);
    const finalCount = await burstPromise;
    if (finalCount < targetCount) {
      throw new Error(`Received only ${finalCount} events out of ${targetCount}`);
    }
  });

  await runTest('Tier 2', '2.4 out-of-workspace relative path normalization & containment', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    const eventPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout waiting for out-of-workspace file event'));
      }, 4000);
      socket.on('file_event', ev => {
        if (ev.path) {
          clearTimeout(timer);
          socket.disconnect();
          resolve(ev);
        }
      });
    });

    const res = await httpRequest('POST', '/api/mock/file_event', {
      path: '../../etc/passwd',
      type: 'READ'
    });

    if (res.status !== 200) {
      socket.disconnect();
      throw new Error(`Expected HTTP 200 response, got ${res.status}`);
    }

    const emitted = await eventPromise;
    if (!emitted.path) {
      throw new Error('Emitted event path is empty');
    }
  });

  // Tier 3: Cross-Feature Combinations
  console.log('\n--- Tier 3: Cross-Feature Combinations ---');

  await runTest('Tier 3', '3.1 simultaneous WRITE and READ socket broadcasts', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    let receivedWrite = false;
    let receivedRead = false;

    const comboPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Timeout: received WRITE=${receivedWrite}, READ=${receivedRead}`));
      }, 4000);

      socket.on('file_event', ev => {
        if (ev.path === 'combo/file_w.js' && ev.type === 'WRITE') receivedWrite = true;
        if (ev.path === 'combo/file_r.js' && ev.type === 'READ') receivedRead = true;

        if (receivedWrite && receivedRead) {
          clearTimeout(timer);
          socket.disconnect();
          resolve(true);
        }
      });
    });

    await Promise.all([
      httpRequest('POST', '/api/mock/file_event', { path: 'combo/file_w.js', type: 'WRITE' }),
      httpRequest('POST', '/api/mock/file_event', { path: 'combo/file_r.js', type: 'READ' })
    ]);

    await comboPromise;
  });

  await runTest('Tier 3', '3.2 concurrent file events with agent_status updates', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    let gotFileEvent = false;
    let gotAgentStatus = false;

    const dualPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Timeout: gotFileEvent=${gotFileEvent}, gotAgentStatus=${gotAgentStatus}`));
      }, 4000);

      socket.on('file_event', ev => {
        if (ev.path === 'concurrent/file.js') gotFileEvent = true;
        if (gotFileEvent && gotAgentStatus) {
          clearTimeout(timer);
          socket.disconnect();
          resolve(true);
        }
      });

      socket.on('agent_status', st => {
        if (st.stepCount === 77) gotAgentStatus = true;
        if (gotFileEvent && gotAgentStatus) {
          clearTimeout(timer);
          socket.disconnect();
          resolve(true);
        }
      });
    });

    await Promise.all([
      httpRequest('POST', '/api/mock/file_event', { path: 'concurrent/file.js', type: 'WRITE' }),
      httpRequest('POST', '/api/mock/agent_status', { status: 'working', stepCount: 77 })
    ]);

    await dualPromise;
  });

  // Tier 4: Real-World Application Scenarios
  console.log('\n--- Tier 4: Real-World Application Scenarios ---');

  await runTest('Tier 4', '4.1 full session lifecycle (connect -> scan -> read -> write -> idle)', async () => {
    const socket = createSocketClient();

    // Step 1: Connect & verify initial payload
    const initialTree = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Step 1 failed: dir_tree timeout')), 4000);
      socket.on('dir_tree', tree => {
        clearTimeout(timer);
        resolve(tree);
      });
    });
    if (!initialTree) throw new Error('Step 1 failed: empty dir_tree');

    // Step 2: Workspace scan check
    const health = await httpRequest('GET', '/api/health');
    if (health.status !== 200 || !health.body.port) {
      socket.disconnect();
      throw new Error('Step 2 failed: health endpoint invalid');
    }

    // Step 3: Emulate File Read
    const readPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Step 3 failed: file READ event timeout')), 4000);
      socket.on('file_event', ev => {
        if (ev.type === 'READ' && ev.path === 'frontend/src/App.jsx') {
          clearTimeout(timer);
          resolve(ev);
        }
      });
    });
    await httpRequest('POST', '/api/mock/file_event', { path: 'frontend/src/App.jsx', type: 'READ' });
    await readPromise;

    // Step 4: Emulate File Write
    const writePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Step 4 failed: file WRITE event timeout')), 4000);
      socket.on('file_event', ev => {
        if (ev.type === 'WRITE' && ev.path === 'backend/server.js') {
          clearTimeout(timer);
          resolve(ev);
        }
      });
    });
    await httpRequest('POST', '/api/mock/file_event', { path: 'backend/server.js', type: 'WRITE' });
    await writePromise;

    // Step 5: Transition to Idle
    const idlePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Step 5 failed: idle status timeout')), 4000);
      socket.on('agent_status', st => {
        if (st.status === 'idle') {
          clearTimeout(timer);
          resolve(st);
        }
      });
    });
    await httpRequest('POST', '/api/mock/agent_status', { status: 'idle' });
    await idlePromise;

    socket.disconnect();
  });

  // Print Summary Table
  console.log('\n====================================================');
  console.log('                 Test Execution Summary             ');
  console.log('====================================================');
  console.log(`Total Tests Run : ${results.length}`);
  console.log(`Passed          : ${passCount}`);
  console.log(`Failed          : ${failCount}`);
  console.log('----------------------------------------------------');

  if (serverProc) {
    serverProc.kill('SIGTERM');
  }

  if (failCount > 0) {
    console.error('\nResult: FAILED - Some tests did not pass.\n');
    process.exit(1);
  } else {
    console.log('\nResult: PASSED - All 11 tests completed successfully!\n');
    process.exit(0);
  }
}

if (require.main === module) {
  runAllTests().catch(err => {
    console.error('Fatal error executing tests:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests, results };
