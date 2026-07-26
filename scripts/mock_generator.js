#!/usr/bin/env node

/**
 * Mock Event Generator CLI Script
 * Emits mock file events (READ/WRITE) and agent status updates to the backend
 * via REST endpoints or Socket.io connection.
 */

const http = require('http');
const path = require('path');

// Try requiring socket.io-client from local node_modules locations
let ioClient = null;
try {
  ioClient = require('socket.io-client');
} catch (e1) {
  try {
    const frontendPath = path.resolve(__dirname, '../frontend/node_modules/socket.io-client');
    ioClient = require(frontendPath);
  } catch (e2) {
    try {
      const backendPath = path.resolve(__dirname, '../backend/node_modules/socket.io-client');
      ioClient = require(backendPath);
    } catch (e3) {
      // Socket mode will report an error if attempted without socket.io-client
    }
  }
}

function printUsage() {
  console.log(`
Usage: node scripts/mock_generator.js [options] [positional_args]

Options:
  -t, --type <type>        Event type: READ, WRITE, or STATUS (default: WRITE)
  -p, --path <path>        File path for file_event (default: backend/server.js)
  -s, --status <status>    Agent status: working or idle (default: working)
  -m, --model <name>       Active model name (default: Gemini 3.6 Flash)
  -c, --step <number>      Total step counter (default: auto/increment)
  -u, --url <url>          Backend server base URL (default: http://localhost:3001)
  --mode <mode>            Emission transport mode: rest or socket (default: rest)
  --burst <count>          Emit <count> events in rapid succession
  --delay <ms>             Delay between burst events in milliseconds (default: 50)
  -h, --help               Display this help message

Examples:
  node scripts/mock_generator.js -t READ -p frontend/src/App.jsx
  node scripts/mock_generator.js -t WRITE -p backend/server.js
  node scripts/mock_generator.js -s working -m "Gemini 3.6 Flash" -c 15
  node scripts/mock_generator.js READ backend/server.js
  node scripts/mock_generator.js working
`);
}

function parseArgs(args) {
  const options = {
    type: null,
    path: null,
    status: null,
    model: null,
    stepCount: null,
    url: process.env.TEST_URL || 'http://localhost:3005',
    mode: 'rest',
    burst: 1,
    delay: 50
  };

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    } else if (arg === '-t' || arg === '--type' || arg === '-e' || arg === '--event') {
      options.type = args[++i];
    } else if (arg === '-p' || arg === '--path') {
      options.path = args[++i];
    } else if (arg === '-s' || arg === '--status') {
      options.status = args[++i];
    } else if (arg === '-m' || arg === '--model') {
      options.model = args[++i];
    } else if (arg === '-c' || arg === '--step') {
      options.stepCount = parseInt(args[++i], 10);
    } else if (arg === '-u' || arg === '--url') {
      options.url = args[++i];
    } else if (arg === '--mode') {
      options.mode = args[++i].toLowerCase();
    } else if (arg === '--burst') {
      options.burst = parseInt(args[++i], 10);
    } else if (arg === '--delay') {
      options.delay = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Handle positional arguments
  if (positional.length > 0) {
    const first = positional[0].toUpperCase();
    if (first === 'READ' || first === 'WRITE') {
      options.type = options.type || first;
      if (positional[1]) options.path = options.path || positional[1];
    } else if (first === 'WORKING' || first === 'IDLE') {
      options.status = options.status || first.toLowerCase();
      options.type = options.type || 'STATUS';
    } else {
      options.path = options.path || positional[0];
    }
  }

  // Set intelligent defaults
  if (!options.type) {
    if (options.status) {
      options.type = 'STATUS';
    } else {
      options.type = 'WRITE';
    }
  } else {
    options.type = options.type.toUpperCase();
  }

  if (options.type === 'READ' || options.type === 'WRITE') {
    if (!options.path) {
      options.path = 'backend/server.js';
    }
  } else if (options.type === 'STATUS' || options.type === 'AGENT_STATUS') {
    if (!options.status) {
      options.status = 'working';
    }
  }

  return options;
}

async function sendRestRequest(baseUrl, endpoint, payload) {
  const url = new URL(endpoint, baseUrl);
  const data = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ raw: body });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendSocketEvent(url, eventName, payload) {
  if (!ioClient) {
    throw new Error('socket.io-client package not found. Please run npm install or use REST mode.');
  }

  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      timeout: 3000
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket connection timed out'));
    }, 4000);

    socket.on('connect', () => {
      socket.emit(eventName, payload);
      setTimeout(() => {
        clearTimeout(timer);
        socket.disconnect();
        resolve({ success: true, emitted: eventName, payload });
      }, 200);
    });

    socket.on('connect_error', err => {
      clearTimeout(timer);
      socket.disconnect();
      reject(err);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  console.log(`[MockGenerator] Target: ${opts.url} | Mode: ${opts.mode.toUpperCase()}`);

  const tasks = [];
  for (let i = 0; i < opts.burst; i++) {
    tasks.push(async () => {
      if (opts.type === 'READ' || opts.type === 'WRITE') {
        const payload = { path: opts.path, type: opts.type };
        if (opts.mode === 'socket') {
          const res = await sendSocketEvent(opts.url, 'file_event', payload);
          console.log(`[MockGenerator] [Burst ${i + 1}/${opts.burst}] Socket emitted file_event:`, res.payload);
        } else {
          const res = await sendRestRequest(opts.url, '/api/mock/file_event', payload);
          console.log(`[MockGenerator] [Burst ${i + 1}/${opts.burst}] REST file_event response:`, res);
        }
      } else {
        const payload = {
          status: opts.status || 'working',
          model: opts.model || 'Gemini 3.6 Flash',
          stepCount: opts.stepCount !== null ? opts.stepCount : 1
        };
        if (opts.mode === 'socket') {
          const res = await sendSocketEvent(opts.url, 'agent_status', payload);
          console.log(`[MockGenerator] [Burst ${i + 1}/${opts.burst}] Socket emitted agent_status:`, res.payload);
        } else {
          const res = await sendRestRequest(opts.url, '/api/mock/agent_status', payload);
          console.log(`[MockGenerator] [Burst ${i + 1}/${opts.burst}] REST agent_status response:`, res);
        }
      }
    });
  }

  for (let i = 0; i < tasks.length; i++) {
    await tasks[i]();
    if (i < tasks.length - 1 && opts.delay > 0) {
      await new Promise(r => setTimeout(r, opts.delay));
    }
  }

  console.log('[MockGenerator] All mock events emitted successfully.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[MockGenerator] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, sendRestRequest, sendSocketEvent };
