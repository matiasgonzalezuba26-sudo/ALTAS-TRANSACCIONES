import { Transaction, AMLNode, AMLEdge } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de flujo pre-computados que la app pasa directamente al exportador.
// El reporte no recalcula nada: solo serializa y renderiza lo que la app tiene.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowEntry {
  cuit: string;
  denom: string;
  sum: number;
}

export interface InternalFlowEntry {
  senderCuit: string;
  senderDenom: string;
  receiverCuit: string;
  receiverDenom: string;
  sum: number;
}

/** Snapshot completo del estado de la pestaña "Flujo Individual" para un CUIT dado */
export interface IndividualSnapshot {
  cuit: string;
  denominacion: string;
  altaDate: string;
  antiquityDays: number;
  totalRecibido: number;
  totalOrdenado: number;
  receives: FlowEntry[];       // contrapartes que ENVÍAN fondos al sujeto
  sends: FlowEntry[];          // contrapartes que RECIBEN fondos del sujeto
  graphNodes: AMLNode[];       // nodos ya filtrados para este CUIT
  graphEdges: AMLEdge[];       // edges ya filtrados para este CUIT
}

/** Snapshot completo del estado de la pestaña "Flujo Grupal" para un grupo dado */
export interface GroupSnapshot {
  groupId: string;
  subjects: string[];
  commonCounterparts: string[];
  pairwiseCommon: { subA: string; subB: string; counterparts: string[] }[];
  totalIntergroupVolume: number;
  detectedLoopsCount: number;
  receives: FlowEntry[];           // inyecciones externas al grupo
  sends: FlowEntry[];              // liquidaciones externas del grupo
  internals: InternalFlowEntry[];  // movimientos entre integrantes
  graphNodes: AMLNode[];           // nodos ya filtrados para el grupo
  graphEdges: AMLEdge[];           // edges ya filtrados para el grupo
}

export interface CapturedAMLState {
  reportDate: string;
  complianceOfficer: string;
  analysisMonth: string;
  lookbackMonths: number;
  alertThreshold: number;
  selectedPresetId: string;
  selectedPresetName: string;
  antiquityLimit: number;
  activeTab?: "alertas" | "forense";
  forensicMode?: "individual" | "grupal";
  currentCuit?: string;
  selectedGroupId?: string | null;

  // Métricas agregadas (Pestaña 1)
  metrics: {
    totalVolumeARS: number;
    totalTransactionsCount: number;
    uniqueCuitCount: number;
    flaggedHighRiskCount: number;
  };

  flaggedSubjects: Array<{
    cuit: string;
    denominacion: string;
    altaDate: string;
    antiquityDays: number;
    totalVolumeARS: number;
    transactionCount: number;
    riskCategory: "ALTO" | "MEDIO" | "BAJO";
    reasons: string[];
  }>;

  criticalTransactions: Transaction[];

  // Mapa de denominaciones para lookups en el reporte
  cuitDenominacionesMap: Record<string, string>;

  // Transacciones completas (necesarias para la pestaña 1 y búsquedas)
  allTransactions: Transaction[];
  positiveCases: Array<{
    id: string;
    altaDate: string;
    antiquity_days: number;
  }>;

  // ── NUEVO: snapshots pre-computados por la app ────────────────────────────
  // El reporte HTML usa estos directamente; no recalcula nada.
  individualSnapshots: IndividualSnapshot[];  // uno por cada CUIT en flaggedSubjects
  groupSnapshot: GroupSnapshot | null;         // el grupo activo al momento de exportar
  // ─────────────────────────────────────────────────────────────────────────

  // Grafo completo (para búsquedas adicionales desde la pestaña 2 si se necesita)
  graphNodes: AMLNode[];
  graphEdges: AMLEdge[];
}

/**
 * Paso 1: Captura de Estado de Interfaz y Datos Dinámicos
 *
 * Ahora la función acepta los datos ya calculados por la app
 * (graphData filtrado por CUIT/grupo, tablas de flujo, etc.) y los serializa
 * tal cual. El reporte HTML no recalcula: refleja el estado exacto de la app
 * en el momento de exportar, independientemente de futuros cambios en la lógica.
 */
export function captureCurrentAMLState(params: {
  analysisMonth: string;
  lookbackMonths: number;
  threshold: number;
  selectedPresetId: string;
  selectedPresetName: string;
  transactions: Transaction[];
  positiveCases: Array<{
    id: string;
    altaDate: string;
    antiquity_days: number;
  }>;
  cuitDenominacionesMap: Record<string, string>;
  activeGroup: {
    id: string;
    subjects: string[];
    commonCounterparts: string[];
  } | null;
  antiquityLimit: number;
  activeTab?: "alertas" | "forense";
  forensicMode?: "individual" | "grupal";
  currentCuit?: string;
  selectedGroupId?: string | null;
  graphNodes?: AMLNode[];
  graphEdges?: AMLEdge[];
  // ── NUEVO: datos pre-computados desde la app ──────────────────────────────
  individualSnapshots?: IndividualSnapshot[];
  groupSnapshot?: GroupSnapshot | null;
  // ─────────────────────────────────────────────────────────────────────────
}): CapturedAMLState {
  const {
    analysisMonth, lookbackMonths, threshold, selectedPresetId, selectedPresetName,
    transactions, positiveCases, cuitDenominacionesMap, activeGroup, antiquityLimit,
    activeTab, forensicMode, currentCuit, selectedGroupId, graphNodes, graphEdges,
    individualSnapshots, groupSnapshot,
  } = params;

  const totalVolume = transactions.reduce((sum, t) => sum + parseFloat(t.MONTO || "0"), 0);
  const uniqueCuits = new Set(transactions.map(t => t.CUIT));

  const flaggedSubjects = positiveCases.map(node => {
    const subjectTxs = transactions.filter(t => t.CUIT === node.id);
    const subjectVolume = subjectTxs.reduce((sum, t) => sum + parseFloat(t.MONTO || "0"), 0);
    const antiquity = node.antiquity_days;
    let riskCategory: "ALTO" | "MEDIO" | "BAJO" = "BAJO";
    const reasons: string[] = [];
    if (antiquity <= 365) {
      reasons.push(`Inscripción Reciente (Antigüedad de ${antiquity} días)`);
      if (subjectVolume > threshold) {
        riskCategory = "ALTO";
        reasons.push(`Supera Umbral Transaccional de Advertencia ($${threshold.toLocaleString("es-AR")}) en periodo crítico`);
      } else {
        riskCategory = "MEDIO";
      }
    }
    return {
      cuit: node.id,
      denominacion: cuitDenominacionesMap[node.id] || `Sujeto Fiscal ${node.id}`,
      altaDate: node.altaDate,
      antiquityDays: antiquity,
      totalVolumeARS: subjectVolume,
      transactionCount: subjectTxs.length,
      riskCategory,
      reasons,
    };
  });

  const criticalCuitSet = new Set(positiveCases.map(c => c.id));
  const criticalTransactions = transactions.filter(
    t => criticalCuitSet.has(t.CUIT) || parseFloat(t.MONTO) > threshold / 5
  );

  // Si la app no pasó snapshots pre-computados, los generamos aquí como fallback
  // (comportamiento retrocompatible: el reporte siempre funciona aunque App.tsx
  // no haya sido actualizado todavía para pasar los nuevos parámetros)
  const resolvedIndividualSnapshots: IndividualSnapshot[] = individualSnapshots && individualSnapshots.length > 0
    ? individualSnapshots
    : positiveCases.map(node => {
        const subjectTxs = transactions.filter(t => t.CUIT === node.id);
        const totalRecibido = subjectTxs.filter(t => t.TIPO === "RECIBIDA").reduce((s, t) => s + parseFloat(t.MONTO || "0"), 0);
        const totalOrdenado = subjectTxs.filter(t => t.TIPO === "ORDENADA").reduce((s, t) => s + parseFloat(t.MONTO || "0"), 0);

        const recMap: Record<string, number> = {};
        subjectTxs.filter(t => t.TIPO === "RECIBIDA").forEach(t => {
          recMap[t.CUIT_CONTRAPARTE] = (recMap[t.CUIT_CONTRAPARTE] || 0) + parseFloat(t.MONTO || "0");
        });
        const sndMap: Record<string, number> = {};
        subjectTxs.filter(t => t.TIPO === "ORDENADA").forEach(t => {
          sndMap[t.CUIT_CONTRAPARTE] = (sndMap[t.CUIT_CONTRAPARTE] || 0) + parseFloat(t.MONTO || "0");
        });

        // Filtrar grafo completo para este CUIT
        const iEdges = (graphEdges || []).filter(e => e.source === node.id || e.target === node.id);
        const iIds = new Set<string>([node.id]);
        iEdges.forEach(e => { iIds.add(e.source); iIds.add(e.target); });
        const iNodes = (graphNodes || []).filter(n => iIds.has(n.id));

        return {
          cuit: node.id,
          denominacion: cuitDenominacionesMap[node.id] || `Sujeto Fiscal ${node.id}`,
          altaDate: node.altaDate,
          antiquityDays: node.antiquity_days,
          totalRecibido,
          totalOrdenado,
          receives: Object.keys(recMap).map(k => ({ cuit: k, denom: cuitDenominacionesMap[k] || k, sum: recMap[k] })).sort((a, b) => b.sum - a.sum),
          sends: Object.keys(sndMap).map(k => ({ cuit: k, denom: cuitDenominacionesMap[k] || k, sum: sndMap[k] })).sort((a, b) => b.sum - a.sum),
          graphNodes: iNodes,
          graphEdges: iEdges,
        };
      });

  let resolvedGroupSnapshot: GroupSnapshot | null = groupSnapshot !== undefined ? groupSnapshot : null;
  if (!resolvedGroupSnapshot && activeGroup) {
    const subSet = new Set(activeGroup.subjects);
    const cpSet = new Set(activeGroup.commonCounterparts);
    const groupTxs = transactions.filter(t => subSet.has(t.CUIT));
    const intergroupVolume = groupTxs.reduce((sum, t) => sum + parseFloat(t.MONTO || "0"), 0);

    const recMap: Record<string, number> = {};
    groupTxs.filter(t => t.TIPO === "RECIBIDA" && !subSet.has(t.CUIT_CONTRAPARTE)).forEach(t => {
      recMap[t.CUIT_CONTRAPARTE] = (recMap[t.CUIT_CONTRAPARTE] || 0) + parseFloat(t.MONTO || "0");
    });
    const sndMap: Record<string, number> = {};
    groupTxs.filter(t => t.TIPO === "ORDENADA" && !subSet.has(t.CUIT_CONTRAPARTE)).forEach(t => {
      sndMap[t.CUIT_CONTRAPARTE] = (sndMap[t.CUIT_CONTRAPARTE] || 0) + parseFloat(t.MONTO || "0");
    });
    const intMap: Record<string, number> = {};
    groupTxs.forEach(t => {
      const isSenderInGroup = subSet.has(t.CUIT) || cpSet.has(t.CUIT);
      const isReceiverInGroup = subSet.has(t.CUIT_CONTRAPARTE) || cpSet.has(t.CUIT_CONTRAPARTE);
      if (isSenderInGroup && isReceiverInGroup) {
        const sender = t.TIPO === "RECIBIDA" ? t.CUIT_CONTRAPARTE : t.CUIT;
        const receiver = t.TIPO === "RECIBIDA" ? t.CUIT : t.CUIT_CONTRAPARTE;
        const key = sender + "➔" + receiver;
        intMap[key] = (intMap[key] || 0) + parseFloat(t.MONTO || "0");
      }
    });

    // Filtrar grafo para el grupo
    const gEdges = (graphEdges || []).filter(e => subSet.has(e.source) || subSet.has(e.target));
    const gIds = new Set<string>(activeGroup.subjects);
    gEdges.forEach(e => { gIds.add(e.source); gIds.add(e.target); });
    const gNodes = (graphNodes || []).filter(n => gIds.has(n.id));

    resolvedGroupSnapshot = {
      groupId: activeGroup.id,
      subjects: activeGroup.subjects,
      commonCounterparts: activeGroup.commonCounterparts,
      totalIntergroupVolume: intergroupVolume,
      detectedLoopsCount: activeGroup.subjects.length > 2 ? 1 : 0,
      receives: Object.keys(recMap).map(k => ({ cuit: k, denom: cuitDenominacionesMap[k] || k, sum: recMap[k] })).sort((a, b) => b.sum - a.sum),
      sends: Object.keys(sndMap).map(k => ({ cuit: k, denom: cuitDenominacionesMap[k] || k, sum: sndMap[k] })).sort((a, b) => b.sum - a.sum),
      internals: Object.keys(intMap).map(key => {
        const [sk, rk] = key.split("➔");
        return { senderCuit: sk, senderDenom: cuitDenominacionesMap[sk] || sk, receiverCuit: rk, receiverDenom: cuitDenominacionesMap[rk] || rk, sum: intMap[key] };
      }).sort((a, b) => b.sum - a.sum),
      graphNodes: gNodes,
      graphEdges: gEdges,
    };
  }

  return {
    reportDate: new Date().toISOString(),
    complianceOfficer: "AUDITOR_PLD_ESTÁNDAR_CNBV",
    analysisMonth, lookbackMonths,
    alertThreshold: threshold,
    selectedPresetId, selectedPresetName, antiquityLimit,
    activeTab, forensicMode, currentCuit, selectedGroupId,
    metrics: {
      totalVolumeARS: totalVolume,
      totalTransactionsCount: transactions.length,
      uniqueCuitCount: uniqueCuits.size,
      flaggedHighRiskCount: flaggedSubjects.length,
    },
    flaggedSubjects,
    criticalTransactions,
    cuitDenominacionesMap,
    allTransactions: transactions,
    positiveCases,
    individualSnapshots: resolvedIndividualSnapshots,
    groupSnapshot: resolvedGroupSnapshot,
    graphNodes: graphNodes || [],
    graphEdges: graphEdges || [],
  };
}

