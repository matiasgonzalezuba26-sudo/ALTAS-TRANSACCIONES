import React, { useState, useMemo, useEffect, useRef } from "react";
import { AMLNode, AMLEdge } from "../types";
import { ZoomIn, ZoomOut, RotateCcw, Users, ArrowRightLeft } from "lucide-react";

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

function wrapText(text: string, maxLen: number = 16): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxLen) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w.slice(0, maxLen);
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text.slice(0, maxLen)];
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}

const COUNTERPART_LIMIT = 9;
const COUNTERPART_TOP = 4;

export default function NetworkGraph({
  nodes, edges, selectedNodeId, onSelectNode,
  cuitDenominacionesMap, currentCuit, commonCounterparts = []
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const isLargeNetwork = nodes.length > 6;

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => setDimensions({ width: containerRef.current?.clientWidth || 800, height: 500 });
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

  const { analyzedNodes, visibleSources, visibleTargets, commonNodes, groupNodes } = useMemo(() => {
    const analyzed = nodes.filter(n => n.type === "ANALIZADO");
    const common = nodes.filter(n => commonCounterparts.includes(n.id));
    const counterparts = nodes.filter(n => n.type === "CONTRAPARTE" && !commonCounterparts.includes(n.id));
    const byVol = (a: AMLNode, b: AMLNode) => (nodeVolumes[b.id] || 0) - (nodeVolumes[a.id] || 0);

    const sources = counterparts.filter(c => edges.some(e => e.source === c.id) && !edges.some(e => e.target === c.id)).sort(byVol);
    const targets = counterparts.filter(c => !edges.some(e => e.source === c.id) || edges.some(e => e.target === c.id)).sort(byVol);

    const groups: GroupNode[] = [];
    let visSrc = sources;
    let visTgt = targets;

    if (sources.length > COUNTERPART_LIMIT) {
      visSrc = sources.slice(0, COUNTERPART_TOP);
      const rest = sources.slice(COUNTERPART_TOP);
      groups.push({ id: "__group_src__", label: `${rest.length} contrapartes menores`, members: rest, totalVolume: rest.reduce((s, n) => s + (nodeVolumes[n.id] || 0), 0) });
    }
    if (targets.length > COUNTERPART_LIMIT) {
      visTgt = targets.slice(0, COUNTERPART_TOP);
      const rest = targets.slice(COUNTERPART_TOP);
      groups.push({ id: "__group_tgt__", label: `${rest.length} contrapartes menores`, members: rest, totalVolume: rest.reduce((s, n) => s + (nodeVolumes[n.id] || 0), 0) });
    }

    return { analyzedNodes: analyzed, visibleSources: visSrc, visibleTargets: visTgt, commonNodes: common, groupNodes: groups };
  }, [nodes, edges, commonCounterparts, nodeVolumes]);

  const renderNodes = useMemo(() => {
    const { width, height } = dimensions;
    const result: RenderNode[] = [];
    const mX = 90, mY = 75;

    const col = (list: AMLNode[], x: number, r: number) => list.forEach((n, i) => {
      const cnt = list.length;
      result.push({ id: n.id, x, y: cnt > 1 ? mY + (i * (height - mY * 2)) / (cnt - 1) : height / 2, isGroup: false, node: n, radius: r });
    });

    const row = (list: AMLNode[], y: number, r: number) => list.forEach((n, i) => {
      const cnt = list.length;
      result.push({ id: n.id, x: cnt > 1 ? mX + (i * (width - mX * 2)) / (cnt - 1) : width / 2, y, isGroup: false, node: n, radius: r });
    });

    const addGroup = (g: GroupNode, x: number, y: number) => result.push({ id: g.id, x, y, isGroup: true, group: g, radius: 22 });

    if (!isLargeNetwork) {
      // ── SMALL: Left / Center / Right ──
      col(visibleSources, width * 0.13, 18);
      const sg = groupNodes.find(g => g.id === "__group_src__");
      if (sg) addGroup(sg, width * 0.13, mY + visibleSources.length * 45 + 30);

      analyzedNodes.forEach((n, i) => {
        const cnt = analyzedNodes.length;
        result.push({ id: n.id, x: width * 0.5, y: cnt > 1 ? mY + (i * (height - mY * 2)) / (cnt - 1) : height / 2, isGroup: false, node: n, radius: 32 });
      });

      commonNodes.forEach((n, i) => {
        const cnt = commonNodes.length;
        result.push({ id: n.id, x: width * 0.72, y: cnt > 1 ? mY + (i * (height - mY * 2)) / (cnt - 1) : height / 2, isGroup: false, node: n, radius: 24 });
      });

      col(visibleTargets, width * 0.87, 18);
      const tg = groupNodes.find(g => g.id === "__group_tgt__");
      if (tg) addGroup(tg, width * 0.87, mY + visibleTargets.length * 45 + 30);

    } else {
      // ── LARGE: Top / Center / Bottom ──
      row(visibleSources, mY, 18);
      const sg = groupNodes.find(g => g.id === "__group_src__");
      if (sg) addGroup(sg, Math.min(mX + visibleSources.length * ((width - mX * 2) / Math.max(visibleSources.length, 1)), width - mX), mY);

      analyzedNodes.forEach((n, i) => {
        const cnt = analyzedNodes.length;
        result.push({ id: n.id, x: cnt > 1 ? mX + (i * (width * 0.78 - mX)) / (cnt - 1) : width * 0.4, y: height / 2, isGroup: false, node: n, radius: 32 });
      });

      commonNodes.forEach((n, i) => {
        result.push({ id: n.id, x: width - mX - i * 55, y: height / 2, isGroup: false, node: n, radius: 24 });
      });

      row(visibleTargets, height - mY, 18);
      const tg = groupNodes.find(g => g.id === "__group_tgt__");
      if (tg) addGroup(tg, Math.min(mX + visibleTargets.length * ((width - mX * 2) / Math.max(visibleTargets.length, 1)), width - mX), height - mY);
    }

    // Fallback
    nodes.forEach(n => { if (!result.find(r => r.id === n.id)) result.push({ id: n.id, x: width / 2, y: height / 2, isGroup: false, node: n, radius: 18 }); });

    return result;
  }, [nodes, analyzedNodes, visibleSources, visibleTargets, commonNodes, groupNodes, dimensions, isLargeNetwork]);

  const groupMemberMap = useMemo(() => {
    const m: Record<string, string> = {};
    groupNodes.forEach(g => g.members.forEach(mb => { m[mb.id] = g.id; }));
    return m;
  }, [groupNodes]);

  const resolveId = (id: string) => groupMemberMap[id] || id;

  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number; r: number }> = {};
    renderNodes.forEach(rn => { m[rn.id] = { x: draggedPositions[rn.id]?.x ?? rn.x, y: draggedPositions[rn.id]?.y ?? rn.y, r: rn.radius }; });
    groupNodes.forEach(g => { g.members.forEach(mb => { if (!m[mb.id]) m[mb.id] = m[g.id]; }); });
    return m;
  }, [renderNodes, draggedPositions, groupNodes]);

  const getNodeColor = (node: AMLNode, isCommon: boolean) => {
    if (node.type === "ANALIZADO") {
      if (node.risk_level === "ALTO") return { fill: "#fee2e2", stroke: "#ef4444" };
      if (node.risk_level === "MEDIO") return { fill: "#fef3c7", stroke: "#f59e0b" };
      return { fill: "#d1fae5", stroke: "#10b981" };
    }
    if (isCommon) return { fill: "#dbeafe", stroke: "#3b82f6" };
    const sends = edges.some(e => e.source === node.id && e.target === currentCuit);
    const receives = edges.some(e => e.source === currentCuit && e.target === node.id);
    if (sends && receives) return { fill: "#fef9c3", stroke: "#ea580c" };
    if (sends) return { fill: "#d1fae5", stroke: "#22c55e" };
    if (receives) return { fill: "#ffedd5", stroke: "#f97316" };
    return { fill: "#f4f4f5", stroke: "#94a3b8" };
  };

  const getEdgeStyle = (edge: AMLEdge) => {
    const srcId = resolveId(edge.source);
    const tgtId = resolveId(edge.target);
    const srcRn = renderNodes.find(r => r.id === srcId);
    const tgtRn = renderNodes.find(r => r.id === tgtId);
    if (srcRn?.node?.type === "ANALIZADO") return { color: "#f97316", arrow: "arrow-orange" };
    if (tgtRn?.node?.type === "ANALIZADO") return { color: "#22c55e", arrow: "arrow-green" };
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

  return (
    <div id="network-sec" className="w-full">
      <div className="w-full border border-zinc-200 bg-zinc-50 rounded-xl overflow-hidden relative shadow-inner">

        {/* Header badge */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
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
        <div className="absolute top-4 right-4 z-10 flex gap-1.5">
          {[["in", ZoomIn], ["out", ZoomOut]].map(([dir, Icon]: any) => (
            <button key={dir} onClick={() => setZoom(z => dir === "in" ? Math.min(z + 0.15, 2.5) : Math.max(z - 0.15, 0.4))}
              className="p-2 bg-white/95 backdrop-blur-sm hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer">
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setDraggedPositions({}); onSelectNode(null); }}
            className="p-2 bg-white/95 backdrop-blur-sm hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-sm border border-zinc-200 p-2.5 rounded-lg shadow-sm flex flex-col gap-2 max-w-[280px]">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">Referencias</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-bold text-zinc-700">
            {[
              ["#fee2e2", "#ef4444", "Sujeto Analizado", false],
              ["#dbeafe", "#3b82f6", "Contraparte Común", false],
              ["#d1fae5", "#22c55e", "Envía al Sujeto", false],
              ["#ffedd5", "#f97316", "Recibe del Sujeto", false],
            ].map(([fill, stroke, label, _]) => (
              <div key={label as string} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full block flex-shrink-0" style={{ background: fill as string, border: `2px solid ${stroke}` }} />
                <span>{label as string}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="w-3 h-3 rounded-full block flex-shrink-0 bg-zinc-200" style={{ border: "2px dashed #94a3b8" }} />
              <span>Grupo contrapartes — click para expandir</span>
            </div>
          </div>
        </div>

        {/* Expanded group panel */}
        {expandedGroup && (() => {
          const g = groupNodes.find(gn => gn.id === expandedGroup);
          if (!g) return null;
          return (
            <div className="absolute top-14 left-4 z-20 bg-white border border-zinc-200 rounded-xl shadow-xl p-3 w-64 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-600">{g.label}</span>
                <button onClick={() => setExpandedGroup(null)} className="text-zinc-400 hover:text-zinc-700 font-bold text-xs">✕</button>
              </div>
              <div className="text-[10px] text-zinc-500 mb-2">Volumen total: <span className="font-bold text-zinc-800">${g.totalVolume.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span></div>
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
          className={`h-[500px] select-none ${isDragging || draggedNodeId ? "cursor-grabbing" : "cursor-grab"}`}>
          <svg width="100%" height="100%" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="overflow-visible bg-zinc-50">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
              {(["default:#b4b4b8", "selected:#18181b", "green:#22c55e", "orange:#f97316"] as string[]).map(entry => {
                const [id, color] = entry.split(":");
                return (
                  <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill={color} />
                  </marker>
                );
              })}
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              <g>
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
                  const finalArrow = isHighlit ? "arrow-selected" : arrow;

                  const dx = tp.x - sp.x, dy = tp.y - sp.y;
                  const dr = Math.sqrt(dx * dx + dy * dy) || 1;
                  const sx = sp.x + (dx / dr) * (sp.r + 2), sy = sp.y + (dy / dr) * (sp.r + 2);
                  const tx = tp.x - (dx / dr) * (tp.r + 8), ty = tp.y - (dy / dr) * (tp.r + 8);
                  const pathD = `M${sx},${sy}A${dr * 1.4},${dr * 1.4} 0 0,1 ${tx},${ty}`;
                  const rev = sp.x > tp.x;
                  const textPathD = `M${rev ? tx : sx},${rev ? ty : sy}A${dr * 1.4},${dr * 1.4} 0 0,${rev ? "0" : "1"} ${rev ? sx : tx},${rev ? sy : ty}`;
                  const tpId = `tp-${edge.id}`;

                  return (
                    <g key={edge.id} style={{ opacity: isRelated ? 1 : 0.3 }} className="transition-opacity duration-200">
                      <path d={pathD} fill="none" stroke={color} strokeWidth={isHighlit ? 4 : 2.5} markerEnd={`url(#${finalArrow})`} />
                      <path id={tpId} d={textPathD} fill="none" stroke="transparent" className="pointer-events-none" />
                      <text dy="-5" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" fontSize="10" fontWeight="900" className="pointer-events-none select-none">
                        <textPath href={`#${tpId}`} startOffset="50%" textAnchor="middle">{formatK(edge.amount_ars)}</textPath>
                      </text>
                      <text dy="-5" fill={color} fontSize="10" fontWeight="700" className="pointer-events-none select-none">
                        <textPath href={`#${tpId}`} startOffset="50%" textAnchor="middle">{formatK(edge.amount_ars)}</textPath>
                      </text>
                      <path d={pathD} fill="none" stroke="transparent" strokeWidth="12" className="cursor-pointer"
                        onClick={e => { e.stopPropagation(); onSelectNode(edge.source); }}>
                        <title>{`${edge.source} → ${edge.target}\n$${edge.amount_ars.toLocaleString("es-AR")}`}</title>
                      </path>
                    </g>
                  );
                })}
              </g>

              {/* Nodes */}
              <g>
                {renderNodes.map(rn => {
                  const cx = draggedPositions[rn.id]?.x ?? rn.x;
                  const cy = draggedPositions[rn.id]?.y ?? rn.y;
                  const isSelected = selectedNodeId === rn.id;

                  if (rn.isGroup && rn.group) {
                    const g = rn.group;
                    return (
                      <g key={rn.id} transform={`translate(${cx}, ${cy})`} className="cursor-pointer"
                        onClick={e => { e.stopPropagation(); setExpandedGroup(expandedGroup === g.id ? null : g.id); }}>
                        <circle r={rn.radius} fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,3" className="hover:fill-zinc-200 transition-all" />
                        <text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#64748b" className="pointer-events-none select-none">{g.members.length}</text>
                        <g transform={`translate(0, ${rn.radius + 12})`} className="pointer-events-none select-none">
                          <text textAnchor="middle" fontSize="8" fontWeight="600" fill="#64748b">{g.label}</text>
                          <text textAnchor="middle" y="11" fontSize="8" fill="#94a3b8">{formatK(g.totalVolume)} total</text>
                          <text textAnchor="middle" y="22" fontSize="8" fill="#3b82f6">▼ ver detalle</text>
                        </g>
                      </g>
                    );
                  }

                  if (!rn.node) return null;
                  const isCommon = commonCounterparts.includes(rn.id);
                  const isSubject = rn.node.type === "ANALIZADO";
                  const { fill, stroke } = getNodeColor(rn.node, isCommon);
                  const name = cuitDenominacionesMap?.[rn.id] || rn.node.label || (isSubject ? "Sujeto" : "Contraparte");
                  const lines = wrapText(name, isSubject ? 16 : 13);

                  return (
                    <g key={rn.id} transform={`translate(${cx}, ${cy})`} className="cursor-pointer"
                      onClick={e => { e.stopPropagation(); onSelectNode(isSelected ? null : rn.id); }}
                      onMouseDown={e => { e.stopPropagation(); setDraggedNodeId(rn.id); }}>
                      {isSelected && (
                        <circle r={rn.radius + 6} fill="none" stroke="#71717a" strokeWidth="1.5" strokeDasharray="4,2"
                          className="animate-spin" style={{ animationDuration: "12s" }} />
                      )}
                      <circle r={rn.radius} fill={fill} stroke={stroke} strokeWidth={isSubject ? 3 : 1.75}
                        className="transition-all duration-150 hover:scale-110" />
                      <g transform={`translate(0, ${rn.radius + 13})`} className="pointer-events-none select-none">
                        <text textAnchor="middle" fontSize={isSubject ? 10 : 8.5} fontWeight={isSubject ? "800" : "600"} fill="#18181b">
                          {lines.map((line, i) => <tspan key={i} x="0" dy={i === 0 ? 0 : 10}>{line}</tspan>)}
                        </text>
                        <text textAnchor="middle" y={lines.length * 10 + 2} fontSize={isSubject ? 9 : 8} fill="#71717a" fontFamily="monospace">
                          CUIT {rn.id}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
