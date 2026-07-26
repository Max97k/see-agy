const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const cors = require('cors');

const app = express();

const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173', // Vite preview default port
  'http://127.0.0.1:4173',
  ...envOrigins
];

// 🛡️ Sentinel: Restrict CORS to specific local origins to prevent CSRF and cross-origin attacks
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3005', 10);
let WATCH_DIR = path.resolve(process.env.WATCH_DIR || process.argv[2] || path.resolve(__dirname, '..'));

// Helper to strip quotes from string arguments
function unquote(str) {
  if (typeof str !== 'string') return '';
  let s = str.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// Normalize and filter path relative to WATCH_DIR
function normalizeWorkspacePath(rawPath, workspaceRoot = WATCH_DIR) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const cleaned = unquote(rawPath);
  if (!cleaned) return null;

  const absPath = path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(workspaceRoot, cleaned);
  
  if (!absPath.startsWith(workspaceRoot)) {
    return null;
  }

  const relPath = path.relative(workspaceRoot, absPath);
  if (!relPath || relPath.startsWith('..') || relPath === '.') {
    return null;
  }

  return relPath;
}

// Helper to read active model from settings.json
function getActiveModel() {
  const cliSettingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  const userSettingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
  
  for (const p of [cliSettingsPath, userSettingsPath]) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (data && data.model && typeof data.model === 'string') {
          return data.model;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return 'Gemini 3.6 Flash';
}

// Directory Tree builder for D3 Treemap
function getDirTree(dirPath = WATCH_DIR, relativeBase = WATCH_DIR) {
  const name = path.basename(dirPath);
  const relPath = path.relative(relativeBase, dirPath) || '';
  const stats = fs.statSync(dirPath);

  if (stats.isDirectory()) {
    const children = [];
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.startsWith('.') || file === 'node_modules' || file === 'dist' || file === 'build') {
          continue;
        }
        const fullChildPath = path.join(dirPath, file);
        try {
          const childTree = getDirTree(fullChildPath, relativeBase);
          if (childTree) children.push(childTree);
        } catch (e) {
          // Ignore unreadable files
        }
      }
    } catch (e) {
      // Ignore directory read errors
    }
    return { name, path: relPath, type: 'directory', value: children.length || 1, children };
  } else {
    return { name, path: relPath, type: 'file', value: Math.max(10, stats.size), size: stats.size };
  }
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // 🛡️ Sentinel: Match Socket.io CORS policy with Express
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
  }
});

// Agent Status State & Inactivity Timer
let agentState = {
  status: 'idle',
  model: getActiveModel(),
  stepCount: 0
};

let idleTimer = null;

function markAgentWorking() {
  agentState.model = getActiveModel();
  agentState.status = 'working';

  io.emit('agent_status', agentState);

  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    agentState.status = 'idle';
    io.emit('agent_status', agentState);
    idleTimer = null;
  }, 2500);
}

// 1. Chokidar File System Watcher
const workspaceWatcher = chokidar.watch(WATCH_DIR, {
  ignored: /(^|[\/\\])\..|node_modules|dist|build|\.git/,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50
  }
});

workspaceWatcher
  .on('change', filePath => {
    const relPath = normalizeWorkspacePath(filePath);
    if (relPath) {
      io.emit('file_event', { path: relPath, type: 'WRITE' });
      markAgentWorking();
    }
  })
  .on('add', filePath => {
    const relPath = normalizeWorkspacePath(filePath);
    if (relPath) {
      io.emit('file_event', { path: relPath, type: 'WRITE' });
      io.emit('dir_tree', getDirTree(WATCH_DIR));
      markAgentWorking();
    }
  })
  .on('unlink', () => {
    io.emit('dir_tree', getDirTree(WATCH_DIR));
  });

// 2. AGY Transcript Log Watcher
const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
const fileOffsets = new Map();

function parseTranscriptLine(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch (e) {
    return;
  }

  if (!obj || typeof obj !== 'object') {
    return;
  }

  markAgentWorking();

  if (typeof obj.step_index === 'number') {
    agentState.stepCount = Math.max(agentState.stepCount, obj.step_index);
  } else {
    agentState.stepCount += 1;
  }

  const toolCalls = obj.tool_calls || obj.toolCalls || (obj.tool_call ? [obj.tool_call] : []);
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const name = call.name || call.toolName;
      const args = call.args || call.parameters || {};

      const pathArg = args.AbsolutePath || args.TargetFile || args.SearchPath || args.SearchDirectory || args.path || args.targetFile;
      if (!pathArg) continue;

      const normalized = normalizeWorkspacePath(pathArg);
      if (!normalized) continue;

      if (name === 'view_file' || name === 'grep_search') {
        io.emit('file_event', { path: normalized, type: 'READ' });
      } else if (name === 'write_to_file' || name === 'replace_file_content' || name === 'multi_replace_file_content') {
        io.emit('file_event', { path: normalized, type: 'WRITE' });
      }
    }
  }
}