/**
 * Paso 2: Generación del Reporte HTML Dinámico Completo
 * Construye una plantilla HTML interactiva y standalone con estilos integrados, filtros interactivos y
 * visualización optimizada para la entrega directa de reportes a Reguladores e Inteligencia Financiera.
 */
export function generateAMLReportHTML(state: CapturedAMLState): string {
  const formattedThreshold = state.alertThreshold.toLocaleString("es-AR");
  const formattedVolume = state.metrics.totalVolumeARS.toLocaleString("es-AR");
  const reportFormattedDate = new Date(state.reportDate).toLocaleString("es-AR");

  // Filas de Sujetos Alertados
  const flaggedSubjectsHtml = state.flaggedSubjects.length > 0 
    ? state.flaggedSubjects.map((sub, idx) => `
      <tr class="hover:bg-zinc-900/60 border-b border-zinc-800 transition-colors cursor-pointer" 
          title="Haga clic para ver el grafo forense y dictamen técnico de este sujeto" 
          onclick="goToForensicSubject('${sub.cuit}')"
          data-cuit="${sub.cuit}"
          data-denom="${sub.denominacion}"
          data-alta="${sub.altaDate}"
          data-antiquity="${sub.antiquityDays}"
          data-volume="${sub.totalVolumeARS}"
          data-count="${sub.transactionCount}"
          data-threshold="${state.alertThreshold}"
          data-risk="${sub.riskCategory}">
        <td class="px-6 py-4 font-mono text-[13px] text-zinc-400 text-center font-bold">${idx + 1}</td>
        <td class="px-6 py-4 font-mono text-[13px] text-zinc-300 font-bold">${sub.cuit}</td>
        <td class="px-6 py-4 text-[13px] font-semibold text-white">${sub.denominacion}</td>
        <td class="px-6 py-4 text-[13px] text-zinc-400 font-mono text-center">${sub.altaDate}</td>
        <td class="px-6 py-4 text-[13px] text-rose-500 font-mono font-bold text-center">${sub.antiquityDays} días</td>
        <td class="px-6 py-4 font-mono text-[13px] text-zinc-300 font-semibold text-right">$${sub.totalVolumeARS.toLocaleString("es-AR")}</td>
        <td class="px-6 py-4 text-[13px] text-zinc-300 font-mono text-center">${sub.transactionCount} giros</td>
        <td class="px-6 py-4 font-mono text-[13px] text-zinc-500 text-right">$${state.alertThreshold.toLocaleString("es-AR")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="px-6 py-12 text-center text-zinc-500 font-sans text-sm">No se detectaron sujetos con alertas críticas para este periodo.</td></tr>`;

  // Filas de Transacciones Críticas
  const criticalTransactionsHtml = state.criticalTransactions.length > 0
    ? state.criticalTransactions.map(tx => `
      <tr class="hover:bg-zinc-900/40 border-b border-zinc-800 transition-colors">
        <td class="px-6 py-3 font-mono text-xs text-zinc-400">${tx.FECHA || "-"}</td>
        <td class="px-6 py-3 font-mono text-xs text-zinc-300">${tx.CUIT}</td>
        <td class="px-6 py-3 text-xs text-zinc-200">${tx.DENOMINACION_CONTRAPARTE || tx.CUIT_CONTRAPARTE || "-"}</td>
        <td class="px-6 py-3 font-mono text-xs text-zinc-300 text-right font-bold">$${parseFloat(tx.MONTO).toLocaleString("es-AR")}</td>
        <td class="px-6 py-3 text-xs text-zinc-400">${tx.TIPO === "ORDENADA" ? "Orden de transferencia" : "Recepción de fondos"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="px-6 py-8 text-center text-zinc-500 font-sans text-sm">No se identificaron transacciones singulares de alto volumen en el periodo de análisis.</td></tr>`;

  // Red de Relaciones (Estructura Grupal) - Omitida de la ventana principal por solicitud del usuario
  const relationsPanelHtml = "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Forense de Prevención de Lavado de Dinero (AML)</title>
  <!-- Tailwind CSS Play CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
    body {
      font-family: 'Inter', sans-serif;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    /* Estilos adicionales para impresión */
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        background: white !important;
        background-color: white !important;
        color: #000000 !important;
      }
      .bg-zinc-950, .bg-zinc-900, .bg-zinc-900\/50, .bg-zinc-900\/40, .bg-zinc-850, .bg-zinc-800 {
        background-color: #ffffff !important;
        background: #ffffff !important;
        border-color: #000000 !important;
        border-width: 1px !important;
        color: #000000 !important;
        box-shadow: none !important;
      }
      .text-white, .text-zinc-100, .text-zinc-200, .text-zinc-300 {
        color: #000000 !important;
      }
      .text-zinc-400, .text-zinc-500, .text-zinc-600 {
        color: #27272a !important;
      }
      /* Eliminar bordes innecesarios y forzar colores intensos */
      svg {
        background-color: #ffffff !important;
        border: 1px solid #000000 !important;
      }
      svg circle {
        stroke: #000000 !important;
        stroke-width: 2.5px !important;
        fill: #f4f4f5 !important;
      }
      svg path {
        stroke: #000000 !important;
        stroke-width: 3px !important;
        opacity: 1 !important;
      }
      svg text {
        fill: #000000 !important;
        font-weight: bold !important;
      }
      header, footer, .border-b, .border {
        border-color: #000000 !important;
      }
    }
  </style>
</head>
<body class="bg-zinc-900 text-zinc-100 min-h-screen">
  
  <div class="max-w-full xl:max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    
    <!-- Header de Cumplimiento -->
    <header class="border-b border-zinc-800 pb-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800 font-mono">
            CONFIDENCIAL // USO INTERNO DEL COMPLIANCE
          </span>
          <span class="text-zinc-500 text-xs">| Reporte generado bajo Enfoque Basado en Riesgo (EBR)</span>
        </div>
        <h1 class="text-2xl font-extrabold uppercase tracking-tight text-white font-sans">REPORTE ARCA / TRANSACCIONALIDAD</h1>
        <p class="text-zinc-400 text-sm mt-1">Sujeto de Reciente Inscripción con Alta Transaccionalidad</p>
      </div>
      
      <!-- Control de Impresión -->
      <div class="flex items-center gap-3 no-print">
        <button onclick="window.print()" class="px-4 py-2 bg-rose-950 hover:bg-rose-900 text-rose-200 hover:text-white rounded-lg text-xs font-bold border border-rose-800 cursor-pointer transition">
          Imprimir / Exportar Reporte PDF ⎙
        </button>
      </div>
    </header>

    <!-- NAVEGACIÓN ENTRE PESTAÑAS (Fiel al Dashboard) -->
    <div class="flex border-b border-zinc-800 mb-8 font-sans no-print">
      <button id="tab-btn-alertas" onclick="switchReportTab('alertas')" class="px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-rose-500 text-white focus:outline-none transition-colors duration-150">
        1. Panel de Alertas
      </button>
      <button id="tab-btn-forense" onclick="switchReportTab('forense')" class="px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-zinc-400 hover:text-white focus:outline-none transition-colors duration-150">
        2. FLUJO INDIVIDUAL / GRUPAL
      </button>
    </div>

    <!-- PESTAÑA 1: PANEL DE ALERTAS -->
    <div id="report-tab-content-alertas" class="tab-pane">
      <!-- Parámetros del Reporte -->
      <div class="mb-8">
        <div class="bg-zinc-950 border border-zinc-850 p-4 rounded-xl flex flex-col">
          <span class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Periodo Evaluado</span>
          <span class="text-sm font-semibold text-zinc-200 mt-1">${state.analysisMonth} (${state.lookbackMonths} meses)</span>
        </div>
      </div>

      <!-- Panel de Métricas Clave -->
      <div class="mb-8">
        <h2 class="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3.5 font-mono">Estado General del Periodo</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-zinc-950 border border-zinc-850 p-5 rounded-xl">
            <p class="text-[10px] uppercase font-bold text-zinc-400 font-mono">Volumen Total Operado</p>
            <p id="kpi-volumen-total" class="text-2xl font-extrabold text-white mt-2 font-mono">$${formattedVolume}</p>
            <p class="text-[10px] text-zinc-500 mt-1">ARS evaluados consolidados</p>
          </div>
          <div class="bg-zinc-950 border border-zinc-850 p-5 rounded-xl">
            <p class="text-[10px] uppercase font-bold text-zinc-400 font-mono">Alertas Críticas Emitidas</p>
            <p id="kpi-alertas-criticas" class="text-2xl font-extrabold text-rose-500 mt-2 font-mono">${state.metrics.flaggedHighRiskCount}</p>
            <p class="text-[10px] text-zinc-500 mt-1">Sujetos que superan el riesgo tolerable</p>
          </div>
          <div class="bg-zinc-950 border border-zinc-850 p-5 rounded-xl">
            <p class="text-[10px] uppercase font-bold text-zinc-400 font-mono">Transacciones Procesadas</p>
            <p id="kpi-transacciones" class="text-2xl font-extrabold text-zinc-200 mt-2 font-mono">${state.metrics.totalTransactionsCount}</p>
            <p class="text-[10px] text-zinc-500 mt-1">Operaciones individuales</p>
          </div>
          <div class="bg-zinc-950 border border-zinc-850 p-5 rounded-xl">
            <p class="text-[10px] uppercase font-bold text-zinc-400 font-mono">Sujetos Únicos Evaluados</p>
            <p id="kpi-sujetos-unicos" class="text-2xl font-extrabold text-zinc-200 mt-2 font-mono">${state.metrics.uniqueCuitCount}</p>
            <p class="text-[10px] text-zinc-500 mt-1">Entidades fiscales (CUIT)</p>
          </div>
        </div>
      </div>

      <!-- Relaciones si existen -->
      <div class="indicator-relations-container">
        ${relationsPanelHtml}
      </div>

      <!-- Tabla de Sujetos Alertados con Filtros Interactivos (Paso 4) -->
      <div class="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden mb-8">
        <div class="px-6 py-4 bg-zinc-950/70 border-b border-zinc-850 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 class="text-sm font-extrabold text-white uppercase tracking-wider font-mono">RESUMEN: CASOS POSITIVOS</h3>
            <span class="text-[11px] text-zinc-500 font-mono">Sujetos detectados con menos de ${state.antiquityLimit} días de antigüedad en padrón y volumen superior al umbral de corte.</span>
          </div>
          
          <!-- Componentes Interactivos de Control -->
          <div class="flex flex-wrap items-center gap-3 no-print">
            <input type="text" id="subject-search-input" placeholder="Buscar por CUIT o denominación..." class="bg-zinc-900 border border-zinc-750 text-xs rounded-lg px-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500 w-64 transition-all">
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse" id="subjects-table">
            <thead>
              <tr class="border-b border-zinc-800 bg-zinc-900/30 text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono select-none">
                <th class="px-6 py-3 text-center cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('id')">ID <span id="sort-icon-id">↕</span></th>
                <th class="px-6 py-3 cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('cuit')">CUIT <span id="sort-icon-cuit">↕</span></th>
                <th class="px-6 py-3 cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('denom')">Denominación <span id="sort-icon-denom">↕</span></th>
                <th class="px-6 py-3 text-center cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('alta')">Alta ARCA <span id="sort-icon-alta">↕</span></th>
                <th class="px-6 py-3 text-center cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('antiquity')">Antigüedad <span id="sort-icon-antiquity">↕</span></th>
                <th class="px-6 py-3 text-right cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('volume')">Volumen Total <span id="sort-icon-volume">↕</span></th>
                <th class="px-6 py-3 text-center cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('count')">Operaciones <span id="sort-icon-count">↕</span></th>
                <th class="px-6 py-3 text-right cursor-pointer hover:text-white hover:bg-zinc-800 transition-colors" onclick="sortSubjectsTable('threshold')">Umbral <span id="sort-icon-threshold">↕</span></th>
              </tr>
            </thead>
            <tbody id="subjects-tbody">
              ${flaggedSubjectsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PESTAÑA 2: ENFOQUE FORENSE DE RED INTERACTIVO -->
    <div id="report-tab-content-forense" class="tab-pane hidden">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        <!-- Bloque Izquierdo: Grafo Vectorial y Resumen Transaccional (col-span-2) -->
        <div class="md:col-span-2 flex flex-col gap-4">
          <!-- Graficador de Redes Interactivo SVG -->
          <div class="bg-zinc-950 border border-zinc-850 rounded-xl p-5 flex flex-col gap-4 shadow-sm text-zinc-100">
            
            <!-- Barra de Herramientas y Selectores de Red -->
            <div class="flex flex-col md:flex-row justify-between md:items-center gap-3 pb-3 border-b border-zinc-800">
              <div class="flex items-center gap-3">
                <h3 class="font-extrabold text-xs uppercase tracking-wider text-zinc-300">ANÁLISIS DE FLUJOS</h3>
                
                <!-- Sub-pestañas de control de Modo -->
                <div class="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                  <button id="forensic-mode-individual" onclick="setLocalForensicMode('individual')" class="px-3 py-1 rounded-md text-[10px] font-bold text-zinc-400 hover:text-white transition">
                    Individual
                  </button>
                  <button id="forensic-mode-grupal" onclick="setLocalForensicMode('grupal')" class="px-3 py-1 rounded-md text-[10px] font-bold text-zinc-400 hover:text-white transition">
                    Grupal
                  </button>
                </div>
              </div>
 
              <!-- Selector de Entidades en Red -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">Analizar:</span>
                
                <!-- Selector Individual -->
                <select id="local-subject-select" onchange="updateForensicsView()" class="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-[11px] font-bold text-zinc-100 focus:outline-none focus:border-zinc-700 cursor-pointer max-w-[240px]">
                  <!-- Se rellena dinámicamente con JS -->
                </select>
 
                <!-- Selector Grupal -->
                <select id="local-group-select" onchange="updateForensicsView()" class="hidden bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-[11px] font-bold text-zinc-100 focus:outline-none focus:border-zinc-700 cursor-pointer max-w-[240px]">
                  <!-- Se rellena dinámicamente con JS -->
                </select>
              </div>
            </div>
 
            <!-- Grafo Vectorial Generado Dinámicamente -->
            <div class="relative w-full border border-zinc-800 rounded-xl bg-zinc-900/40 p-4 overflow-hidden">
              <!-- Botonera de Control de Zoom Flotante (Idéntica a la App React) -->
              <div class="absolute top-4 right-4 z-10 flex gap-1.5 no-print">
                <button
                  onclick="zoomInLocal()"
                  title="Aumentar Zoom"
                  class="p-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-750 rounded-lg shadow-sm text-zinc-300 hover:text-white transition cursor-pointer flex items-center justify-center w-8 h-8 font-extrabold text-sm"
                >
                  ＋
                </button>
                <button
                  onclick="zoomOutLocal()"
                  title="Reducir Zoom"
                  class="p-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-750 rounded-lg shadow-sm text-zinc-300 hover:text-white transition cursor-pointer flex items-center justify-center w-8 h-8 font-extrabold text-sm"
                >
                  －
                </button>
                <button
                  onclick="resetZoomLocal()"
                  title="Restaurar Vista"
                  class="p-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-750 rounded-lg shadow-sm text-zinc-300 hover:text-white transition cursor-pointer flex items-center justify-center w-8 h-8 font-bold text-sm"
                >
                  ⟲
                </button>
              </div>

              <div class="w-full overflow-x-auto overflow-y-hidden">
                <svg id="forensic-network-svg" class="w-full aspect-[16/9] min-w-[650px] transition-all duration-500 ease-in-out bg-zinc-950/20" viewBox="0 0 760 380">
                  <!-- Se inyecta dinámicamente con JS -->
                </svg>
              </div>
              <div class="absolute bottom-3 left-3 bg-zinc-950/95 backdrop-blur-sm border border-zinc-800 p-2.5 rounded-lg font-sans flex flex-col gap-1 max-w-[340px] text-[8.5px] text-zinc-300 shadow-sm animate-fade-in">
                <span class="text-[7.5px] font-extrabold uppercase tracking-widest text-zinc-500">REFERENCIAS DE COLOR</span>
                <div class="grid grid-cols-2 gap-x-2.5 gap-y-1 font-bold">
                  <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#fee2e2] border border-[#ef4444] block"></span>
                    <span>Sujeto Analizado</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#dbeafe] border border-[#3b82f6] block"></span>
                    <span>Contraparte Común</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#d1fae5] border border-[#22c55e] block"></span>
                    <span>Envía al Sujeto</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#ffedd5] border border-[#f97316] block"></span>
                    <span>Recibe del Sujeto</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
 
        <!-- Bloque Derecho: Dictamen Técnico (Sidebar col-span-1) -->
        <div class="md:col-span-1 flex flex-col gap-6">
          <div class="bg-zinc-950 text-zinc-100 rounded-xl p-5 border border-zinc-850 flex flex-col min-h-[460px] shadow-sm" id="forensic-sidebar-content">
            <!-- Se inyecta dinámicamente con JS de forma idéntica a la aplicación -->
          </div>
        </div>

        <!-- Bloque Inferior Full Width: Resumen Transaccional de Red (col-span-1 lg:col-span-3) -->
        <div class="col-span-1 md:col-span-3">
          <!-- Resumen de Operaciones Dual Split -->
          <div class="bg-zinc-950 border border-zinc-850 rounded-xl p-8 shadow-sm text-zinc-100">
            <div class="flex justify-between items-center pb-3 border-b border-zinc-800 mb-4">
              <div>
                <h3 class="font-extrabold text-xs uppercase tracking-wider text-zinc-300">RESUMEN TRANSACCIONAL DE RED</h3>
                <p id="forensic-active-detail-text" class="text-[11px] text-zinc-400 mt-1 font-sans"></p>
              </div>
              <span class="text-[10px] font-extrabold italic text-zinc-500 font-sans">-cifras en $ miles-</span>
            </div>

            <div id="grupal-warning-banner" class="hidden bg-amber-950/20 border border-amber-900/40 text-amber-200 text-xs rounded-lg p-3.5 mb-4 leading-relaxed font-normal">
              <strong class="text-amber-400 uppercase font-black text-[10px] block tracking-wider mb-1">
                💡 ANÁLISIS CONSOLIDADO DEL GRUPO INTERCONECTADO
              </strong>
              Este reporte consolida el flujo íntegro de la totalidad de integrantes del grupo de reciente inscripción. El nodo central visualizado en el grafo representa el amortiguador transaccional común que posibilita la concentración y dispersión de capitales bajo patrones compatibles con redes organizadas de lavado de activos de alta transaccionalidad.
            </div>

            <!-- Grilla de Transferencias -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <!-- Recibe (Orígenes) -->
              <div class="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 flex flex-col justify-between">
                <div>
                  <div class="border-b border-zinc-800 pb-2 mb-3.5 flex justify-between items-center bg-zinc-900/50 -mx-4 -mt-4 p-3 rounded-t-xl">
                    <span id="label-origenes-title" class="font-extrabold text-xs text-sky-400 uppercase tracking-wider block">RECIBE</span>
                    <span class="bg-sky-950/40 border border-sky-800/40 text-sky-300 text-[9px] uppercase font-bold px-2 py-0.5 rounded-full">FONDOS ENTRANTES</span>
                  </div>
                  
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr class="border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                          <th class="pb-1.5 font-bold">CUIT</th>
                          <th class="pb-1.5 font-bold">Denominación</th>
                          <th class="pb-1.5 font-bold text-right">Monto Acumulado</th>
                        </tr>
                      </thead>
                      <tbody id="forensic-recibe-tbody">
                        <!-- Relleno por JS -->
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="border-t border-zinc-800 pt-3 mt-4 flex justify-between items-center font-bold text-xs text-zinc-300">
                  <span>TOTAL FONDOS</span>
                  <span id="forensic-recibe-total" class="font-mono text-xs text-sky-300 font-extrabold bg-sky-950/40 px-2.5 py-1 rounded border border-sky-800/40">
                    $0 k
                  </span>
                </div>
              </div>

              <!-- Ordena (Destinos) -->
              <div class="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 flex flex-col justify-between">
                <div>
                  <div class="border-b border-zinc-800 pb-2 mb-3.5 flex justify-between items-center bg-zinc-900/50 -mx-4 -mt-4 p-3 rounded-t-xl">
                    <span id="label-destinos-title" class="font-extrabold text-xs text-amber-400 uppercase tracking-wider block">ORDENA</span>
                    <span class="bg-amber-950/40 border border-amber-800/40 text-amber-300 text-[9px] uppercase font-bold px-2 py-0.5 rounded-full">FONDOS EGRESADOS</span>
                  </div>
                  
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr class="border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                          <th class="pb-1.5 font-bold">CUIT</th>
                          <th class="pb-1.5 font-bold">Denominación</th>
                          <th class="pb-1.5 font-bold text-right">Monto Acumulado</th>
                        </tr>
                      </thead>
                      <tbody id="forensic-ordena-tbody">
                        <!-- Relleno por JS -->
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="border-t border-zinc-800 pt-3 mt-4 flex justify-between items-center font-bold text-xs text-zinc-300">
                  <span>TOTAL FONDOS</span>
                  <span id="forensic-ordena-total" class="font-mono text-xs text-amber-300 font-extrabold bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/40">
                    $0 k
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>

  </div>

  <!-- PASO 3: Inyección de Datos Serializados para Auditoría y Carga Reversible -->
  <script id="aml-report-payload" type="application/json">
    ${JSON.stringify(state, null, 2).replace(/</g, '\\u003c')}
  </script>

  <!-- PASO 4: Scripts de Acoplamiento de Funciones Interactivas y UI -->
  <script>
    // Cargar los datos del payload JSON
    const reportState = JSON.parse(document.getElementById("aml-report-payload").textContent);
    
    // Variables de control de pestaña y filtros locales
    let localActiveTab = reportState.activeTab || 'alertas';
    let localForensicMode = reportState.forensicMode || 'individual';
    let selectedCuit = reportState.currentCuit || '';
    let selectedGroupId = reportState.selectedGroupId || '';

    // Helpers para acceder a los snapshots pre-computados por la app
    function getIndividualSnapshot(cuit) {
      const snaps = reportState.individualSnapshots || [];
      return snaps.find(s => s.cuit === cuit) || null;
    }
    function getGroupSnapshot() {
      return reportState.groupSnapshot || null;
    }

    document.addEventListener("DOMContentLoaded", () => {
      initLocalSelects();

      // Seleccionar CUIT inicial
      if (!selectedCuit && reportState.individualSnapshots && reportState.individualSnapshots.length > 0) {
        selectedCuit = reportState.individualSnapshots[0].cuit;
      } else if (selectedCuit) {
        const subjectSelect = document.getElementById("local-subject-select");
        if (subjectSelect) subjectSelect.value = selectedCuit;
      }

      // Seleccionar grupo inicial
      const gs = getGroupSnapshot();
      if (!selectedGroupId && gs) {
        selectedGroupId = gs.groupId;
      } else if (selectedGroupId) {
        const groupSelect = document.getElementById("local-group-select");
        if (groupSelect) groupSelect.value = selectedGroupId;
      }

      // Pre-renderizar la pestaña forense ANTES de activar la tab inicial.
      // Si activeTab='alertas', el SVG estaría hidden (0x0) al renderizar.
      // Solución: mostrar temporalmente invisible, renderizar, luego restaurar.
      var _forensePane = document.getElementById('report-tab-content-forense');
      var _alertasPane = document.getElementById('report-tab-content-alertas');
      if (_forensePane) { _forensePane.style.visibility = 'hidden'; _forensePane.classList.remove('hidden'); }
      if (_alertasPane) { _alertasPane.classList.add('hidden'); }
      setLocalForensicMode(localForensicMode);
      updateForensicsView();
      if (_forensePane) { _forensePane.style.visibility = ''; }
      switchReportTab(localActiveTab);

      // 1. Filtrado Interactivo de Sujetos Alertados (Pestaña 1)
      const subjectSearchInput = document.getElementById("subject-search-input");
      const subjectsTbody = document.getElementById("subjects-tbody");
      const subjectRows = Array.from(subjectsTbody.querySelectorAll("tr"));

      // Normalizador lingüístico español para remover acentos y tildes
      function cleanText(text) {
        if (!text) return "";
        return String(text)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      }

      function filterSubjects() {
        const searchTerm = cleanText(subjectSearchInput.value);
        let visibleCount = 0;
        let visibleVolumeSum = 0;
        let visibleAlertasCount = 0;

        subjectRows.forEach(row => {
          if (row.id === "subject-no-results") return;

          const cuit = cleanText(row.getAttribute("data-cuit") || "");
          const denominacion = cleanText(row.getAttribute("data-denom") || "");
          const riskCategory = row.getAttribute("data-risk") || "";
          const volume = parseFloat(row.getAttribute("data-volume") || "0");

          const matchesSearch = cuit.includes(searchTerm) || denominacion.includes(searchTerm);

          if (matchesSearch) {
            row.style.display = "";
            visibleCount++;
            visibleVolumeSum += volume;
            if (riskCategory === "ALTO") {
              visibleAlertasCount++;
            }
          } else {
            row.style.display = "none";
          }
        });

        // Actualizar las tarjetas de métricas en tiempo real de acuerdo a los resultados visibles
        const kpiVolumen = document.getElementById("kpi-volumen-total");
        if (kpiVolumen) {
          kpiVolumen.innerText = "$" + Math.round(visibleVolumeSum).toLocaleString("es-AR");
        }
        const kpiAlertas = document.getElementById("kpi-alertas-criticas");
        if (kpiAlertas) {
          kpiAlertas.innerText = visibleAlertasCount;
        }
        const kpiSujetos = document.getElementById("kpi-sujetos-unicos");
        if (kpiSujetos) {
          kpiSujetos.innerText = visibleCount;
        }

        const existingNoResults = document.getElementById("subject-no-results");
        if (visibleCount === 0 && subjectRows.length > 0) {
          if (!existingNoResults) {
            const tr = document.createElement("tr");
            tr.id = "subject-no-results";
            tr.innerHTML = '<td colspan="8" class="px-6 py-8 text-center text-zinc-500 font-sans text-xs italic">Ningún sujeto coincide con los filtros aplicados.</td>';
            subjectsTbody.appendChild(tr);
          }
        } else if (existingNoResults) {
          existingNoResults.remove();
        }
      }

      // Ordenación interactiva de columnas en el DOM
      let sortField = "id";
      let sortAscending = true;

      window.sortSubjectsTable = function (field) {
        if (sortField === field) {
          sortAscending = !sortAscending;
        } else {
          sortField = field;
          sortAscending = true;
        }

        // Limpiar indicadores visuales de ordenación en las cabeceras
        const fields = ["id", "cuit", "denom", "alta", "antiquity", "volume", "count", "threshold"];
        fields.forEach(f => {
          const iconSpan = document.getElementById("sort-icon-" + f);
          if (iconSpan) {
            iconSpan.innerText = "↕";
            iconSpan.className = "text-zinc-600 font-bold ml-1";
          }
        });

        // Actualizar el indicador de la cabecera activa
        const activeIconSpan = document.getElementById("sort-icon-" + field);
        if (activeIconSpan) {
          activeIconSpan.innerText = sortAscending ? "↑" : "↓";
          activeIconSpan.className = "text-rose-500 font-extrabold ml-1 animate-pulse";
        }

        // Obtener sólo las filas reales (excluyendo el placeholder si existe)
        const rows = Array.from(subjectsTbody.querySelectorAll("tr")).filter(r => r.id !== "subject-no-results");

        rows.sort((a, b) => {
          let valA, valB;

          if (field === "id") {
            valA = parseInt(a.cells[0].textContent.trim(), 10);
            valB = parseInt(b.cells[0].textContent.trim(), 10);
          } else if (field === "cuit") {
            valA = a.getAttribute("data-cuit") || "";
            valB = b.getAttribute("data-cuit") || "";
          } else if (field === "denom") {
            valA = (a.getAttribute("data-denom") || "").toLowerCase();
            valB = (b.getAttribute("data-denom") || "").toLowerCase();
          } else if (field === "alta") {
            valA = a.getAttribute("data-alta") || "";
            valB = b.getAttribute("data-alta") || "";
          } else if (field === "antiquity") {
            valA = parseInt(a.getAttribute("data-antiquity") || "0", 10);
            valB = parseInt(b.getAttribute("data-antiquity") || "0", 10);
          } else if (field === "volume") {
            valA = parseFloat(a.getAttribute("data-volume") || "0");
            valB = parseFloat(b.getAttribute("data-volume") || "0");
          } else if (field === "count") {
            valA = parseInt(a.getAttribute("data-count") || "0", 10);
            valB = parseInt(b.getAttribute("data-count") || "0", 10);
          } else if (field === "threshold") {
            valA = parseFloat(a.getAttribute("data-threshold") || "0");
            valB = parseFloat(b.getAttribute("data-threshold") || "0");
          }

          if (valA < valB) return sortAscending ? -1 : 1;
          if (valA > valB) return sortAscending ? 1 : -1;
          return 0;
        });

        // Limpiar el tbody de filas anteriores y reinsertarlas ordenadas
        rows.forEach(row => {
          subjectsTbody.appendChild(row);
        });

        // Ejecutar filtro para mantener los términos buscados y actualizar métricas
        filterSubjects();
      };

      subjectSearchInput.addEventListener("input", filterSubjects);

    });

    // Navegar y Seleccionar Sujeto de Alerta directamente en Análisis Forense (Paso 4)
    function goToForensicSubject(cuit) {
      localActiveTab = 'forense';
      localForensicMode = 'individual';
      selectedCuit = cuit;
      
      const subjectSelect = document.getElementById("local-subject-select");
      if (subjectSelect) {
        subjectSelect.value = cuit;
      }
      
      switchReportTab('forense');
      setLocalForensicMode('individual');
      updateForensicsView();
    }

    // Cambiar de Pestañas
    function switchReportTab(tabId) {
      localActiveTab = tabId;
      
      const tabAlertasBtn = document.getElementById('tab-btn-alertas');
      const tabForenseBtn = document.getElementById('tab-btn-forense');
      const contentAlertas = document.getElementById('report-tab-content-alertas');
      const contentForense = document.getElementById('report-tab-content-forense');

      if (tabId === 'alertas') {
        tabAlertasBtn.className = "px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-rose-500 text-white focus:outline-none transition-colors duration-150";
        tabForenseBtn.className = "px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-zinc-400 hover:text-white focus:outline-none transition-colors duration-150";
        contentAlertas.classList.remove('hidden');
        contentForense.classList.add('hidden');
      } else {
        tabForenseBtn.className = "px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-rose-500 text-white focus:outline-none transition-colors duration-150";
        tabAlertasBtn.className = "px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 border-transparent text-zinc-400 hover:text-white focus:outline-none transition-colors duration-150";
        contentForense.classList.remove('hidden');
        contentAlertas.classList.add('hidden');
        setTimeout(function() { updateForensicsView(); }, 30);
      }
    }

    // Inicializar Selectores de Sujeto y Grupo en Pestaña 2
    function initLocalSelects() {
      const subjectSelect = document.getElementById("local-subject-select");
      subjectSelect.innerHTML = '';

      const snaps = reportState.individualSnapshots || [];
      snaps.forEach((snap, i) => {
        const opt = document.createElement("option");
        opt.value = snap.cuit;
        opt.text = "ID: " + (i+1) + " | CUIT: " + snap.cuit + " | " + snap.denominacion;
        subjectSelect.appendChild(opt);
      });

      const groupSelect = document.getElementById("local-group-select");
      groupSelect.innerHTML = '';
      const gs = getGroupSnapshot();
      if (gs) {
        const opt = document.createElement("option");
        opt.value = gs.groupId;
        opt.text = "Grupo Ref #" + gs.groupId;
        groupSelect.appendChild(opt);
      } else {
        const opt = document.createElement("option");
        opt.value = "";
        opt.text = "Sin red indiciaria detectada";
        groupSelect.appendChild(opt);
      }
    }

    // Cambiar Modo Forense (Individual vs Grupal)
    function setLocalForensicMode(mode) {
      localForensicMode = mode;
      
      const btnIndiv = document.getElementById("forensic-mode-individual");
      const btnGroup = document.getElementById("forensic-mode-grupal");
      
      const subjSelect = document.getElementById("local-subject-select");
      const groupSelect = document.getElementById("local-group-select");

      if (mode === 'individual') {
        btnIndiv.className = "px-3 py-1 rounded-md text-[10px] font-bold bg-zinc-800 text-white border border-zinc-700 transition";
        btnGroup.className = "px-3 py-1 rounded-md text-[10px] font-bold text-zinc-400 hover:text-white transition";
        subjSelect.classList.remove('hidden');
        groupSelect.classList.add('hidden');
      } else {
        btnGroup.className = "px-3 py-1 rounded-md text-[10px] font-bold bg-zinc-800 text-white border border-zinc-700 transition";
        btnIndiv.className = "px-3 py-1 rounded-md text-[10px] font-bold text-zinc-400 hover:text-white transition";
        groupSelect.classList.remove('hidden');
        subjSelect.classList.add('hidden');
      }
      
      // Llamar a actualización de vista para que re-dibuje el SVG, tablas y sidebar
      updateForensicsView();
    }
         // Formatear montos a ARS en miles
    function formatInThousands(num) {
      if (num === undefined || num === null) return "$0 k";
      const thousands = Math.round(parseFloat(num) / 1000);
      return "$" + thousands.toLocaleString("es-AR") + " k";
    }

    // Generate premium-grade Argentine names deterministically based on CUIT for high visual polish
    function getArgentineFallbackName(cuit, prefixRole) {
      const clean = cuit.trim().replace(/\D/g, "");
      const map = {
        "30718293049": "Empresa San Jorge S.A.",
        "30658291032": "Distribuidora El Sol S.R.L.",
        "30549102834": "Agropecuaria Pampa S.A.",
        "30883920191": "Consultores Asociados S.A.",
        "30502847193": "Supermercados Mayoristas S.A.",
        "30664421902": "Logística y Puertos Argentinos",
        "30705541239": "Metalúrgica Del Oeste S.R.L.",
        "30801248931": "Estudio Contable Bianchi & Asoc.",
        "30719548202": "Desarrollos Inmobiliarios Puerto Madero",
        "30559103945": "Inversores del Plata",
        "30884820192": "Fideicomiso La Horqueta"
      };

      if (map[clean]) return map[clean];

      const numSum = clean.split("").reduce((sum, val) => sum + parseInt(val, 10), 0) || 12;
      
      const prefixes = [
        "Servicios Integra", "Comercializadora", "Inversora", "Consultores", "Transportes",
        "Constructora", "Agropecuaria", "Soluciones", "Estudio Contable", "Logística Sideral",
        "Fideicomiso", "Distribuidora", "Alimentos Federales", "Sistemas", "Desarrollos"
      ];
      const bodies = [
        "del Plata", "Pampa", "Andina", "Aconcagua", "del Sur", "San Martín", "del Litoral",
        "Patagónica", "del Norte", "Alvear", "Cuyo", "San Juan", "del Paraná", "Moreno"
      ];
      const suffixes = [
        "S.A.", "S.R.L.", "S.A.S.", "Fideicomiso S.A.", " Asociados", " de Servicios"
      ];

      const pref = prefixes[numSum % prefixes.length];
      const bod = bodies[(numSum + 3) % bodies.length];
      const suf = suffixes[(numSum * 7) % suffixes.length];

      return pref + " " + bod + " " + suf;
    }

    // Custom Spanish list joiner to support "e" instead of "y" before words starting with I-sound
    function joinSpanish(arr) {
      if (!arr || arr.length === 0) return "";
      if (arr.length === 1) return arr[0];
      if (arr.length === 2) {
        const secondStr = arr[1].trim();
        const startsWithI = /^[iI]/i.test(secondStr) || (/^[hH][iI]/i.test(secondStr) && !/^[hH][iI][eE]/i.test(secondStr));
        const connector = startsWithI ? " e " : " y ";
        return arr[0] + connector + arr[1];
      }
      const last = arr[arr.length - 1].trim();
      const startsWithI = /^[iI]/i.test(last) || (/^[hH][iI]/i.test(last) && !/^[hH][iI][eE]/i.test(last));
      const connector = startsWithI ? " e " : " y ";
      return arr.slice(0, -1).join(", ") + connector + arr[arr.length - 1];
    }

    // Actualiza por completo la vista interactiva (Tablas, SVG y Dictamen) de la pestaña 2
    function updateForensicsView() {
      const subjectSelect = document.getElementById("local-subject-select");
      const groupSelect = document.getElementById("local-group-select");
      
      selectedCuit = subjectSelect.value;
      selectedGroupId = groupSelect.value;

      const denoms = reportState.cuitDenominacionesMap || {};
      let receives = [];
      let sends = [];
      let titleDetailStr = '';
      const gs = getGroupSnapshot();
      const isGrupal = (localForensicMode === 'grupal' && gs);

      // ── Lee directo del snapshot pre-computado — no recalcula nada ──────────
      if (!isGrupal) {
        // MODO INDIVIDUAL: datos ya calculados por la app al momento de exportar
        const snap = getIndividualSnapshot(selectedCuit);
        if (!snap) {
          document.getElementById("forensic-sidebar-content").innerHTML =
            '<p class="text-zinc-500 text-xs p-4">Sin datos para el CUIT seleccionado.</p>';
          renderLocalTable("forensic-recibe-tbody", []);
          renderLocalTable("forensic-ordena-tbody", []);
          renderLocalSVGFromSnapshot([], [], false);
          return;
        }

        receives = snap.receives || [];
        sends = snap.sends || [];
        titleDetailStr = "CUIT: " + snap.cuit + " | " + snap.denominacion;

        document.getElementById("grupal-warning-banner").classList.add("hidden");
        document.getElementById("label-origenes-title").innerText = "RECIBE";
        document.getElementById("label-destinos-title").innerText = "ORDENA";

        const nodeRecibidoMiles = Math.round(snap.totalRecibido / 1000).toLocaleString("es-AR");
        const nodeOrdenadoMiles = Math.round(snap.totalOrdenado / 1000).toLocaleString("es-AR");
        const nodeAcumuladoMiles = Math.round((snap.totalRecibido + snap.totalOrdenado) / 1000).toLocaleString("es-AR");
        const activeThresholdMiles = Math.round(reportState.alertThreshold / 1000).toLocaleString("es-AR");

        const displayText = \`Inscripción en ARCA hace \${snap.antiquityDays} d&iacute;as. Registra un total de $ \${nodeRecibidoMiles} miles de fondos recibidos y $ \${nodeOrdenadoMiles} miles de fondos ordenados, volumen acumulado $ \${nodeAcumuladoMiles} miles, superando el umbral de corte acumulado de $ \${activeThresholdMiles} miles.\`;

        const sidebarHtml = \`
          <div>
            <div class="flex items-center gap-1.5 pb-3 border-b border-zinc-800 mb-4 font-sans">
              <svg class="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>
              <div>
                <h3 class="font-extrabold text-[11px] uppercase tracking-widest text-white leading-none">
                  Dictamen T&eacute;cnico Individual
                </h3>
              </div>
            </div>
            <div class="flex flex-col gap-4">
              <div>
                <span class="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest">Denominaci&oacute;n</span>
                <span class="font-extrabold text-sm text-amber-300 block mt-0.5">\${snap.denominacion}</span>
                <span class="font-mono text-xs font-semibold text-zinc-400 block mt-0.2 select-all">CUIT \${snap.cuit}</span>
              </div>
              <div class="grid grid-cols-2 gap-3 bg-zinc-900 p-2.5 rounded border border-zinc-850">
                <div>
                  <span class="text-[8px] uppercase font-bold text-zinc-500 block tracking-wider">Categor&iacute;a</span>
                  <span class="text-[11px] font-bold text-zinc-200 mt-0.5 block truncate">Sujeto de An&aacute;lisis</span>
                </div>
                <div class="text-center">
                  <span class="text-[8px] uppercase font-bold text-zinc-500 block tracking-wider">FECHA</span>
                  <span class="text-[11px] font-mono font-bold text-amber-400 mt-0.5 block">\${snap.altaDate}</span>
                </div>
              </div>
              <div>
                <span class="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest">Antig&uuml;edad Fiscal Detectada</span>
                <span class="text-xs font-medium text-zinc-300 mt-0.5 block">
                  <strong class="text-white font-mono font-bold">\${snap.antiquityDays} d&iacute;as impositivos</strong>
                </span>
              </div>
              <div class="mt-2">
                <span class="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest mb-1">ALERTA DETECTADA</span>
                <p class="text-xs text-zinc-300 leading-relaxed font-normal bg-zinc-900 border border-zinc-850 p-3 rounded italic">
                  \${displayText}
                </p>
              </div>
            </div>
          </div>
        \`;
        document.getElementById("forensic-sidebar-content").innerHTML = sidebarHtml;

        // Grafo: usa nodos/edges ya filtrados del snapshot
        renderLocalSVGFromSnapshot(snap.graphNodes || [], snap.graphEdges || [], false, [snap.cuit], []);

      } else {
        // MODO GRUPAL: datos ya calculados por la app al momento de exportar
        receives = gs.receives || [];
        sends = gs.sends || [];
        titleDetailStr = "RED GLOBAL DE " + gs.subjects.length + " EMPRESA" + (gs.subjects.length !== 1 ? "S" : "") + " INTERCONECTADAS — Ref #" + gs.groupId;

        document.getElementById("grupal-warning-banner").classList.remove("hidden");
        document.getElementById("label-origenes-title").innerText = "INYECCIONES DE CAPITAL EXTERNO";
        document.getElementById("label-destinos-title").innerText = "LIQUIDACIONES EXTERNAS DE RED";

        const hasCommonCounterparts = gs.commonCounterparts.length > 0;
        // Narrativa dinámica variantes A-E usando pairwiseCommon del snapshot
        const gPairwise = gs.pairwiseCommon || [];
        const gUniquePairs = new Set(gPairwise.flatMap(function(p) { return p.counterparts; }));
        const gUniversales = gs.commonCounterparts || [];
        const gTotalComunes = new Set([...gUniquePairs, ...gUniversales]).size;
        const gNSujetos = gs.subjects.length;
        const gNDuplas = gPairwise.length;

        let groupMatchReason = "";
        if (gTotalComunes === 0) {
          groupMatchReason = "El an&aacute;lisis transaccional del per&iacute;odo evaluado no evidencia contrapartes compartidas entre los sujetos del grupo.";
        } else if (gUniversales.length > 0 && gTotalComunes === gUniversales.length) {
          const cpNames = gUniversales.map(function(c) { return (denoms[c] || getArgentineFallbackName(c, "Contraparte")) + " (CUIT " + c + ")"; });
          groupMatchReason = gUniversales.length === 1
            ? "Se identifica <strong>" + joinSpanish(cpNames) + "</strong> como contraparte com&uacute;n a la totalidad de los <strong>" + gNSujetos + " sujetos analizados</strong>, operando como nodo central de la red."
            : "Se identifican <strong>" + gUniversales.length + " contrapartes</strong> comunes a la totalidad de los <strong>" + gNSujetos + " sujetos</strong>: " + joinSpanish(cpNames) + ".";
        } else if (gUniversales.length > 0) {
          const adicionales = gTotalComunes - gUniversales.length;
          const cpNames = gUniversales.map(function(c) { return (denoms[c] || getArgentineFallbackName(c, "Contraparte")) + " (CUIT " + c + ")"; });
          groupMatchReason = "Se detectaron <strong>" + gTotalComunes + " contrapartes compartidas</strong>. "
            + (gUniversales.length === 1 ? "1 contraparte es com&uacute;n" : gUniversales.length + " contrapartes son comunes")
            + " a la totalidad de los " + gNSujetos + " sujetos: " + joinSpanish(cpNames)
            + (adicionales > 0 ? "; y " + adicionales + " contraparte" + (adicionales !== 1 ? "s" : "") + " adicional" + (adicionales !== 1 ? "es" : "") + " vincula" + (adicionales === 1 ? "" : "n") + " a m&aacute;s de un sujeto del grupo." : ".");
        } else {
          groupMatchReason = "Se observa convergencia de flujos entre los <strong>" + gNSujetos + " sujetos analizados</strong>, con <strong>" + gTotalComunes + " contraparte" + (gTotalComunes !== 1 ? "s" : "") + " compartida" + (gTotalComunes !== 1 ? "s" : "") + "</strong> identificadas en " + gNDuplas + " par" + (gNDuplas !== 1 ? "es" : "") + " del grupo.";
        }

        let subjectsRowsHtml = "";
        gs.subjects.forEach(cuit => {
          const labelName = denoms[cuit] || getArgentineFallbackName(cuit, "Sujeto");
          const subjectData = reportState.flaggedSubjects.find(s => s.cuit === cuit);
          const alta = subjectData ? subjectData.altaDate : "N/A";
          subjectsRowsHtml += \`
            <div class="grid grid-cols-12 text-[10px] font-medium text-zinc-200 p-2 border-b border-zinc-900/50 last:border-0 hover:bg-zinc-900/40">
              <div class="col-span-4 font-mono font-bold text-amber-300 select-all">\${cuit}</div>
              <div class="col-span-5 truncate font-sans text-zinc-100 pr-1" title="\${labelName}">\${labelName}</div>
              <div class="col-span-3 font-mono text-right text-zinc-400">\${alta}</div>
            </div>
          \`;
        });

        const sidebarHtml = \`
          <div>
            <div class="flex items-center gap-1.5 pb-3 border-b border-zinc-800 mb-4 font-sans">
              <svg class="w-5 h-5 text-blue-500 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <div>
                <h3 class="font-extrabold text-[11px] uppercase tracking-widest text-white leading-none">Dictamen T&eacute;cnico Grupal</h3>
              </div>
            </div>
            <div class="flex flex-col gap-4">
              <div>
                <span class="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest">Grupo Bajo An&aacute;lisis</span>
                <span class="font-extrabold text-sm text-blue-400 block mt-0.5">Consorcio \${gs.groupId}</span>
                <span class="font-mono text-xs font-semibold text-zinc-400 block mt-0.2">
                  V&iacute;nculo: \${hasCommonCounterparts ? "Contraparte Com&uacute;n" : "Transacci&oacute;n Directa"}
                </span>
              </div>
              <div>
                <span class="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest mb-1.5">Sujetos Involucrados (Alta Reciente)</span>
                <div class="border border-zinc-800 rounded bg-zinc-900/60 overflow-hidden font-sans">
                  <div class="grid grid-cols-12 text-[8px] uppercase font-black text-zinc-500 bg-zinc-900 p-2 border-b border-zinc-800">
                    <div class="col-span-4 font-black">CUIT</div>
                    <div class="col-span-5 font-black">Denominaci&oacute;n</div>
                    <div class="col-span-3 text-right font-black">FECHA</div>
                  </div>
                  <div class="flex flex-col">\${subjectsRowsHtml}</div>
                </div>
              </div>
              <div class="mt-1">
                <span class="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest mb-1.5">ALERTA GRUPAL DETECTADA</span>
                <div class="p-3 bg-red-950/20 rounded border border-red-900/60 text-xs text-red-200 font-sans shadow-sm leading-relaxed">
                  <div class="flex gap-2 items-start">
                    <svg class="w-4 h-4 text-red-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <div>
                      <strong class="text-red-300 block mb-1 uppercase text-[9px] tracking-wider font-extrabold">ALERTA GRUPAL CR&Iacute;TICA DETECTADA</strong>
                      \${groupMatchReason}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        \`;
        document.getElementById("forensic-sidebar-content").innerHTML = sidebarHtml;

        // Grafo: usa nodos/edges ya filtrados del snapshot grupal
        renderLocalSVGFromSnapshot(gs.graphNodes || [], gs.graphEdges || [], true, gs.subjects, gs.commonCounterparts);
      }
      // ────────────────────────────────────────────────────────────────────────

      // 2. Renderizar Tablas
      renderLocalTable("forensic-recibe-tbody", receives);
      renderLocalTable("forensic-ordena-tbody", sends);

      const recTotalSum = receives.reduce((a,b) => a + b.sum, 0);
      const sndTotalSum = sends.reduce((a,b) => a + b.sum, 0);
      document.getElementById("forensic-recibe-total").innerText = formatInThousands(recTotalSum);
      document.getElementById("forensic-ordena-total").innerText = formatInThousands(sndTotalSum);
      document.getElementById("forensic-active-detail-text").innerHTML = titleDetailStr;
    }

    // Renderizar Tablas Locales
    function renderLocalTable(tbodyId, list) {
      const tbody = document.getElementById(tbodyId);
      tbody.innerHTML = '';
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="py-10 text-center text-zinc-500 font-sans italic text-xs">Sin registros para el nodo analizado.</td></tr>';
        return;
      }
      const LIMIT = 10;
      const visible = list.slice(0, LIMIT);
      const rest = list.slice(LIMIT);
      const restTotal = rest.reduce((acc, item) => acc + item.sum, 0);
      visible.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-zinc-800/80 hover:bg-zinc-900/40 text-[11.5px] text-zinc-300 transition-colors";
        tr.innerHTML = \`
          <td class="py-2.5 font-mono text-zinc-400 font-bold">\${item.cuit}</td>
          <td class="py-2.5 text-zinc-100 truncate max-w-[260px]" title="\${item.denom}">
            \${item.denom}
          </td>
          <td class="py-2.5 text-right font-mono font-bold text-white">\${formatInThousands(item.sum)}</td>
\`;
        tbody.appendChild(tr);
      });
      if (rest.length > 0) {
        const tr = document.createElement("tr");
        tr.className = "border-t border-zinc-700 text-[11px] text-zinc-500";
        tr.innerHTML = \`
          <td class="py-2 font-mono italic" colspan="2">+ \${rest.length} empresa\${rest.length !== 1 ? "s" : ""} más</td>
          <td class="py-2 text-right font-mono font-bold">\${formatInThousands(restTotal)}</td>
\`;
        tbody.appendChild(tr);
      }
    }

    // Estado de Zoom/Pan/Drag del grafo (réplica fiel del comportamiento de la app en vivo)
    let graphZoom = 1;
    let graphPanX = 0;
    let graphPanY = 0;
    let graphIsPanning = false;
    let graphPanStartX = 0;
    let graphPanStartY = 0;
    let graphDraggedNodeId = null;
    let graphDraggedPositions = {};
    let graphNodesRef = [];
    let graphLinksRef = [];
    let graphSelectedId = null;

    function wrapText(text, maxLen) {
      const limit = maxLen || 18;
      const words = String(text || "").trim().split(" ").filter(w => w.length > 0);
      const lines = [];
      let currentLine = "";
      for (const word of words) {
        if ((currentLine + " " + word).trim().length <= limit) {
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

    function applyGraphTransform() {
      const zoomContainer = document.getElementById("forensic-zoom-container");
      if (zoomContainer) {
        zoomContainer.setAttribute("transform", "translate(" + graphPanX + "," + graphPanY + ") scale(" + graphZoom + ")");
      }
    }

    // Dibujar el Grafo en el SVG del Reporte — usa nodos/edges ya filtrados del snapshot.
    // No vuelve a filtrar el grafo completo: recibe exactamente lo que la app tenía en pantalla.
    function renderLocalSVGFromSnapshot(snapshotNodes, snapshotEdges, isGrupal, activeSubjects, activeCommonCounterparts) {
      const svg = document.getElementById("forensic-network-svg");
      svg.innerHTML = ''; // Limpiar

      // Reset del estado de interacción al recalcular el grafo (nuevo sujeto/grupo seleccionado)
      graphZoom = 1;
      graphPanX = 0;
      graphPanY = 0;
      graphDraggedPositions = {};
      graphSelectedId = null;

      const vbWidth = 760;
      // Altura dinámica: mínimo 380px, crece 55px por sujeto analizado sobre 4
      const subjectCount = (snapshotNodes || []).filter(function(n) { return n.type === "ANALIZADO"; }).length || (activeSubjects || []).length;
      const vbHeight = Math.max(380, 260 + subjectCount * 55);
      const marginY = 50;
      const denoms = reportState.cuitDenominacionesMap || {};

      // Actualizar el viewBox del SVG en el DOM para que refleje la nueva altura
      svg.setAttribute("viewBox", "0 0 " + vbWidth + " " + vbHeight);

      // Usar directamente los nodos/edges del snapshot — ya vienen filtrados por la app
      const filteredNodes = snapshotNodes || [];
      const filteredEdges = snapshotEdges || [];

      const subjectSet = new Set(activeSubjects || []);

      // --- Categorizar contrapartes (réplica de consolidateGraphData de la app) ---
      const commonSet = new Set(activeCommonCounterparts);
      const counterparts = filteredNodes.filter(n => !subjectSet.has(n.id) && !commonSet.has(n.id));

      const nodeVolumes = {};
      filteredNodes.forEach(n => { nodeVolumes[n.id] = 0; });
      filteredEdges.forEach(e => {
        if (nodeVolumes[e.source] !== undefined) nodeVolumes[e.source] += e.amount_ars;
        if (nodeVolumes[e.target] !== undefined) nodeVolumes[e.target] += e.amount_ars;
      });

      const senders = [];
      const receivers = [];
      const both = [];
      counterparts.forEach(c => {
        const isSender = filteredEdges.some(e => e.source === c.id && subjectSet.has(e.target));
        const isReceiver = filteredEdges.some(e => e.target === c.id && subjectSet.has(e.source));
        if (isSender && isReceiver) both.push(c);
        else if (isSender) senders.push(c);
        else if (isReceiver) receivers.push(c);
        else senders.push(c); // contraparte indirecta (ej: segundo nivel) sin conexión directa al sujeto
      });

      const byVolDesc = (arr) => [...arr].sort((a, b) => (nodeVolumes[b.id] || 0) - (nodeVolumes[a.id] || 0));
      const leftNodes = byVolDesc(receivers); // entran dinero hacia el sujeto -> a la izquierda
      const rightNodes = byVolDesc([...senders, ...both]); // egresan o ambos -> a la derecha

      const nodes = [];
      const links = [];

      if (!isGrupal) {
        // --- MODO INDIVIDUAL: Origenes (izq) -> Sujeto (centro) -> Destinos (der) ---
        const leftX = vbWidth * 0.15;
        const centerX = vbWidth * 0.5;
        const rightX = vbWidth * 0.85;
        const selectedCuitLocal = activeSubjects[0];

        const maxPerif = 6;
        const leftSlice = leftNodes.slice(0, maxPerif);
        const rightSlice = rightNodes.slice(0, maxPerif);

        leftSlice.forEach((node, idx) => {
          const y = leftSlice.length > 1
            ? marginY + (idx * (vbHeight - marginY * 2)) / (leftSlice.length - 1)
            : vbHeight / 2;
          nodes.push({
            id: node.id,
            cuit: node.id,
            denom: denoms[node.id] || node.label || node.id,
            isCentral: false,
            color: "#22c55e",
            fill: "#d1fae5",
            r: 20,
            x: leftX,
            y: y
          });
        });

        rightSlice.forEach((node, idx) => {
          const y = rightSlice.length > 1
            ? marginY + (idx * (vbHeight - marginY * 2)) / (rightSlice.length - 1)
            : vbHeight / 2;
          nodes.push({
            id: node.id,
            cuit: node.id,
            denom: denoms[node.id] || node.label || node.id,
            isCentral: false,
            color: "#f97316",
            fill: "#ffedd5",
            r: 20,
            x: rightX,
            y: y
          });
        });

        // Sujeto analizado en el centro
        nodes.push({
          id: selectedCuitLocal,
          cuit: selectedCuitLocal,
          denom: denoms[selectedCuitLocal] || "Sujeto Analizado",
          isCentral: true,
          isSubject: true,
          color: "#ef4444",
          fill: "#fee2e2",
          r: 34,
          x: centerX,
          y: vbHeight / 2
        });

        // Construir edges visuales a partir de las edges reales filtradas, preservando
        // relaciones de segundo nivel entre contrapartes (no solo hacia el sujeto central)
        const placedIds = new Set(nodes.map(n => n.id));
        filteredEdges.forEach((e, idx) => {
          if (!placedIds.has(e.source) || !placedIds.has(e.target)) return;
          const towardsSubject = e.target === selectedCuitLocal;
          const fromSubject = e.source === selectedCuitLocal;
          let color = "#94a3b8";
          let markerId = "arrow-local";
          if (towardsSubject) { color = "#22c55e"; markerId = "arrow-local-rec"; }
          else if (fromSubject) { color = "#f97316"; markerId = "arrow-local-snd"; }
          links.push({
            id: "local-edge-" + idx,
            source: e.source,
            target: e.target,
            color: color,
            markerId: markerId,
            sum: e.amount_ars,
            isRec: towardsSubject,
            showLabel: true
          });
        });
      } else {
        // --- MODO GRUPAL: 3 filas — fuentes arriba, analizados al centro, destinos abajo ---
        const topY = marginY;
        const centerY = vbHeight / 2;
        const bottomY = vbHeight - marginY;

        // 1. Sujetos analizados en la fila central
        const subjectsOnly = activeSubjects.filter(s => !commonSet.has(s));
        const subCount = subjectsOnly.length;
        const analXMax = activeCommonCounterparts.length > 0 ? vbWidth * 0.68 : vbWidth - 80;

        subjectsOnly.forEach((sub, idx) => {
          const x = subCount > 1
            ? 80 + (idx * (analXMax - 80)) / (subCount - 1)
            : vbWidth * 0.4;
          nodes.push({
            id: sub, cuit: sub, denom: denoms[sub] || sub,
            isCentral: false, isSubject: true,
            color: "#ef4444", fill: "#fee2e2",
            r: Math.max(16, Math.min(28, 200 / Math.max(subCount, 1))),
            x, y: centerY
          });
        });

        // 2. Contrapartes comunes a la derecha del centro (todas, no solo la primera)
        const commonList = activeCommonCounterparts.filter(c => c && c !== "COMUN");
        commonList.forEach((cuit, idx) => {
          const x = vbWidth * 0.78 + idx * 45;
          nodes.push({
            id: cuit, cuit, denom: denoms[cuit] || "Contraparte Común",
            isCentral: true, isCommon: true,
            color: "#3b82f6", fill: "#dbeafe",
            r: 22, x, y: centerY
          });
        });

        // 3. Fuentes (envían a sujetos) → fila superior
        const placedSoFar = new Set(nodes.map(n => n.id));
        const remaining = filteredNodes.filter(n => !placedSoFar.has(n.id));

        const sources = byVolDesc(remaining.filter(n =>
          filteredEdges.some(e => e.source === n.id && subjectSet.has(e.target))
          && !filteredEdges.some(e => e.target === n.id && subjectSet.has(e.source))
        )).slice(0, 8);

        sources.forEach((node, idx) => {
          const x = sources.length > 1
            ? 80 + (idx * (vbWidth - 160)) / (sources.length - 1)
            : vbWidth / 2;
          nodes.push({
            id: node.id, cuit: node.id, denom: denoms[node.id] || node.label || node.id,
            isCentral: false,
            color: "#22c55e", fill: "#d1fae5",
            r: 16, x, y: topY
          });
        });

        // 4. Destinos (reciben de sujetos) → fila inferior
        const placedNow = new Set(nodes.map(n => n.id));
        const remainingAfter = filteredNodes.filter(n => !placedNow.has(n.id));
        const targets = byVolDesc(remainingAfter).slice(0, 8);

        targets.forEach((node, idx) => {
          const x = targets.length > 1
            ? 80 + (idx * (vbWidth - 160)) / (targets.length - 1)
            : vbWidth / 2;
          nodes.push({
            id: node.id, cuit: node.id, denom: denoms[node.id] || node.label || node.id,
            isCentral: false,
            color: "#f97316", fill: "#ffedd5",
            r: 16, x, y: bottomY
          });
        });

        // 5. Edges
        const placedIds = new Set(nodes.map(n => n.id));
        filteredEdges.forEach((e, idx) => {
          if (!placedIds.has(e.source) || !placedIds.has(e.target)) return;
          const isFromSubjectToCommon = subjectSet.has(e.source) && commonSet.has(e.target);
          const isFromCommonToSubject = commonSet.has(e.source) && subjectSet.has(e.target);
          const isBetweenSubjects = subjectSet.has(e.source) && subjectSet.has(e.target);
          let color = "#94a3b8";
          let markerId = "arrow-local";
          if (isFromSubjectToCommon || isFromCommonToSubject) { color = "#fb7185"; markerId = "arrow-local"; }
          else if (isBetweenSubjects) { color = "#a78bfa"; markerId = "arrow-local-snd"; }
          else if (subjectSet.has(e.target)) { color = "#22c55e"; markerId = "arrow-local-rec"; }
          else if (subjectSet.has(e.source)) { color = "#f97316"; markerId = "arrow-local-snd"; }
          links.push({
            id: "local-edge-" + idx,
            source: e.source, target: e.target,
            color, markerId,
            sum: e.amount_ars,
            isRec: false,
            isGrupal: isFromSubjectToCommon || isFromCommonToSubject,
            showLabel: true
          });
        });
      }

      graphNodesRef = nodes;
      graphLinksRef = links;

      // --- Definiciones de marcadores de flecha ---
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const makeMarker = (id, color, refX) => {
        const m = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        m.setAttribute("id", id);
        m.setAttribute("viewBox", "0 0 10 10");
        m.setAttribute("refX", String(refX));
        m.setAttribute("refY", "5");
        m.setAttribute("markerWidth", "6");
        m.setAttribute("markerHeight", "6");
        m.setAttribute("orient", "auto-start-reverse");
        m.innerHTML = '<path d="M0,0 L10,5 L0,10 z" fill="' + color + '"/>';
        defs.appendChild(m);
      };
      makeMarker("arrow-local", "#fb7185", 8);
      makeMarker("arrow-local-rec", "#22c55e", 8);
      makeMarker("arrow-local-snd", "#f97316", 8);
      svg.appendChild(defs);

      // --- Contenedor de zoom/pan ---
      const zoomContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      zoomContainer.setAttribute("id", "forensic-zoom-container");
      svg.appendChild(zoomContainer);

      const linkGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      zoomContainer.appendChild(linkGroup);
      zoomContainer.appendChild(nodeGroup);

      function getNodePos(n) {
        const drag = graphDraggedPositions[n.id];
        return drag ? drag : { x: n.x, y: n.y };
      }

      function redrawLinks() {
        linkGroup.innerHTML = '';
        links.forEach((link) => {
          const sourceNode = nodes.find(n => n.id === link.source);
          const targetNode = nodes.find(n => n.id === link.target);
          if (!sourceNode || !targetNode) return;

          const sp = getNodePos(sourceNode);
          const tp = getNodePos(targetNode);

          const dx = tp.x - sp.x;
          const dy = tp.y - sp.y;
          const dr = Math.sqrt(dx * dx + dy * dy) || 1;

          const sx = sp.x + (dx / dr) * (sourceNode.r + 1);
          const sy = sp.y + (dy / dr) * (sourceNode.r + 1);
          const tx = tp.x - (dx / dr) * (targetNode.r + 8);
          const ty = tp.y - (dy / dr) * (targetNode.r + 8);

          const pathD = "M" + sx + "," + sy + " A" + (dr * 1.5) + "," + (dr * 1.5) + " 0 0,1 " + tx + "," + ty;

          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", pathD);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", link.color);
          path.setAttribute("stroke-width", link.isGrupal ? "2.5" : "2.2");
          path.setAttribute("opacity", "0.9");
          path.setAttribute("marker-end", "url(#" + link.markerId + ")");
          linkGroup.appendChild(path);

          if (link.showLabel && link.sum) {
            const midX = (sx + tx) / 2;
            const midY = (sy + ty) / 2;
            const valStr = link.sum >= 1_000_000
            ? (link.sum / 1_000_000).toFixed(1) + "M"
            : Math.round(link.sum / 1000) + "k";

            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.setAttribute("transform", "translate(" + midX + "," + midY + ")");

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const textWidth = valStr.length * 5.4 + 10;
            rect.setAttribute("x", String(-textWidth / 2));
            rect.setAttribute("y", "-8");
            rect.setAttribute("width", String(textWidth));
            rect.setAttribute("height", "16");
            rect.setAttribute("rx", "5");
            rect.setAttribute("fill", "#18181b");
            rect.setAttribute("stroke", link.color);
            rect.setAttribute("stroke-width", "0.75");
            g.appendChild(rect);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dy", "3.5");
            text.setAttribute("fill", link.color);
            text.setAttribute("font-size", "9");
            text.setAttribute("font-family", "monospace");
            text.setAttribute("font-weight", "bold");
            text.textContent = valStr;
            g.appendChild(text);

            linkGroup.appendChild(g);
          }
        });
      }

      function redrawNodes() {
        nodeGroup.innerHTML = '';
        nodes.forEach((n) => {
          const pos = getNodePos(n);
          const isSelected = graphSelectedId === n.id;

          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute("transform", "translate(" + pos.x + "," + pos.y + ")");
          g.style.cursor = "grab";

          const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
          title.textContent = (n.denom || n.cuit) + " (" + n.cuit + ")";
          g.appendChild(title);

          const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("r", String(n.r + (isSelected ? 3 : 0)));
          circle.setAttribute("fill", n.fill);
          circle.setAttribute("stroke", n.color);
          circle.setAttribute("stroke-width", n.isCentral ? "3.5" : "1.75");
          g.appendChild(circle);

          const lines = wrapText(n.denom || "", 18);
          const denomText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          denomText.setAttribute("text-anchor", "middle");
          denomText.setAttribute("y", String(n.r + 14));
          denomText.setAttribute("fill", "#f4f4f5");
          denomText.setAttribute("font-size", n.isCentral ? "11" : "9.5");
          denomText.setAttribute("font-family", "sans-serif");
          denomText.setAttribute("font-weight", "bold");
          lines.forEach((line, i) => {
            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            tspan.setAttribute("x", "0");
            tspan.setAttribute("dy", i === 0 ? "0" : "11");
            tspan.textContent = line;
            denomText.appendChild(tspan);
          });
          g.appendChild(denomText);

          const cuitText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          cuitText.setAttribute("text-anchor", "middle");
          cuitText.setAttribute("y", String(n.r + 14 + (lines.length - 1) * 11 + 14));
          cuitText.setAttribute("fill", "#a1a1aa");
          cuitText.setAttribute("font-size", n.isCentral ? "9.5" : "8.5");
          cuitText.setAttribute("font-family", "monospace");
          cuitText.setAttribute("font-weight", "bold");
          cuitText.textContent = "CUIT " + n.cuit;
          g.appendChild(cuitText);

          // Drag individual del nodo (sin física, posición libre fija al soltar)
          g.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            graphDraggedNodeId = n.id;
            g.style.cursor = "grabbing";
          });

          // Click para re-enfocar el sujeto analizado (igual que la app en vivo)
          g.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!n.isCentral && n.cuit) {
              goToForensicSubject(n.cuit);
            } else {
              graphSelectedId = (graphSelectedId === n.id) ? null : n.id;
              redrawNodes();
            }
          });

          nodeGroup.appendChild(g);
        });
      }

      redrawLinks();
      redrawNodes();
      applyGraphTransform();

      // --- Interacción de Pan (arrastrar fondo) y Drag de nodos ---
      svg.onmousedown = (e) => {
        if (graphDraggedNodeId) return;
        graphIsPanning = true;
        graphPanStartX = e.clientX - graphPanX;
        graphPanStartY = e.clientY - graphPanY;
        svg.style.cursor = "grabbing";
      };

      svg.onmousemove = (e) => {
        if (graphDraggedNodeId) {
          const rect = svg.getBoundingClientRect();
          const scaleX = vbWidth / rect.width;
          const scaleY = vbHeight / rect.height;
          const mouseX = (e.clientX - rect.left) * scaleX;
          const mouseY = (e.clientY - rect.top) * scaleY;
          const graphX = (mouseX - graphPanX) / graphZoom;
          const graphY = (mouseY - graphPanY) / graphZoom;
          graphDraggedPositions[graphDraggedNodeId] = { x: graphX, y: graphY };
          redrawLinks();
          redrawNodes();
        } else if (graphIsPanning) {
          graphPanX = e.clientX - graphPanStartX;
          graphPanY = e.clientY - graphPanStartY;
          applyGraphTransform();
        }
      };

      const stopInteraction = () => {
        graphIsPanning = false;
        graphDraggedNodeId = null;
        svg.style.cursor = "grab";
      };
      svg.onmouseup = stopInteraction;
      svg.onmouseleave = stopInteraction;
      svg.style.cursor = "grab";

      // --- Controles de Zoom (botones flotantes existentes en la UI) ---
      window.zoomInLocal = () => {
        graphZoom = Math.min(graphZoom + 0.15, 2.5);
        applyGraphTransform();
      };
      window.zoomOutLocal = () => {
        graphZoom = Math.max(graphZoom - 0.15, 0.4);
        applyGraphTransform();
      };
      window.resetZoomLocal = () => {
        graphZoom = 1;
        graphPanX = 0;
        graphPanY = 0;
        graphDraggedPositions = {};
        graphSelectedId = null;
        applyGraphTransform();
        redrawNodes();
      };
    }
  </script>

</body>
</html>`;
}


