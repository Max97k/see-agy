import React, { useRef, useEffect, useState, useMemo, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { FileCode, Folder, Clock, HardDrive } from 'lucide-react';

/**
 * Normalizes relative file paths for consistent lookup.
 */
function normalizePath(p) {
  if (!p) return '';
  return p.replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * Format bytes into human readable format.
 */
function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function TreemapCanvas({ dirTree, fileEventsMap }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null); // Ref for direct DOM manipulation of tooltip
  const mousePosRef = useRef({ x: -9999, y: -9999 }); // Track latest mouse position for initial render
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);

  // Handle ResizeObserver for dynamic canvas sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute D3 Treemap layout
  const { rootNode, leaves, directories } = useMemo(() => {
    if (!dirTree || !dirTree.name) {
      return { rootNode: null, leaves: [], directories: [] };
    }

    const width = Math.max(100, dimensions.width);
    const height = Math.max(100, dimensions.height);

    // Build hierarchy with sum on file size (or fallback so all files take space)
    const root = d3.hierarchy(dirTree)
      .sum((d) => (d.children ? 0 : (d.size && d.size > 0 ? d.size : 200)))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Layout configuration with outer padding and top padding for dir headers
    const layout = d3.treemap()
      .tile(d3.treemapSquarify)
      .size([width, height])
      .paddingOuter(4)
      .paddingTop((d) => (d.depth > 0 ? 20 : 24))
      .paddingInner(2);

    layout(root);

    const descendants = root.descendants();
    const leavesList = root.leaves();
    const dirsList = descendants.filter((d) => d.children && d.depth >= 0);

    return { rootNode: root, leaves: leavesList, directories: dirsList };
  }, [dirTree, dimensions]);

  // Ref to hold latest events without triggering hook re-run
  const fileEventsMapRef = useRef(fileEventsMap);
  useEffect(() => {
    fileEventsMapRef.current = fileEventsMap;
  }, [fileEventsMap]);

  // Canvas 60fps Rendering Loop with 1.5s Linear Decay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;

    const render = () => {
      const { width, height } = dimensions;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();

      // Render directories background / borders
      for (const dir of directories) {
        const dx = dir.x0;
        const dy = dir.y0;
        const dw = dir.x1 - dir.x0;
        const dh = dir.y1 - dir.y0;

        if (dw <= 0 || dh <= 0) continue;

        ctx.fillStyle = dir.depth === 0 ? 'rgba(15, 23, 42, 0.9)' : 'rgba(30, 41, 59, 0.4)';
        ctx.fillRect(dx, dy, dw, dh);

        ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)'; // slate-700
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, dw, dh);
      }

      // Render file leaf nodes and active decay highlights
      for (const leaf of leaves) {
        const lx = leaf.x0;
        const ly = leaf.y0;
        const lw = leaf.x1 - leaf.x0;
        const lh = leaf.y1 - leaf.y0;

        if (lw <= 0 || lh <= 0) continue;

        // Base file rectangle
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(lx, ly, lw, lh);

        ctx.strokeStyle = '#334155'; // slate-700
        ctx.lineWidth = 1;
        ctx.strokeRect(lx, ly, lw, lh);

        // Event Decay Highlight
        const normPath = normalizePath(leaf.data.path);
        const latestEventsMap = fileEventsMapRef.current;
        const eventData = latestEventsMap ? latestEventsMap.get(normPath) : null;

        if (eventData) {
          const elapsed = now - eventData.timestamp;
          const intensity = Math.max(0, 1.0 - elapsed / 1500);

          if (intensity > 0) {
            if (eventData.type === 'WRITE') {
              // Orange #F97316
              ctx.fillStyle = `rgba(249, 115, 22, ${intensity * 0.7})`;
              ctx.fillRect(lx, ly, lw, lh);

              ctx.strokeStyle = `rgba(249, 115, 22, ${intensity})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(lx, ly, lw, lh);
            } else {
              // READ: Blue #38BDF8
              ctx.fillStyle = `rgba(56, 189, 248, ${intensity * 0.7})`;
              ctx.fillRect(lx, ly, lw, lh);

              ctx.strokeStyle = `rgba(56, 189, 248, ${intensity})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(lx, ly, lw, lh);
            }
          }
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [dimensions, leaves, directories]); // Removed fileEventsMap

  // Apply initial position when tooltip mounts or node changes
  useLayoutEffect(() => {
    if (hoveredNode && tooltipRef.current) {
      tooltipRef.current.style.left = `${mousePosRef.current.x}px`;
      tooltipRef.current.style.top = `${mousePosRef.current.y - 8}px`;
    }
  }, [hoveredNode]);

  // Handle Mouse Hover on Canvas area
  const handleMouseMove = (e) => {
    if (!containerRef.current || !leaves.length) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    mousePosRef.current = { x: e.clientX, y: e.clientY };

    // Directly mutate tooltip DOM style instead of state to prevent re-renders
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX}px`;
      tooltipRef.current.style.top = `${e.clientY - 8}px`;
    }

    // Find leaf under mouse
    const found = leaves.find(
      (leaf) => mouseX >= leaf.x0 && mouseX <= leaf.x1 && mouseY >= leaf.y0 && mouseY <= leaf.y1
    );

    if (found) {
      setHoveredNode(prev => prev === found ? prev : found); // Functional update to bail out early
    } else {
      // Check if mouse is over a directory header
      const foundDir = directories.find(
        (d) => mouseX >= d.x0 && mouseX <= d.x1 && mouseY >= d.y0 && mouseY <= d.y1
      );
      setHoveredNode(prev => prev === (foundDir || null) ? prev : (foundDir || null));
    }
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-2xl select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* HTML5 60fps Canvas for Treemap Decay Rendering */}
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="absolute inset-0 pointer-events-none"
      />

      {/* SVG / HTML Overlay for Directory Labels & File Names */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Render Directory Headers */}
        {directories.map((dir, idx) => {
          const w = dir.x1 - dir.x0;
          const h = dir.y1 - dir.y0;
          const headerHeight = dir.depth === 0 ? 24 : 20;

          if (w < 40 || h < 20) return null;

          return (
            <div
              key={`dir-${idx}-${dir.data.path || dir.data.name}`}
              className="absolute px-2 py-0.5 text-xs font-semibold text-slate-300 truncate flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50"
              style={{
                left: `${dir.x0}px`,
                top: `${dir.y0}px`,
                width: `${w}px`,
                height: `${headerHeight}px`,
              }}
            >
              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{dir.data.name}</span>
            </div>
          );
        })}

        {/* Render File Labels inside Leaf Nodes */}
        {leaves.map((leaf, idx) => {
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;

          // Only render text label if block is big enough
          if (w < 35 || h < 16) return null;

          const normPath = normalizePath(leaf.data.path);
          const eventData = fileEventsMap ? fileEventsMap.get(normPath) : null;
          const isRecentlyActive = eventData && (Date.now() - eventData.timestamp < 1500);

          return (
            <div
              key={`file-${idx}-${leaf.data.path || leaf.data.name}`}
              className={`absolute px-1.5 py-1 text-[11px] font-mono leading-tight flex items-center gap-1 truncate transition-colors duration-150 ${
                isRecentlyActive ? 'text-white font-bold' : 'text-slate-400'
              }`}
              style={{
                left: `${leaf.x0}px`,
                top: `${leaf.y0}px`,
                width: `${w}px`,
                height: `${h}px`,
              }}
            >
              <FileCode className="w-3 h-3 text-sky-400 shrink-0 opacity-70" />
              <span className="truncate">{leaf.data.name}</span>
            </div>
          );
        })}
      </div>

      {/* Interactive Tooltip Overlay */}
      {hoveredNode && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none bg-slate-900/95 text-slate-100 border border-slate-700 rounded-md p-2.5 shadow-xl text-xs backdrop-blur-md max-w-xs space-y-1.5 transform -translate-x-1/2 -translate-y-full mb-2"
        >
          <div className="flex items-center gap-1.5 font-semibold text-sky-400 border-b border-slate-800 pb-1">
            {hoveredNode.children ? (
              <Folder className="w-4 h-4 text-amber-400" />
            ) : (
              <FileCode className="w-4 h-4 text-sky-400" />
            )}
            <span className="truncate">{hoveredNode.data.name}</span>
          </div>

          <div className="space-y-1 font-mono text-[11px] text-slate-300">
            <div className="flex items-center gap-1 text-slate-400">
              <HardDrive className="w-3 h-3" />
              <span className="truncate">{hoveredNode.data.path || hoveredNode.data.name}</span>
            </div>

            {!hoveredNode.children && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Size:</span>
                <span className="text-slate-200">{formatBytes(hoveredNode.data.size)}</span>
              </div>
            )}

            {/* Last event activity */}
            {(() => {
              const normPath = normalizePath(hoveredNode.data.path);
              const ev = fileEventsMap ? fileEventsMap.get(normPath) : null;
              if (!ev) {
                return (
                  <div className="flex items-center gap-1 text-slate-500 pt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>No recent activity</span>
                  </div>
                );
              }
              const secAgo = ((Date.now() - ev.timestamp) / 1000).toFixed(1);
              return (
                <div className="flex items-center justify-between pt-0.5">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>Last Event:</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      ev.type === 'WRITE'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                        : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    }`}
                  >
                    {ev.type} ({secAgo}s ago)
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
