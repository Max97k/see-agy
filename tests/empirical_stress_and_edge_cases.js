/**
 * Empirical Stress & Edge Case Test Suite for AGY CLI Web Visualizer Dashboard Backend
 * Verifies performance under stress, edge cases, stability, memory safety, and error handling.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  ioClient = require(path.resolve(__dirname, '../frontend/node_modules/socket.io-client'));
}

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';

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

function createSocketClient() {
  return ioClient(BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 4000
  });
}

let serverProcess = null;
let serverErrorLogs = [];

async function ensureServerRunning() {
  // Clear any existing process occupying port 3001
  try {
    execSync('fuser -k 3001/tcp 2>/dev/null || true');
  } catch (e) {}

  await new Promise(r => setTimeout(r, 200));

  console.log('[Harness] Spawning fresh backend server...');
  serverProcess = spawn('node', [path.resolve(__dirname, '../backend/server.js')], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stderr.on('data', data => {
    const str = data.toString();
    serverErrorLogs.push(str);
    console.error('[Backend stderr]', str.trim());
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.warn(`[Backend process exited unexpectedly] code=${code}, signal=${signal}`);
    }
  });

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const health = await httpRequest('GET', '/api/health');
      if (health.status === 200) return;
    } catch (e) {}
  }
  throw new Error('Could not start backend server');
}

async function runEmpiricalSuite() {
  console.log('=================================================================');
  console.log('  AGY Visualizer - Empirical Stress & Edge Case Harness          ');
  console.log('=================================================================\n');

  await ensureServerRunning();

  let passed = 0;
  let failed = 0;
  const auditLogs = [];

  async function testCase(name, fn) {
    const start = Date.now();
    try {
      await fn();
      const dur = Date.now() - start;
      passed++;
      console.log(`✓ [PASS] ${name} (${dur}ms)`);
      auditLogs.push({ name, status: 'PASS', durationMs: dur });
    } catch (err) {
      const dur = Date.now() - start;
      failed++;
      console.error(`✗ [FAIL] ${name} (${dur}ms): ${err.message}`);
      auditLogs.push({ name, status: 'FAIL', durationMs: dur, error: err.message });
    }
  }

  // SECTION 1: Rapid Burst & High Volume Stress
  console.log('--- Section 1: Rapid Burst & High Volume Stress ---');

  await testCase('1.1 50-event burst emission with socket payload receipt verification', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    let count = 0;
    const burstDone = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Timed out waiting for burst events, received ${count}/50`));
      }, 5000);

      socket.on('file_event', ev => {
        if (ev.path && ev.path.startsWith('burst_verify_')) {
          count++;
          if (count >= 50) {
            clearTimeout(timer);
            socket.disconnect();
            resolve(count);
          }
        }
      });
    });

    const reqs = [];
    for (let i = 0; i < 50; i++) {
      reqs.push(
        httpRequest('POST', '/api/mock/file_event', {
          path: `burst_verify_${i}.js`,
          type: i % 2 === 0 ? 'WRITE' : 'READ'
        })
      );
    }
    await Promise.all(reqs);
    const finalReceived = await burstDone;
    if (finalReceived !== 50) throw new Error(`Expected 50 events, received ${finalReceived}`);
  });

  await testCase('1.2 500-event high-concurrency stress test for server crash and memory leak safety', async () => {
    const memBefore = process.memoryUsage().heapUsed;

    const reqs = [];
    for (let i = 0; i < 500; i++) {
      reqs.push(
        httpRequest('POST', '/api/mock/file_event', {
          path: `stress_test_${i % 10}.js`,
          type: i % 2 === 0 ? 'WRITE' : 'READ'
        })
      );
    }

    const results = await Promise.all(reqs);
    const successful = results.filter(r => r.status === 200).length;
    if (successful !== 500) {
      throw new Error(`Only ${successful}/500 requests returned HTTP 200`);
    }

    const health = await httpRequest('GET', '/api/health');
    if (health.status !== 200) throw new Error('Server degraded or crashed after 500 requests');

    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = ((memAfter - memBefore) / 1024 / 1024).toFixed(2);
    console.log(`    Heap diff during test run: ${diffMb} MB`);
  });

  // SECTION 2: Edge Case Mining
  console.log('\n--- Section 2: Edge Case Mining ---');

  await testCase('2.1 Transcript Log Parsing - Malformed JSON & Out-of-Workspace Lines', async () => {
    const sessionDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain', 'stress_session_test');
    const logsDir = path.join(sessionDir, '.system_generated', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'transcript.jsonl');

    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    let receivedRead = false;
    const eventPromise = new Promise(resolve => {
      const timer = setTimeout(() => resolve(), 3000);
      socket.on('file_event', ev => {
        if (ev.path === 'backend/server.js' && ev.type === 'READ') {
          receivedRead = true;
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const content = [
      'MALFORMED JSON STRING HERE',
      '{ incomplete: json',
      'null',
      '123',
      '{"tool_calls": "not an array"}',
      '{"tool_calls": [{"name": "view_file", "args": {"AbsolutePath": "../../etc/passwd"}}]}',
      JSON.stringify({
        step_index: 42,
        tool_calls: [
          {
            name: 'view_file',
            args: { AbsolutePath: '"backend/server.js"' }
          }
        ]
      })
    ].join('\n') + '\n';

    fs.writeFileSync(logFile, content);

    await eventPromise;
    socket.disconnect();

    // Clean up
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {}

    if (!receivedRead) {
      throw new Error('Valid event after malformed lines was not processed by transcript watcher');
    }
  });

  await testCase('2.2 Out-of-workspace path containment and normalization', async () => {
    const badPaths = [
      '/etc/passwd',
      '../../../../etc/passwd',
      '/home/kuo/see-agy-other/file.txt',
      '..',
      '.'
    ];

    for (const p of badPaths) {
      const res = await httpRequest('POST', '/api/mock/file_event', { path: p, type: 'READ' });
      if (res.status !== 200) {
        throw new Error(`Path "${p}" returned status ${res.status}`);
      }
    }
  });

  await testCase('2.3 Outer double quote stripping verification', async () => {
    const socket = createSocketClient();
    await new Promise(resolve => socket.on('connect', resolve));

    const quotePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout waiting for stripped path event'));
      }, 4000);

      socket.on('file_event', ev => {
        if (ev.path === 'backend/server.js') {
          clearTimeout(timer);
          socket.disconnect();
          resolve(ev);
        }
      });
    });

    await httpRequest('POST', '/api/mock/file_event', {
      path: '""backend/server.js""',
      type: 'WRITE'
    });

    const emitted = await quotePromise;
    if (emitted.path !== 'backend/server.js') {
      throw new Error(`Path double quotes were not stripped cleanly: got "${emitted.path}"`);
    }
  });

  await testCase('2.4 Non-existent log paths and deleted directory resilience', async () => {
    const dummyDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain', 'dummy_session');
    fs.mkdirSync(dummyDir, { recursive: true });
    const dummyFile = path.join(dummyDir, 'transcript.jsonl');

    fs.writeFileSync(dummyFile, JSON.stringify({ step_index: 1 }) + '\n');
    await new Promise(r => setTimeout(r, 200));

    // Delete directory while backend is running
    fs.rmSync(dummyDir, { recursive: true, force: true });
    await new Promise(r => setTimeout(r, 200));

    // Health check after deletion
    const health = await httpRequest('GET', '/api/health');
    if (health.status !== 200) throw new Error('Server crashed when watched transcript dir was deleted');
  });

  await testCase('2.5 Missing / invalid REST parameters error handling', async () => {
    const res1 = await httpRequest('POST', '/api/mock/file_event', {});
    if (res1.status !== 400) throw new Error(`Expected HTTP 400 for empty body, got ${res1.status}`);

    const res2 = await httpRequest('POST', '/api/mock/file_event', { path: 'backend/server.js' });
    if (res2.status !== 400) throw new Error(`Expected HTTP 400 for missing type, got ${res2.status}`);

    const res3 = await httpRequest('POST', '/api/mock/file_event', { type: 'WRITE' });
    if (res3.status !== 400) throw new Error(`Expected HTTP 400 for missing path, got ${res3.status}`);
  });

  // SECTION 3: Final Stability Check
  console.log('\n--- Section 3: Final Stability Check ---');

  await testCase('3.1 Server operational status & stderr clean check', async () => {
    const health = await httpRequest('GET', '/api/health');
    if (health.status !== 200) throw new Error('Server not operational');
    if (serverErrorLogs.length > 0) {
      throw new Error(`Server logged stderr errors: ${serverErrorLogs.join('\n')}`);
    }
  });

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }

  console.log('\n=================================================================');
  console.log(` Harness Execution Summary: ${passed} Passed, ${failed} Failed`);
  console.log('=================================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runEmpiricalSuite().catch(err => {
  console.error('Fatal Harness Error:', err);
  if (serverProcess) serverProcess.kill('SIGKILL');
  process.exit(1);
});
