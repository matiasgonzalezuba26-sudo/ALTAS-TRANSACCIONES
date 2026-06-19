import React, { useState, useMemo, useEffect, useRef } from "react";
import { AMLNode, AMLEdge } from "../types";
import { Info, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, ShieldCheck, Flame, Users, ArrowRightLeft } from "lucide-react";

interface NetworkGraphProps {
  nodes: AMLNode[];
  edges: AMLEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  cuitDenominacionesMap?: Record<string, string>;
  currentCuit: string | null;
  commonCounterparts?: string[];
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  node: AMLNode;
  weight: number; // Volume of transactions
  isSource: boolean;
  isTarget: boolean;
}

function wrapText(text: string, maxLen: number = 18): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxLen) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  if (lines.length === 0) lines.push(text);
  return lines;
}

export default function NetworkGraph({ 
  nodes, 
  edges, 
  selectedNodeId, 
  onSelectNode,
  cuitDenominacionesMap,
  currentCuit,
  commonCounterparts = []
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Dragging individual nodes state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Update dimensions with a ResizeObserver to avoid scaling issues in iframes
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateSize = () => {
      setDimensions({
        width: containerRef.current?.clientWidth || 800,
        height: 500
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute node weights (total transaction volume through each node)
  const nodeVolumes = useMemo(() => {
    const volumes: Record<string, number> = {};
    nodes.forEach(n => { volumes[n.id] = 0; });
    edges.forEach(e => {
      if (volumes[e.source] !== undefined) volumes[e.source] += e.amount_ars;
      if (volumes[e.target] !== undefined) volumes[e.target] += e.amount_ars;
    });
    return volumes;
  }, [nodes, edges]);

  // High-fidelity structured layout algorithm (Tri-partite Left-Center-Right Flow)
  const nodePositions = useMemo(() => {
    const width = dimensions.width;
    const height = dimensions.height;

    // Separate nodes into distinct structural roles to make the network extremely readable
    const analyzedNodes = nodes.filter(n => n.type === "ANALIZADO");
    
    // Find counterparties that are primarily sources (sending money into the system)
    // vs destinations (receiving money out of the system)
    const counterpartNodes = nodes.filter(n => n.type === "CONTRAPARTE");
    
    const sourceCounterparts: AMLNode[] = [];
    const targetCounterparts: AMLNode[] = [];

    counterpartNodes.forEach(c => {
      const isSender = edges.some(e => e.source === c.id);
      const isReceiver = edges.some(e => e.target === c.id);
      
      if (isSender && !isReceiver) {
        sourceCounterparts.push(c);
      } else {
        // Default receiver or mixed
        targetCounterparts.push(c);
      }
    });

    const positions: Record<string, NodePosition> = {};
    const marginY = 60;

    // 1. Position Source Counterparts on the LEFT
    const leftX = width * 0.15;
    const sourceCount = sourceCounterparts.length;
    sourceCounterparts.forEach((node, idx) => {
      const y = sourceCount > 1 
        ? marginY + (idx * (height - marginY * 2)) / (sourceCount - 1)
        : height / 2;
      positions[node.id] = {
        id: node.id,
        x: leftX,
        y: y,
        node,
        weight: nodeVolumes[node.id] || 0,
        isSource: true,
        isTarget: false
      };
    });

    // 2. Position Subject CUITs (Under Analysis) in the CENTER
    const centerX = width * 0.5;
    const analyzedCount = analyzedNodes.length;
    analyzedNodes.forEach((node, idx) => {
      const y = analyzedCount > 1
        ? marginY + (idx * (height - marginY * 2)) / (analyzedCount - 1)
        : height / 2;
      positions[node.id] = {
        id: node.id,
        x: centerX,
        y: y,
        node,
        weight: nodeVolumes[node.id] || 0,
        isSource: false,
        isTarget: false
      };
    });

    // 3. Position Destination Counterparts on the RIGHT
    const rightX = width * 0.85;
    const targetCount = targetCounterparts.length;
    targetCounterparts.forEach((node, idx) => {
      const y = targetCount > 1
        ? marginY + (idx * (height - marginY * 2)) / (targetCount - 1)
        : height / 2;
      positions[node.id] = {
        id: node.id,
        x: rightX,
        y: y,
        node,
        weight: nodeVolumes[node.id] || 0,
        isSource: false,
        isTarget: true
      };
    });

    // Fallback placement (or circular coordinates if there are stray nodes or size is tight)
    nodes.forEach(node => {
      if (!positions[node.id]) {
        positions[node.id] = {
          id: node.id,
          x: width / 2,
          y: height / 2,
          node,
          weight: nodeVolumes[node.id] || 0,
          isSource: false,
          isTarget: false
        };
      }
    });

    return positions;
  }, [nodes, edges, dimensions, nodeVolumes]);

  // Max weight of transaction volume to scale node radii dynamically
  const maxVolume = useMemo(() => {
    return Math.max(...(Object.values(nodeVolumes) as number[]), 1);
  }, [nodeVolumes]);

  // Get responsive scale for node size
  const getNodeRadius = (nodeId: string, isSelected: boolean) => {
    const isSubject = nodeId === currentCuit || nodes.some(n => n.id === nodeId && n.type === "ANALIZADO");
    const isCommon = commonCounterparts && commonCounterparts.includes(nodeId);
    const radius = isSubject ? 32 : (isCommon ? 24 : 18);
    return isSelected ? radius + 4 : radius;
  };

  // Drag and pan handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "circle" || (e.target as HTMLElement).tagName === "text") {
      return; // Do not pan when clicking a node directly
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDraggedNodeId(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate inverse relative coords of mouse inside zoom/pan SVG space
      const graphX = (mouseX - pan.x) / zoom;
      const graphY = (mouseY - pan.y) / zoom;
      
      setDraggedPositions(prev => ({
        ...prev,
        [draggedNodeId]: { x: graphX, y: graphY }
      }));
    } else if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoom(prev => {
      if (direction === "in") return Math.min(prev + 0.15, 2.5);
      return Math.max(prev - 0.15, 0.4);
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDraggedPositions({});
    onSelectNode(null);
  };

  // Check if link is related to currently highlighted node
  const getEdgeOpacity = (edge: AMLEdge) => {
    if (!selectedNodeId) return "opacity-90 stroke-zinc-400 stroke-[2.2px]";
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
      return "opacity-100 stroke-zinc-950 stroke-[4px]";
    }
    return "opacity-75 stroke-zinc-300 stroke-[1.8px]";
  };

  return (
    <div id="network-sec" className="w-full">
      {/* Visual Canvas Panel */}
      <div className="w-full border border-zinc-200 bg-zinc-50 rounded-xl overflow-hidden relative shadow-inner">
        
        {/* Canvas Toolbar Info */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 pointer-events-auto">
          <div className="bg-white/95 backdrop-blur-sm border border-zinc-200 text-xs px-3 py-1.5 rounded-full font-medium text-zinc-700 shadow-sm flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            <span>{nodes.length} Nodos</span>
            <span className="text-zinc-300">|</span>
            <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-500" />
            <span>{edges.length} Relaciones</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="absolute top-4 right-4 z-10 flex gap-1.5">
          <button
            onClick={() => handleZoom("in")}
            title="Aumentar Zoom"
            className="p-2 bg-white/95 backdrop-blur-sm hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer flex items-center justify-center"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom("out")}
            title="Reducir Zoom"
            className="p-2 bg-white/95 backdrop-blur-sm hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer flex items-center justify-center"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            title="Restaurar Vista"
            className="p-2 bg-white/95 backdrop-blur-sm hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-sm text-zinc-700 transition cursor-pointer flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Color Reference Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-sm border border-zinc-200 p-2.5 rounded-lg shadow-sm font-sans flex flex-col gap-2 max-w-[340px] pointer-events-auto">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">REFERENCIAS DE COLOR</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-bold text-zinc-700">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#fee2e2] border-2 border-[#ef4444] block animate-pulse"></span>
              <span>Sujeto Analizado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#dbeafe] border-2 border-[#3b82f6] block"></span>
              <span>Contraparte Común</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#d1fae5] border-2 border-[#22c55e] block"></span>
              <span>Envía al Sujeto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ffedd5] border-2 border-[#f97316] block"></span>
              <span>Recibe del Sujeto</span>
            </div>
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="w-3 h-3 rounded-full bg-gradient-to-br from-[#d1fae5] to-[#ffedd5] border-2 border-[#ea580c] block"></span>
              <span>Envía y Recibe del Sujeto</span>
            </div>
          </div>
        </div>

        {/* SVG Container Stage */}
        <div 
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`h-[480px] select-none ${isDragging || draggedNodeId ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <svg 
            width="100%" 
            height="100%"
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="overflow-visible bg-zinc-50"
          >
            {/* Arrow Marker and Gradient Definitions */}
            <defs>
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#b4b4b8" />
              </marker>
              <marker
                id="arrow-selected"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#18181b" />
              </marker>
              <marker
                id="arrow-green"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#22c55e" />
              </marker>
              <marker
                id="arrow-orange"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#f97316" />
              </marker>

              {/* Dual-color vertical linear gradient representing green (sending) and orange (receiving) */}
              <linearGradient id="grad-green-orange" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="50%" stopColor="#22c55e" /> {/* green-500 */}
                <stop offset="50%" stopColor="#f97316" /> {/* orange-500 */}
              </linearGradient>
            </defs>

            {/* Grid background representation (aesthetic only) */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              
              {/* Render Connections (Edges) */}
              <g id="edges-group">
                {edges.map((edge) => {
                  const sourceNode = nodePositions[edge.source];
                  const targetNode = nodePositions[edge.target];
                  if (!sourceNode || !targetNode) return null;

                  // Take dragged offset into consideration
                  const sourceX = draggedPositions[edge.source] ? draggedPositions[edge.source].x : sourceNode.x;
                  const sourceY = draggedPositions[edge.source] ? draggedPositions[edge.source].y : sourceNode.y;
                  const targetX = draggedPositions[edge.target] ? draggedPositions[edge.target].x : targetNode.x;
                  const targetY = draggedPositions[edge.target] ? draggedPositions[edge.target].y : targetNode.y;

                  const isHighlit = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);
                  
                  // Dynamic link coloring matching custom direction
                  let edgeColor = "#94a3b8"; // default clean light grey
                  let arrowId = isHighlit ? "arrow-selected" : "arrow-default";
                  
                  if (edge.source === currentCuit) {
                    edgeColor = "#f97316"; // orange (receives from subject)
                    arrowId = isHighlit ? "arrow-selected" : "arrow-orange";
                  } else if (edge.target === currentCuit) {
                    edgeColor = "#22c55e"; // green (sends to subject)
                    arrowId = isHighlit ? "arrow-selected" : "arrow-green";
                  } else {
                    const isSourceSubject = sourceNode.node.type === "ANALIZADO";
                    const isTargetSubject = targetNode.node.type === "ANALIZADO";
                    if (isSourceSubject) {
                      edgeColor = "#f97316";
                      arrowId = isHighlit ? "arrow-selected" : "arrow-orange";
                    } else if (isTargetSubject) {
                      edgeColor = "#22c55e";
                      arrowId = isHighlit ? "arrow-selected" : "arrow-green";
                    }
                  }

                  const isRelatedToSelection = !selectedNodeId || edge.source === selectedNodeId || edge.target === selectedNodeId;
                  const strokeWidth = isRelatedToSelection ? (selectedNodeId ? 4.0 : 3.0) : 2.2;
                  const opacity = isRelatedToSelection ? 0.95 : 0.65;

                  const dx = targetX - sourceX;
                  const dy = targetY - sourceY;
                  const dr = Math.sqrt(dx * dx + dy * dy) || 1;

                  // Get actual node sizes to calculate boundary intersections
                  const isSourceSelected = selectedNodeId === edge.source;
                  const isTargetSelected = selectedNodeId === edge.target;
                  const rSource = getNodeRadius(edge.source, isSourceSelected);
                  const rTarget = getNodeRadius(edge.target, isTargetSelected);

                  // Shorten path coordinates from both start and end circles
                  const sourceX_short = sourceX + (dx / dr) * (rSource + 1);
                  const sourceY_short = sourceY + (dy / dr) * (rSource + 1);
                  const targetX_short = targetX - (dx / dr) * (rTarget + 8); // Extra padding so arrow head sits perfectly outside node body
                  const targetY_short = targetY - (dy / dr) * (rTarget + 8);

                  // Unique path IDs
                  const pathId = `edge-path-${edge.id}`;
                  const textPathId = `edge-text-path-${edge.id}`;

                  // Standard arrow path curve (A -> B curved) using shortened coordinates
                  const pathD = `M${sourceX_short},${sourceY_short}A${dr * 1.5},${dr * 1.5} 0 0,1 ${targetX_short},${targetY_short}`;

                  // To avoid upside down edge text, if source is to the right of target, inverse start/ends specifically for the text path!
                  const reverseText = sourceX > targetX;
                  const startX = reverseText ? targetX_short : sourceX_short;
                  const startY = reverseText ? targetY_short : sourceY_short;
                  const endX = reverseText ? sourceX_short : targetX_short;
                  const endY = reverseText ? sourceY_short : targetY_short;
                  const sweepFlag = reverseText ? "0" : "1";
                  const textPathD = `M${startX},${startY}A${dr * 1.5},${dr * 1.5} 0 0,${sweepFlag} ${endX},${endY}`;

                  return (
                    <g key={edge.id} className="transition-all duration-300">
                      {/* Visual link path with arrows */}
                      <path
                        id={pathId}
                        d={pathD}
                        fill="none"
                        stroke={edgeColor}
                        strokeWidth={strokeWidth}
                        style={{ opacity }}
                        markerEnd={`url(#${arrowId})`}
                      />

                      {/* Invisible text-specific path tailored to look right side up */}
                      <path
                        id={textPathId}
                        d={textPathD}
                        fill="none"
                        stroke="transparent"
                        className="pointer-events-none"
                      />
                      
                      {/* Amount in thousands displayed above the connection line with a legible white background mask */}
                      <text
                        dy="-6"
                        className="font-mono text-[11px] font-black select-none pointer-events-none"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        style={{ opacity: isRelatedToSelection ? 1 : 0.65 }}
                      >
                        <textPath href={`#${textPathId}`} startOffset="50%" textAnchor="middle">
                          {Math.round(edge.amount_ars / 1000)} k
                        </textPath>
                      </text>

                      <text
                        dy="-6"
                        className="font-mono text-[11px] font-bold select-none pointer-events-none"
                        fill={edgeColor}
                        style={{ opacity: isRelatedToSelection ? 1 : 0.75 }}
                      >
                        <textPath href={`#${textPathId}`} startOffset="50%" textAnchor="middle">
                          {Math.round(edge.amount_ars / 1000)} k
                        </textPath>
                      </text>

                      {/* Interactive thick hover line */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="10"
                        className="cursor-pointer hover:stroke-zinc-500/10 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(edge.source);
                        }}
                      >
                        <title>{`${edge.source} ➔ ${edge.target}\nMonto: $${edge.amount_ars.toLocaleString("es-AR")} ARS\nMotivo: ${edge.alert_reason}`}</title>
                      </path>
                    </g>
                  );
                })}
              </g>

              {/* Render Entity Nodes */}
              <g id="nodes-group">
                {(Object.values(nodePositions) as NodePosition[]).map((pos) => {
                  const isSelected = selectedNodeId === pos.id;
                  const isSubject = pos.node.type === "ANALIZADO";

                  // Realtime node layout overrides from drags
                  const currentX = draggedPositions[pos.id] ? draggedPositions[pos.id].x : pos.x;
                  const currentY = draggedPositions[pos.id] ? draggedPositions[pos.id].y : pos.y;
                  
                  // Fixed visual radii: Center: 32, Common: 24, Peripheral: 18
                  const radius = isSubject ? 32 : (pos.id === commonCounterparts?.[0] ? 24 : 18);

                  // Flows-related color customization!
                  // Subjects stay standard, counterparties changed dynamically based on their interaction with currentCuit
                  let colorFill = "#f4f4f5"; // default light zinc
                  let colorStroke = "#94a3b8";
                  let isGradient = false;

                  const isCommon = commonCounterparts && commonCounterparts.includes(pos.id);

                  if (isSubject) {
                    if (pos.node.risk_level === "ALTO") {
                      colorFill = "#fee2e2"; // light red
                      colorStroke = "#ef4444"; // bright red
                    } else if (pos.node.risk_level === "MEDIO") {
                      colorFill = "#fef3c7"; // light amber
                      colorStroke = "#f59e0b"; // amber
                    } else {
                      colorFill = "#d1fae5"; // light green
                      colorStroke = "#10b981"; // emerald
                    }
                  } else if (isCommon) {
                    colorFill = "#dbeafe"; // light blue
                    colorStroke = "#3b82f6"; // bright blue
                  } else {
                    // Check direct flow relative to currentCuit!
                    const sendsToTarget = edges.some(e => e.source === pos.id && e.target === currentCuit);
                    const receivesFromTarget = edges.some(e => e.source === currentCuit && e.target === pos.id);

                    if (sendsToTarget && receivesFromTarget) {
                      isGradient = true;
                      colorFill = "url(#grad-green-orange)";
                      colorStroke = "#ea580c"; // bright orange
                    } else if (sendsToTarget) {
                      colorFill = "#d1fae5"; // light green
                      colorStroke = "#22c55e"; // bright green
                    } else if (receivesFromTarget) {
                      colorFill = "#ffedd5"; // light orange
                      colorStroke = "#f97316"; // bright orange
                    } else {
                      colorFill = "#f4f4f5"; // neutral zinc
                      colorStroke = "#94a3b8"; // zinc-400
                    }
                  }

                  return (
                    <g 
                      key={pos.id} 
                      transform={`translate(${currentX}, ${currentY})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(isSelected ? null : pos.id);
                      }}
                      onMouseDown={(e) => handleNodeMouseDown(e, pos.id)}
                    >
                      {/* Outer Selection Highlight Ring */}
                      {isSelected && (
                        <circle
                          r={radius + 6}
                          fill="none"
                          stroke="#71717a"
                          strokeWidth="1.5"
                          strokeDasharray="4,2"
                          className="animate-spin"
                          style={{ animationDuration: "12s" }}
                        />
                      )}

                      {/* Node Circle Shape representing CUIT */}
                      <circle
                        r={radius}
                        className="transition-all duration-150 hover:scale-110 shadow-sm"
                        fill={colorFill}
                        stroke={colorStroke}
                        strokeWidth={isSubject ? "3.5" : "1.75"}
                      />

                      {/* Multiline information below circle */}
                      <g transform={`translate(0, ${radius + 14})`} className="pointer-events-none select-none text-center">
                        {(() => {
                          const name = cuitDenominacionesMap?.[pos.id] || pos.node.label || (isSubject ? "Sujeto de Análisis" : "Contraparte");
                          const wrappedLines = wrapText(name, 18);
                          return (
                            <>
                              {/* Full Denomination */}
                              <text
                                textAnchor="middle"
                                className={`font-sans ${isSubject ? "text-[10px] font-extrabold fill-zinc-900" : "text-[8.5px] sm:text-[9px] font-bold fill-zinc-800"}`}
                              >
                                {wrappedLines.map((line, i) => (
                                  <tspan x="0" dy={i === 0 ? 0 : 10} key={i}>
                                    {line}
                                  </tspan>
                                ))}
                              </text>

                              {/* Full CUIT */}
                              <text
                                textAnchor="middle"
                                y={wrappedLines.length * 10 + 2}
                                className={`font-mono ${isSubject ? "text-[9px]" : "text-[8px]"} font-semibold fill-zinc-500`}
                              >
                                CUIT {pos.id}
                              </text>
                            </>
                          );
                        })()}
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
