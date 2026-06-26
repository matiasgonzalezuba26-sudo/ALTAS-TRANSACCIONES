import React, { useState, useMemo, useEffect, useRef } from "react";
import { AMLNode, AMLEdge } from "../types";
import { ZoomIn, ZoomOut, RotateCcw, Users, ArrowRightLeft, ChevronDown, ChevronUp } from "lucide-react";

interface NetworkGraphProps {
  nodes: AMLNode[];
  edges: AMLEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  cuitDenominacionesMap?: Record<string, string>;
  currentCuit: string | null;
  commonCounterparts?: string[];
}

interface GroupNode {
  id: string;
  label: string;
  members: AMLNode[];
  totalVolume: number;
}

interface RenderNode {
  id: string;
  x: number;
  y: number;
  isGroup: boolean;
  group?: GroupNode;
  node?: AMLNode;
  radius: number;
}

const COUNTERPART_LIMIT = 9;
const COUNTERPART_TOP = 4;
const ANALYZED_LIMIT = 6;

function wrapText(text: string, maxLen = 14): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxLen) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w.slice(0, maxLen); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text.slice(0, maxLen)];
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}

export default function NetworkGraph({
  nodes, edges, selectedNodeId, onSelectNode,
  cuitDenominacionesMap, currentCuit, commonCounterparts = []
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const isLargeNetwork = nodes.length > 6;

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => setDimensions({ width: containerRef.current?.clientWidth || 800, height: 520 });
    update();
    const obs = new ResizeObserver(update);
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const nodeVolumes = useMemo(() => {
    const v: Record<string, number> = {};
    nodes.forEach(n => { v[n.id] = 0; });
    edges.forEach(e => {
      if (v[e.source] !== undefined) v[e.source] += e.amount_ars;
      if (v[e.target] !== undefined) v[e.target] += e.amount_ars;
    });
    return v;
  }, [nodes, edges]);

  const { analyzedVisible, analyzedGroup, visibleSources, visibleTargets, commonNodes, groupNodes } = useMemo(() => {
    const byVol = (a: AMLNode, b: AMLNode) => (nodeVolumes[b.id] || 0) - (nodeVolumes[a.id] || 0);

    const analyzed = nodes.filter(n => n.type === "ANALIZADO").sort(byVol);
    const common = nodes.filter(n => commonCounterparts.includes(n.id));
    const counterparts = nodes.filter(n => n.type === "CONTRAPARTE" && !commonCounterparts.includes(n.id));

    // Classify counterparts by flow direction
    const sources = counterparts.filter(c => edges.some(e => e.source === c.id) && !edges.some(e => e.target === c.id)).sort(byVol);
    const targets = counterparts.filter(c => !sources.find(s => s.id === c.id)).sort(byVol);

    const groups: GroupNode[] = [];

    // Group analyzed nodes if > ANALYZED_LIMIT
    let visAnalyzed = analyzed;
    let analGroup: GroupNode | null = null;
    if (analyzed.length > ANALYZED_LIMIT) {
      visAnalyzed = analyzed.slice(0, ANALYZED_LIMIT);
      const rest = analyzed.slice(ANALYZED_LIMIT);
      analGroup = {
        id: "__group_analyzed__",
        label: `${rest.length} Sujetos Analizados`,
        members: rest,
        totalVolume: rest.reduce((s, n) => s + (nodeVolumes[n.id] || 0), 0)
      };
      groups.push(analGroup);
    }

    // Group source counterparts if > COUNTERPART_LIMIT
    let visSrc = sources;
    if (sources.length > COUNTERPART_LIMIT) {
      visSrc = sources.slice(0, COUNTERPART_TOP);
      const rest = sources.slice(COUNTERPART_TOP);
      groups.push({ id: "__group_src__", label: `${rest.length} contrapartes menores`, members: rest, totalVolume: rest.reduce((s, n) => s + (nodeVolumes[n.id] || 0), 0) });
    }

    // Group target counterparts if > COUNTERPART_LIMIT
    let visTgt = targets;
    if (targets.length > COUNTERPART_LIMIT) {
      visTgt = targets.slice(0, COUNTERPART_TOP);
      const rest = targets.slice(COUNTERPART_TOP);
      groups.push({ id: "__group_tgt__", label: `${rest.length} contrapartes menores`, members: rest, totalVolume: rest.reduce((s, n) => s + (nodeVolumes[n.id] || 0), 0) });
    }

    return { analyzedVisible: visAnalyzed, analyzedGroup: analGroup, visibleSources: visSrc, visibleTargets: visTgt, commonNodes: common, groupNodes: groups };
  }, [nodes, edges, commonCounterparts, nodeVolumes]);

  const renderNodes = useMemo(() => {
    const { width, height } = dimensions;
    const result: RenderNode[] = [];
    const mX = 80, mY = 70;

    const row = (list: AMLNode[], y: number, r: number, xFrom = mX, xTo = width - mX) => {
      list.forEach((n, i) => {
        const cnt = list.length;
        result.push({ id: n.id, x: cnt > 1 ? xFrom + (i * (xTo - xFrom)) / (cnt - 1) : (xFrom + xTo) / 2, y, isGroup: false, node: n, radius: r });
      });
    };

    const col = (list: AMLNode[], x: number, r: number) => {
      list.forEach((n, i) => {
        const cnt = list.length;
        result.push({ id: n.id, x, y: cnt > 1 ? mY + (i * (height - mY * 2)) / (cnt - 1) : height / 2, isGroup: false, node: n, radius: r });
      });
    };

    const addGroup = (g: GroupNode, x: number, y: number) =>
      result.push({ id: g.id, x, y, isGroup: true, group: g, radius: 24 });

    if (!isLargeNetwork) {
      // ── SMALL: Left / Center / Right ──
      col(visibleSources, width * 0.13, 18);
      const sg = groupNodes.find(g => g.id === "__group_src__");
      if (sg) addGroup(sg, width * 0.13, mY + visibleSources.length * 45 + 40);

      // Analyzed center
      const analXTo = commonNodes.length > 0 ? width * 0.65 : width * 0.87;
      analyzedVisible.forEach((n, i) => {
        const cnt = analyzedVisible.length;
        result.push({ id: n.id, x: cnt > 1 ? mX + (i * (analXTo - mX * 2.5)) / (cnt - 1) : width * 0.5, y: height / 2, isGroup: false, node: n, radius: 30 });
      });
      const ag = groupNodes.find(g => g.id === "__group_analyzed__");
      if (ag) addGroup(ag, analXTo - 20, height / 2);

      // Common counterparts
      commonNodes.forEach((n, i) => {
        result.push({ id: n.id, x: width * 0.78 + i * 40, y: height / 2, isGroup: false, node: n, radius: 22 });
      });

      col(visibleTargets, width * 0.87, 18);
      const tg = groupNodes.find(g => g.id === "__group_tgt__");
      if (tg) addGroup(tg, width * 0.87, mY + visibleTargets.length * 45 + 40);

    } else {
      // ── LARGE: Top / Center / Bottom ──
      const topY = mY;
      const centerY = height / 2;
      const bottomY = height - mY;

      // Sources top row
      row(visibleSources, topY, 18);
      const sg = groupNodes.find(g => g.id === "__group_src__");
      if (sg) {
        const lastSrcX = visibleSources.length > 0
          ? mX + (visibleSources.length * (width - mX * 2)) / Math.max(visibleSources.length, 1)
          : width - mX - 60;
        addGroup(sg, Math.min(lastSrcX, width - mX - 30), topY);
      }

      // Analyzed center — leave room for common on the right
      const analXMax = commonNodes.length > 0 ? width * 0.72 : width - mX;
      analyzedVisible.forEach((n, i) => {
        const cnt = analyzedVisible.length;
        result.push({ id: n.id, x: cnt > 1 ? mX + (i * (analXMax - mX)) / (cnt - 1) : width * 0.4, y: centerY, isGroup: false, node: n, radius: 30 });
      });

      // Analyzed group node — right of the last analyzed node
      const ag = groupNodes.find(g => g.id === "__group_analyzed__");
      if (ag) {
        const lastAnalX = analyzedVisible.length > 0
          ? mX + ((analyzedVisible.length - 1) * (analXMax - mX)) / Math.max(analyzedVisible.length - 1, 1)
          : analXMax;
        addGroup(ag, Math.min(lastAnalX + 70, analXMax + 60), centerY);
      }

      // Common counterparts — right side at center level
      commonNodes.forEach((n, i) => {
        result.push({ id: n.id, x: width - mX - i * 55, y: centerY, isGroup: false, node: n, radius: 22 });
      });

      // Targets bottom row
      row(visibleTargets, bottomY, 18);
      const tg = groupNodes.find(g => g.id === "__group_tgt__");
      if (tg) {
        const lastTgtX = visibleTargets.length > 0
          ? mX + (visibleTargets.length * (width - mX * 2)) / Math.max(visibleTargets.length, 1)
          : width - mX - 60;
        addGroup(tg, Math.min(lastTgtX, width - mX - 30), bottomY);
      }
    }

    // Fallback for unplaced nodes — skip members that are inside a group
    const groupedMemberIds = new Set(groupNodes.flatMap(g => g.members.map(m => m.id)));
    nodes.forEach(n => {
      if (!result.find(r => r.id === n.id) && !groupedMemberIds.has(n.id))
        result.push({ id: n.id, x: dimensions.width / 2, y: dimensions.height / 2, isGroup: false, node: n, radius: 18 });
    });

    return result;
  }, [nodes, analyzedVisible, visibleSources, visibleTargets, commonNodes, groupNodes, dimensions, isLargeNetwork]);

  const groupMemberMap = useMemo(() => {
    const m: Record<string, string> = {};
    groupNodes.forEach(g => g.members.forEach(mb => { m[mb.id] = g.id; }));
    return m;
  }, [groupNodes]);

  const resolveId = (id: string) => groupMemberMap[id] || id;

  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number; r: number }> = {};
    renderNodes.forEach(rn => { m[rn.id] = { x: draggedPositions[rn.id]?.x ?? rn.x, y: draggedPositions[rn.id]?.y ?? rn.y, r: rn.radius }; });
    groupNodes.forEach(g => { g.members.forEach(mb => { if (!m[mb.id] && m[g.id]) m[mb.id] = m[g.id]; }); });
    return m;
  }, [renderNodes, draggedPositions, groupNodes]);

  const getNodeColor = (node: AMLNode, isCommon: boolean) => {
    if (node.type === "ANALIZADO") {
      if (node.risk_level === "ALTO") return { fill: "#fee2e2", stroke: "#ef4444" };
      if (node.risk_level === "MEDIO") return { fill: "#fef3c7", stroke: "#f59e0b" };
      return { fill: "#d1fae5", stroke: "#10b981" };
    }
    if (isCommon) return { fill: "#dbeafe", stroke: "#3b82f6" };
    const sends = edges.some(e => e.source === node.id);
    const receives = edges.some(e => e.target === node.id);
    if (sends && receives) return { fill: "#fef9c3", stroke: "#ea580c" };
    if (sends) return { fill: "#d1fae5", stroke: "#22c55e" };
    return { fill: "#ffedd5", stroke: "#f97316" };
  };

  const getEdgeStyle = (edge: AMLEdge) => {
    const srcRn = renderNodes.find(r => r.id === resolveId(edge.source));
    const tgtRn = renderNodes.find(r => r.id === resolveId(edge.target));
    if (srcRn?.node?.type === "ANALIZADO" || srcRn?.group?.id === "__group_analyzed__") return { color: "#f97316", arrow: "arrow-orange" };
    if (tgtRn?.node?.type === "ANALIZADO" || tgtRn?.group?.id === "__group_analyzed__") return { color: "#22c55e", arrow: "arrow-green" };
    return { color: "#94a3b8", arrow: "arrow-default" };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (["circle", "text", "tspan"].includes(tag)) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDraggedPositions(prev => ({ ...prev, [draggedNodeId]: { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom } }));
    } else if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => { setIsDragging(false); setDraggedNodeId(null); };

  const legendItems = [
    ["#fee2e2", "#ef4444", "Sujeto Analizado"],
    ["#dbeafe", "#3b82f6", "Contraparte Común"],
    ["#d1fae5", "#22c55e", "Envía al Sujeto"],
    ["#ffedd5", "#f97316", "Recibe del Sujeto"],
    ["#fef9c3", "#ea580c", "Envía y Recibe"],
  ];

  return (
    <div id="network-sec" className="w-full">
      <div className="w-full border border-zinc-200 bg-zinc-50 rounded-xl overflow-hidden relative shadow-inner">

        {/* Header */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-sm border border-zinc-200 text-xs px-3 py-1.5 rounded-full font-medium text-zinc-700 shadow-sm flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            <span>{nodes.length} Nodos</span>
            <span className="text-zinc-300">|</span>
            <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500" />
            <span>{edges.length} Relaciones</span>
            {isLargeNetwork && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">RED GRANDE</span>}
          </div>
        </div>

        {/* Controls */}
        <div className="absolute top-3 right-3 z-10 flex gap-1.5">
          <button onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))} className="p-1.5 bg-white/95 hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))} className="p-1.5 bg-white/95 hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setDraggedPositions({}); onSelectNode(null); }} className="p-1.5 bg-white/95 hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer"><RotateCcw className="w-4 h-4" /></button>
        </div>

        {/* Legend — collapsible bottom-left */}
        <div className="absolute bottom-3 left-3 z-10">
          <button
            onClick={() => setLegendOpen(o => !o)}
            className="flex items-center gap-1.5 bg-white/95 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-zinc-600 shadow-sm hover:bg-zinc-50 transition cursor-pointer"
          >
            Referencias {legendOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
          {legendOpen && (
            <div className="mt-1 bg-white/95 backdrop-blur-sm border border-zinc-200 p-2.5 rounded-lg shadow-md flex flex-col gap-1.5">
              {legendItems.map(([fill, stroke, label]) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-700">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 inline-block" style={{ backgroundColor: fill, border: `2px solid ${stroke}` }} />
                  <span>{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-700">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-zinc-100" style={{ border: "2px dashed #94a3b8" }} />
                Grupo — click para expandir
              </div>
            </div>
          )}
        </div>

        {/* Expanded group panel */}
        {expandedGroup && (() => {
          const g = groupNodes.find(gn => gn.id === expandedGroup);
          if (!g) return null;
          return (
            <div className="absolute top-14 left-3 z-20 bg-white border border-zinc-200 rounded-xl shadow-xl p-3 w-60 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-600">{g.label}</span>
                <button onClick={() => setExpandedGroup(null)} className="text-zinc-400 hover:text-zinc-700 font-bold text-xs">✕</button>
              </div>
              <div className="text-[10px] text-zinc-500 mb-2">Total: <span className="font-bold text-zinc-800">${g.totalVolume.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span></div>
              <ul className="space-y-1.5">
                {g.members.map(mb => (
                  <li key={mb.id} className="border-b border-zinc-100 pb-1 last:border-0">
                    <div className="font-bold text-zinc-800 text-[10px]">{cuitDenominacionesMap?.[mb.id] || mb.label}</div>
                    <div className="font-mono text-[9px] text-zinc-400">CUIT {mb.id}</div>
                    <div className="text-[9px] text-zinc-500">${(nodeVolumes[mb.id] || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Canvas */}
        <div ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          className={`h-[520px] select-none ${isDragging || draggedNodeId ? "cursor-grabbing" : "cursor-grab"}`}>
          <svg width="100%" height="100%" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e9ecef" strokeWidth="0.8" />
              </pattern>
              {(["default:#b4b4b8", "selected:#18181b", "green:#22c55e", "orange:#f97316"] as string[]).map(entry => {
                const [id, color] = entry.split(":");
                return (
                  <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill={color} />
                  </marker>
                );
              })}
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

              {/* Edges */}
              {edges.map(edge => {
                const srcId = resolveId(edge.source);
                const tgtId = resolveId(edge.target);
                if (srcId === tgtId) return null;
                const sp = posMap[srcId];
                const tp = posMap[tgtId];
                if (!sp || !tp) return null;

                const isHighlit = !!(selectedNodeId && (resolveId(edge.source) === selectedNodeId || resolveId(edge.target) === selectedNodeId || edge.source === selectedNodeId || edge.target === selectedNodeId));
                const isRelated = !selectedNodeId || isHighlit;
                const { color, arrow } = getEdgeStyle(edge);

                const dx = tp.x - sp.x, dy = tp.y - sp.y;
                const dr = Math.sqrt(dx * dx + dy * dy) || 1;
                const sx = sp.x + (dx / dr) * (sp.r + 2), sy = sp.y + (dy / dr) * (sp.r + 2);
                const tx = tp.x - (dx / dr) * (tp.r + 8), ty = tp.y - (dy / dr) * (tp.r + 8);
                const curve = dr * 1.3;
                const pathD = `M${sx},${sy}A${curve},${curve} 0 0,1 ${tx},${ty}`;
                const rev = sp.x > tp.x;
                const textPathD = `M${rev ? tx : sx},${rev ? ty : sy}A${curve},${curve} 0 0,${rev ? "0" : "1"} ${rev ? sx : tx},${rev ? sy : ty}`;
                const tpId = `tp-${edge.id}`;

                return (
                  <g key={edge.id} style={{ opacity: isRelated ? 1 : 0.25 }} className="transition-opacity duration-200">
                    <path d={pathD} fill="none" stroke={color} strokeWidth={isHighlit ? 3.5 : 2} markerEnd={`url(#${isHighlit ? "arrow-selected" : arrow})`} />
                    <path id={tpId} d={textPathD} fill="none" stroke="transparent" className="pointer-events-none" />
                    <text dy="-4" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" fontSize="9" fontWeight="900" className="pointer-events-none select-none">
                      <textPath href={`#${tpId}`} startOffset="50%" textAnchor="middle">{formatK(edge.amount_ars)}</textPath>
                    </text>
                    <text dy="-4" fill={color} fontSize="9" fontWeight="700" className="pointer-events-none select-none">
                      <textPath href={`#${tpId}`} startOffset="50%" textAnchor="middle">{formatK(edge.amount_ars)}</textPath>
                    </text>
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth="10" className="cursor-pointer"
                      onClick={e => { e.stopPropagation(); onSelectNode(edge.source); }}>
                      <title>{`${edge.source} → ${edge.target}: $${edge.amount_ars.toLocaleString("es-AR")}`}</title>
                    </path>
                  </g>
                );
              })}

              {/* Nodes */}
              {renderNodes.map(rn => {
                const cx = draggedPositions[rn.id]?.x ?? rn.x;
                const cy = draggedPositions[rn.id]?.y ?? rn.y;
                const isSelected = selectedNodeId === rn.id;

                // Group node
                if (rn.isGroup && rn.group) {
                  const g = rn.group;
                  const isAnalyzedGroup = g.id === "__group_analyzed__";
                  return (
                    <g key={rn.id} transform={`translate(${cx}, ${cy})`} className="cursor-pointer"
                      onClick={e => { e.stopPropagation(); setExpandedGroup(expandedGroup === g.id ? null : g.id); }}
                    onMouseDown={e => { e.stopPropagation(); setDraggedNodeId(rn.id); }}>
                      <circle r={rn.radius} fill={isAnalyzedGroup ? "#fee2e2" : "#f1f5f9"}
                        stroke={isAnalyzedGroup ? "#ef4444" : "#94a3b8"}
                        strokeWidth="1.5" strokeDasharray="5,3"
                        className="hover:opacity-80 transition-all" />
                      <text textAnchor="middle" dy="4" fontSize="11" fontWeight="800"
                        fill={isAnalyzedGroup ? "#ef4444" : "#64748b"} className="pointer-events-none select-none">
                        {g.members.length}
                      </text>
                      <g transform={`translate(0, ${rn.radius + 12})`} className="pointer-events-none select-none">
                        <text textAnchor="middle" fontSize="8" fontWeight="700" fill={isAnalyzedGroup ? "#ef4444" : "#64748b"}>{g.label}</text>
                        <text textAnchor="middle" y="11" fontSize="8" fill="#94a3b8">{formatK(g.totalVolume)}</text>
                        <text textAnchor="middle" y="21" fontSize="8" fill="#3b82f6">▼ ver detalle</text>
                      </g>
                    </g>
                  );
                }

                if (!rn.node) return null;
                const isCommon = commonCounterparts.includes(rn.id);
                const isSubject = rn.node.type === "ANALIZADO";
                const { fill, stroke } = getNodeColor(rn.node, isCommon);
                const name = cuitDenominacionesMap?.[rn.id] || rn.node.label || (isSubject ? "Sujeto" : "Contraparte");
                const lines = wrapText(name, isSubject ? 14 : 12);

                return (
                  <g key={rn.id} transform={`translate(${cx}, ${cy})`} className="cursor-pointer"
                    onClick={e => { e.stopPropagation(); onSelectNode(isSelected ? null : rn.id); }}
                    onMouseDown={e => { e.stopPropagation(); setDraggedNodeId(rn.id); }}>
                    {isSelected && (
                      <circle r={rn.radius + 6} fill="none" stroke="#71717a" strokeWidth="1.5" strokeDasharray="4,2"
                        className="animate-spin" style={{ animationDuration: "12s" }} />
                    )}
                    <circle r={rn.radius} fill={fill} stroke={stroke}
                      strokeWidth={isSubject ? 2.5 : 1.5}
                      className="transition-all duration-150 hover:scale-110" />
                    <g transform={`translate(0, ${rn.radius + 11})`} className="pointer-events-none select-none">
                      <text textAnchor="middle" fontSize={isSubject ? 9.5 : 8} fontWeight={isSubject ? "800" : "600"} fill="#18181b">
                        {lines.map((line, i) => <tspan key={i} x="0" dy={i === 0 ? 0 : 9}>{line}</tspan>)}
                      </text>
                      <text textAnchor="middle" y={lines.length * 9 + 3} fontSize={isSubject ? 8 : 7.5} fill="#71717a" fontFamily="monospace">
                        CUIT {rn.id}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