function processTranscriptFile(logPath) {
  try {
    const stats = fs.statSync(logPath);
    const prevOffset = fileOffsets.get(logPath) || 0;
    
    let startOffset = prevOffset;
    if (stats.size < prevOffset) {
      startOffset = 0;
    }

    const stream = fs.createReadStream(logPath, {
      start: startOffset,
      encoding: 'utf-8'
    });

    let buffer = '';
    stream.on('data', chunk => {
      buffer += chunk;
    });

    stream.on('end', () => {
      fileOffsets.set(logPath, stats.size);
      const lines = buffer.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines) {
        parseTranscriptLine(line);
      }
    });
  } catch (err) {
    // ignore read errors
  }
}

if (fs.existsSync(BRAIN_DIR)) {
  const logWatcher = chokidar.watch(BRAIN_DIR, {
    depth: 5,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 20
    }
  });

  const isTranscriptFile = (filePath) => {
    return filePath.endsWith('transcript.jsonl') || filePath.endsWith('transcript_full.jsonl');
  };

  logWatcher
    .on('change', filePath => {
      if (isTranscriptFile(filePath)) {
        processTranscriptFile(filePath);
      }
    })
    .on('add', filePath => {
      if (isTranscriptFile(filePath)) {
        processTranscriptFile(filePath);
      }
    });
}

// 3. Socket Connections
io.on('connection', socket => {
  console.log('[Socket] Client connected:', socket.id);
  
  try {
    socket.emit('dir_tree', getDirTree(WATCH_DIR));
  } catch (e) {
    console.error('Error generating dir tree:', e);
  }
  socket.emit('agent_status', agentState);

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});

// 4. REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, watchDir: WATCH_DIR });
});

app.get('/api/watch_dir', (req, res) => {
  res.json({ watchDir: WATCH_DIR });
});

app.post('/api/watch_dir', (req, res) => {
  const { dir } = req.body || {};
  if (!dir || typeof dir !== 'string') {
    return res.status(400).json({ error: 'Missing target directory path' });
  }

  const targetPath = path.resolve(unquote(dir));
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    return res.status(400).json({ error: `Directory does not exist: ${targetPath}` });
  }

  WATCH_DIR = targetPath;
  console.log(`[Visualizer Backend] Switched WATCH_DIR to: ${WATCH_DIR}`);

  // Re-initialize watcher for new dir
  try {
    workspaceWatcher.unwatch();
    workspaceWatcher.add(WATCH_DIR);
  } catch (e) {
    console.error('Error updating chokidar watch dir:', e);
  }

  // Broadcast updated tree to all clients
  try {
    const newTree = getDirTree(WATCH_DIR);
    io.emit('dir_tree', newTree);
  } catch (e) {
    console.error('Error building new dir tree:', e);
  }

  return res.json({ success: true, watchDir: WATCH_DIR });
});

app.post('/api/mock/file_event', (req, res) => {
  const { path: rawPath, type } = req.body || {};
  if (!rawPath || !type) {
    return res.status(400).json({ error: 'Missing path or type' });
  }

  const normalized = normalizeWorkspacePath(rawPath) || unquote(rawPath);
  const event = { path: normalized, type: String(type).toUpperCase() };

  io.emit('file_event', event);
  markAgentWorking();

  return res.json({ success: true, event });
});

app.post('/api/mock/agent_status', (req, res) => {
  const { status, model, stepCount } = req.body || {};
  
  if (model) {
    agentState.model = model;
  }
  if (typeof stepCount === 'number') {
    agentState.stepCount = stepCount;
  }
  
  if (status === 'working') {
    markAgentWorking();
  } else if (status === 'idle') {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    agentState.status = 'idle';
    io.emit('agent_status', agentState);
  } else {
    io.emit('agent_status', agentState);
  }

  return res.json({ success: true, agentState });
});

server.listen(PORT, () => {
  console.log(`[Visualizer Backend] Running at http://localhost:${PORT}`);
  console.log(`[Visualizer Backend] Watching directory: ${WATCH_DIR}`);
});
