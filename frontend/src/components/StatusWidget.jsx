import React from 'react';
import { Cpu, Activity, Zap, CheckCircle2, PauseCircle, Sparkles } from 'lucide-react';

export default function StatusWidget({ agentStatus }) {
  const status = agentStatus?.status || 'idle';
  const model = agentStatus?.model || 'Gemini 3.6 Flash (High)';
  const stepCount = agentStatus?.stepCount ?? 0;

  const isWorking = status === 'working';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Mascot & Status Section */}
      <div className="flex items-center gap-4">
        {/* Animated Mascot Icon Container */}
        <div className="relative">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-500 ${
              isWorking
                ? 'bg-emerald-950/60 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800/80 border-slate-700 shadow-inner'
            }`}
          >
            {/* Mascot SVG Graphic */}
            <svg
              viewBox="0 0 64 64"
              className={`w-9 h-9 transition-transform duration-500 ${
                isWorking ? 'animate-bounce text-emerald-400' : 'text-slate-400 scale-95'
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Mascot Antenna */}
              <line x1="32" y1="12" x2="32" y2="4" />
              <circle
                cx="32"
                cy="4"
                r="3"
                className={isWorking ? 'fill-emerald-400 animate-ping' : 'fill-slate-500'}
              />
              {/* Mascot Head Body */}
              <rect x="14" y="12" width="36" height="32" rx="8" className="fill-slate-900/80" />
              {/* Mascot Screen / Visor */}
              <rect
                x="20"
                y="18"
                width="24"
                height="16"
                rx="4"
                className={isWorking ? 'fill-emerald-900/90 stroke-emerald-400' : 'fill-slate-800 stroke-slate-600'}
              />
              {/* Mascot Eyes */}
              {isWorking ? (
                <>
                  <circle cx="26" cy="26" r="2.5" className="fill-emerald-300 animate-pulse" />
                  <circle cx="38" cy="26" r="2.5" className="fill-emerald-300 animate-pulse" />
                </>
              ) : (
                <>
                  <line x1="24" y1="26" x2="28" y2="26" stroke="#94a3b8" />
                  <line x1="36" y1="26" x2="40" y2="26" stroke="#94a3b8" />
                </>
              )}
              {/* Mascot Mouth / Status line */}
              <line
                x1="28"
                y1="38"
                x2="36"
                y2="38"
                className={isWorking ? 'stroke-emerald-400' : 'stroke-slate-600'}
              />
            </svg>

            {/* Sparkles effect when working */}
            {isWorking && (
              <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-amber-400 animate-spin" />
            )}
          </div>

          {/* Status Badge Pulse Ring */}
          <span
            className={`absolute -bottom-1 -right-1 flex h-4 w-4 rounded-full ${
              isWorking ? 'bg-emerald-400' : 'bg-slate-600'
            }`}
          >
            {isWorking && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
          </span>
        </div>

        {/* Status Text & Status Badge */}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Agent Status
            </span>
            {isWorking ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-sm animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                WORKING
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <PauseCircle className="w-3.5 h-3.5" />
                IDLE
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-slate-200 mt-1 flex items-center gap-1.5">
            <Activity className={`w-4 h-4 ${isWorking ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            {isWorking ? 'Processing task instructions...' : 'Waiting for incoming prompt'}
          </div>
        </div>
      </div>

      {/* Model Info & Step Counter Metrics */}
      <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6 w-full md:w-auto justify-between md:justify-end">
        {/* Active Model Name */}
        <div className="flex items-center gap-2.5 bg-slate-950/60 border border-slate-800 rounded-lg px-3.5 py-2">
          <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Active Model</div>
            <div className="text-xs font-bold font-mono text-slate-100 truncate max-w-[180px]">{model}</div>
          </div>
        </div>

        {/* Session Activity Step Counter */}
        <div className="flex items-center gap-2.5 bg-slate-950/60 border border-slate-800 rounded-lg px-3.5 py-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Step Count</div>
            <div className="text-xs font-bold font-mono text-amber-400">{stepCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
