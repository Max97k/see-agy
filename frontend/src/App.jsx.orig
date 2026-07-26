import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Layers, Activity, Wifi, WifiOff, Terminal, Eye, Edit3 } from 'lucide-react';
import TreemapCanvas from './components/TreemapCanvas';
import StatusWidget from './components/StatusWidget';

function normalizePath(p) {
  if (!p) return '';
  return p.replace(/^\.\//, '').replace(/^\//, '');
}

export default function App() {
  const [dirTree, setDirTree] = useState(null);
  const [fileEventsMap, setFileEventsMap] = useState(() => new Map());
  const [recentEvents, setRecentEvents] = useState([]);
  const [agentStatus, setAgentStatus] = useState({
    status: 'idle',
    model: 'Gemini 3.6 Flash (High)',
    stepCount: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [watchDir, setWatchDir] = useState('');
  const [showDirModal, setShowDirModal] = useState(false);
  const [newDirInput, setNewDirInput] = useState('');
  const [switchLoading, setSwitchLoading] = useState(false);

  const apiHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const API_BASE = `http://${apiHost}:3005`;

  // Fetch current watchDir on load
  useEffect(() => {
    fetch(`${API_BASE}/api/watch_dir`)
      .then((res) => res.json())
      .then((data) => {
        if (data.watchDir) setWatchDir(data.watchDir);
      })
      .catch(() => {});
  }, [API_BASE]);

  const handleSwitchDir = async (e) => {
    e.preventDefault();
    if (!newDirInput.trim()) return;
    setSwitchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/watch_dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: newDirInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.watchDir) {
        setWatchDir(data.watchDir);
        setShowDirModal(false);
        setNewDirInput('');
      } else {
        alert(data.error || 'Failed to switch directory');
      }
    } catch (err) {
      alert('Error connecting to backend API');
    } finally {
      setSwitchLoading(false);
    }
  };

  useEffect(() => {
    const socketUrl =
      window.location.hostname
        ? `http://${window.location.hostname}:3005`
        : 'http://localhost:3005';

    const socket = io(socketUrl, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket.io] Connected to backend on', socketUrl);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.io] Disconnected from backend');
      setIsConnected(false);
    });

    socket.on('dir_tree', (tree) => {
      console.log('[Socket.io] Received dir_tree:', tree);
      setDirTree(tree);
      // Fetch latest watchDir when tree updates
      fetch(`${API_BASE}/api/watch_dir`)
        .then((res) => res.json())
        .then((data) => {
          if (data.watchDir) setWatchDir(data.watchDir);
        })
        .catch(() => {});
    });

    socket.on('file_event', (event) => {
      console.log('[Socket.io] Received file_event:', event);
      if (!event || !event.path) return;

      const normPath = normalizePath(event.path);
      const timestamp = Date.now();

      setFileEventsMap((prevMap) => {
        const nextMap = new Map(prevMap);
        nextMap.set(normPath, {
          type: event.type || 'WRITE',
          timestamp,
        });
        return nextMap;
      });

      setRecentEvents((prevEvents) => [
        { id: timestamp + Math.random(), path: normPath, type: event.type || 'WRITE', time: new Date().toLocaleTimeString() },
        ...prevEvents.slice(0, 49),
      ]);
    });

    socket.on('agent_status', (statusData) => {
      console.log('[Socket.io] Received agent_status:', statusData);
      if (statusData) {
        setAgentStatus(statusData);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Header Bar */}
      <header className="h-16 bg-slate-900/80 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-sky-600 to-indigo-600 rounded-lg shadow-lg shadow-sky-500/20">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              AGY CLI Visualizer Dashboard
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">Real-time Workspace Activity & State Monitor</p>
          </div>
        </div>

        {/* Workspace Directory Selector */}
        <div className="hidden md:flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono max-w-xs lg:max-w-md truncate">
          <span className="text-slate-500 font-sans font-medium">Repo:</span>
          <span className="text-sky-300 font-semibold truncate" title={watchDir || 'Default'}>
            {watchDir || '/home/kuo/see-agy'}
          </span>
          <button
            onClick={() => {
              setNewDirInput(watchDir);
              setShowDirModal(true);
            }}
            className="ml-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-700 transition"
          >
            Change
          </button>
        </div>

        {/* Legend & Socket Connection Status */}
        <div className="flex items-center gap-4">
          {/* Decay Color Legend */}
          <div className="hidden sm:flex items-center gap-4 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-orange-500 shadow-sm shadow-orange-500/50" />
              <span className="text-slate-300">WRITE (1.5s Decay)</span>
            </div>
            <div className="w-px h-3 bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-sky-400 shadow-sm shadow-sky-400/50" />
              <span className="text-slate-300">READ (1.5s Decay)</span>
            </div>
          </div>

          {/* Connection Status Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>LIVE STREAM</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>OFFLINE</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Switch Directory Modal */}
      {showDirModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Switch Repository / Directory</h3>
            <p className="text-xs text-slate-400 mb-4">Enter absolute path of any project directory on your system to monitor.</p>
            <form onSubmit={handleSwitchDir} className="space-y-4">
              <input
                type="text"
                value={newDirInput}
                onChange={(e) => setNewDirInput(e.target.value)}
                placeholder="/home/user/my-project"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDirModal(false)}
                  className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={switchLoading}
                  className="px-4 py-2 text-xs font-medium bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg transition shadow-md shadow-sky-600/20 disabled:opacity-50"
                >
                  {switchLoading ? 'Switching...' : 'Switch Directory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <main className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-hidden min-h-0">
        {/* Agent Status Widget */}
        <StatusWidget agentStatus={agentStatus} />

        {/* Workspace Treemap Matrix & Stream Feed Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0 overflow-hidden">
          {/* Treemap Canvas Container (3 Cols on Desktop) */}
          <div className="lg:col-span-3 flex flex-col h-full min-h-[350px]">
            <div className="flex items-center justify-between pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                Workspace Matrix Treemap
              </span>
              {dirTree && (
                <span className="font-mono text-slate-500">Root: {dirTree.name || 'Workspace'}</span>
              )}
            </div>

            <div className="flex-1 relative">
              {dirTree ? (
                <TreemapCanvas dirTree={dirTree} fileEventsMap={fileEventsMap} />
              ) : (
                <div className="w-full h-full bg-slate-900/50 border border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-500 space-y-2">
                  <Activity className="w-8 h-8 animate-spin text-sky-400" />
                  <p className="text-sm font-medium">Connecting to directory stream...</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Event Stream Ticker (1 Col on Desktop) */}
          <div className="hidden lg:flex flex-col h-full bg-slate-900/80 border border-slate-800 rounded-lg p-3 overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                Live Event Stream
              </span>
              <span className="font-mono text-slate-500 text-[10px]">{recentEvents.length} events</span>
            </div>

            <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 font-mono text-[11px]">
              {recentEvents.length === 0 ? (
                <div className="text-slate-600 text-center py-8 text-xs italic">
                  No file events detected yet
                </div>
              ) : (
                recentEvents.map((ev, idx) => (
                  <div
                    key={`ev-${idx}-${ev.timestamp}`}
                    className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {ev.type === 'WRITE' ? (
                        <Edit3 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                      <span className="truncate text-slate-300">{ev.path}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        ev.type === 'WRITE'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-sky-500/20 text-sky-400'
                      }`}
                    >
                      {ev.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
