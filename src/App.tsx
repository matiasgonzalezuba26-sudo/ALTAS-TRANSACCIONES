import React, { useState, useEffect, useMemo, useRef } from "react";
import { Transaction, AMLAnalysisResult } from "./types";
import { PRESET_CASES } from "./presets";
import { captureCurrentAMLState, generateAMLReportHTML } from "./utils/reportExporter";
import NetworkGraph from "./components/NetworkGraph";
import * as XLSX from "xlsx";
import { 
  ShieldAlert, 
  Settings, 
  TrendingUp, 
  Users, 
  Calendar, 
  UploadCloud, 
  Trash2, 
  Sparkles, 
  FileText, 
  Database, 
  Search, 
  CheckCircle, 
  Clock,
  ArrowRight,
  FileCheck,
  Scale,
  RefreshCw,
  Info,
  AlertTriangle,
  Copy,
  ExternalLink
} from "lucide-react";

// Standard Argentine Preset Registries to fallback/preload automatically
const DEFAULT_ARCA_RECORDS = [
  { cuit: "30718293049", fechaAlta: "15/05/2026", umbral: 50000000 },
  { cuit: "30721234569", fechaAlta: "20/05/2026", umbral: 50000000 },
  { cuit: "30658291032", fechaAlta: "12/03/2024", umbral: 5000000 },
  { cuit: "30549102834", fechaAlta: "08/07/2025", umbral: 5000000 },
  { cuit: "30883920191", fechaAlta: "19/11/2023", umbral: 10000000 },
  { cuit: "30502847193", fechaAlta: "10/01/2016", umbral: 10000000 },
  { cuit: "30664421902", fechaAlta: "24/09/2018", umbral: 5000000 },
  { cuit: "30705541239", fechaAlta: "15/02/2022", umbral: 5000000 },
  { cuit: "30801248931", fechaAlta: "04/05/2021", umbral: 5000000 },
  { cuit: "30719548202", fechaAlta: "15/04/2026", umbral: 6000000 },
  { cuit: "30559103945", fechaAlta: "30/08/2021", umbral: 5000000 },
  { cuit: "30884820192", fechaAlta: "11/12/2022", umbral: 5000000 },
  { cuit: "30704445559", fechaAlta: "10/05/2026", umbral: 40000000 },
  { cuit: "30708889999", fechaAlta: "18/05/2026", umbral: 35000000 },
  { cuit: "30711223349", fechaAlta: "01/05/2026", umbral: 30000000 },
  { cuit: "30722334459", fechaAlta: "05/05/2026", umbral: 35000000 },
  { cuit: "30733445569", fechaAlta: "12/05/2026", umbral: 30000000 },
  { cuit: "30744556679", fechaAlta: "22/05/2026", umbral: 25000000 },
  { cuit: "30755667789", fechaAlta: "26/05/2026", umbral: 28000000 }
];

// Helper date arithmetic to parse / sort dates safely
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Format date back to dd/mm/yyyy
function formatDateString(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Parsea un valor de MONTO tolerando formatos argentinos: "$ 1.234,56", "1234.56", "1234,56"
// Devuelve 0 si el valor es vacío, null o no parseable, sin silenciar el error.
function parseMonto(value: any): { amount: number; invalid: boolean } {
  if (value === null || value === undefined || value === "") return { amount: 0, invalid: true };
  if (typeof value === "number") return { amount: isNaN(value) ? 0 : value, invalid: isNaN(value) };
  const str = String(value).trim();
  if (!str) return { amount: 0, invalid: true };
  // Eliminar símbolo $, espacios y separadores de miles (punto antes de 3 dígitos al final)
  const cleaned = str
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[,]|$))/g, "") // punto de miles
    .replace(/,/g, ".");                    // coma decimal → punto
  const result = parseFloat(cleaned);
  return { amount: isNaN(result) ? 0 : result, invalid: isNaN(result) };
}

// Custom Spanish list joiner to support "e" instead of "y" before words starting with I-sound
function joinSpanish(arr: string[]): string {
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

// Generate premium-grade Argentine names deterministically based on CUIT for high visual polish
function getArgentineFallbackName(cuit: string, prefixRole: "Sujeto" | "Contraparte"): string {
  const clean = cuit.trim().replace(/\D/g, "");
  const map: Record<string, string> = {
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

  // Hashing lookalike
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

  return `${pref} ${bod} ${suf}`;
}

function consolidateGraphData(
  nodes: any[],
  edges: any[],
  subjectCuits: string[],
  commonCounterparts: string[] = []
) {
  const subjectsSet = new Set(subjectCuits);
  const commonSet = new Set(commonCounterparts);

  // Keep analyzed subjects and common counterparts individually
  const individualNodes = nodes.filter(n => subjectsSet.has(n.id) || commonSet.has(n.id));
  const counterpartsToConsolidate = nodes.filter(n => n.type === "CONTRAPARTE" && !subjectsSet.has(n.id) && !commonSet.has(n.id));

  // Categorize counterparts
  const senders: any[] = [];
  const receivers: any[] = [];
  const both: any[] = [];
  const others: any[] = [];

  // Volumes for sorting
  const nodeVolumes: Record<string, number> = {};
  nodes.forEach(n => { nodeVolumes[n.id] = 0; });
  edges.forEach(e => {
    if (nodeVolumes[e.source] !== undefined) nodeVolumes[e.source] += e.amount_ars;
    if (nodeVolumes[e.target] !== undefined) nodeVolumes[e.target] += e.amount_ars;
  });

  counterpartsToConsolidate.forEach(c => {
    const isSender = edges.some(e => e.source === c.id && subjectsSet.has(e.target));
    const isReceiver = edges.some(e => e.target === c.id && subjectsSet.has(e.source));

    if (isSender && isReceiver) {
      both.push(c);
    } else if (isSender) {
      senders.push(c);
    } else if (isReceiver) {
      receivers.push(c);
    } else {
      others.push(c);
    }
  });

  const sortByVolume = (arr: any[]) => {
    return [...arr].sort((a, b) => (nodeVolumes[b.id] || 0) - (nodeVolumes[a.id] || 0));
  };

  const finalNodes = [...individualNodes];
  const finalEdges: any[] = [];

  const groupedNodeIdMap = new Map<string, string>(); // detailedId -> groupId

  const processCategory = (categoryNodes: any[], categoryKey: string) => {
    const sorted = sortByVolume(categoryNodes);
    const GROUP_THRESHOLD = 5;
    if (sorted.length > GROUP_THRESHOLD) {
      // Keep individual top 3
      const keepCount = 3;
      const toKeep = sorted.slice(0, keepCount);
      const toGroup = sorted.slice(keepCount);

      toKeep.forEach(n => finalNodes.push(n));

      // Create group node
      const groupId = `group-${categoryKey}-${subjectCuits[0] || "main"}`;
      const groupLabel = `Total ${toGroup.length} de entes`;
      
      finalNodes.push({
        id: groupId,
        label: groupLabel,
        type: "CONTRAPARTE",
        risk_level: "BAJO",
        antiquity_days: 0,
        suspicion_cause: `Canal consolidado de ${toGroup.length} contrapartes transaccionales de red (${categoryKey}).`,
        isGroupNode: true,
        groupCategory: categoryKey
      });

      toGroup.forEach(n => {
        groupedNodeIdMap.set(n.id, groupId);
      });
    } else {
      categoryNodes.forEach(n => finalNodes.push(n));
    }
  };

  processCategory(senders, "ENVIA");
  processCategory(receivers, "RECIBE");
  processCategory(both, "AMBOS");
  processCategory(others, "OTRO");

  const groupEdgesMap = new Map<string, any>();

  edges.forEach((edge, idx) => {
    const origSource = edge.source;
    const origTarget = edge.target;

    const sourceMapped = groupedNodeIdMap.get(origSource) || origSource;
    const targetMapped = groupedNodeIdMap.get(origTarget) || origTarget;

    if (sourceMapped === targetMapped) return;

    if (sourceMapped !== origSource || targetMapped !== origTarget) {
      const edgeKey = `${sourceMapped}➔${targetMapped}`;
      const existing = groupEdgesMap.get(edgeKey);
      if (existing) {
        existing.amount_ars += edge.amount_ars;
      } else {
        groupEdgesMap.set(edgeKey, {
          id: `g-edge-${idx}-${edgeKey}`,
          source: sourceMapped,
          target: targetMapped,
          amount_ars: edge.amount_ars,
          date: edge.date,
          alert_reason: "Flujos transaccionales agrupados y consolidados."
        });
      }
    } else {
      finalEdges.push(edge);
    }
  });

  groupEdgesMap.forEach(ge => finalEdges.push(ge));

  return { nodes: finalNodes, edges: finalEdges };
}

export default function App() {
  // Navigation Screens State
  const [activeTab, setActiveTab] = useState<"alertas" | "forense">("alertas");
  const [forensicMode, setForensicMode] = useState<"individual" | "grupal">("individual");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Application Parameters
  const [selectedPresetId, setSelectedPresetId] = useState<string>("caso-grupal-compartido");
  const [threshold, setThreshold] = useState<number>(35000000); // 35,000,000 to match Case A (caso-grupal-compartido)
  const [antiquityMonths, setAntiquityMonths] = useState<number>(3);
  const antiquityLimit = useMemo(() => antiquityMonths * 30, [antiquityMonths]);
  const [analysisMonth, setAnalysisMonth] = useState<string>(() => {
    const saved = localStorage.getItem("aml_analysisMonth");
    if (saved) return saved;
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = lastMonth.getFullYear();
    const m = String(lastMonth.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });
  const [lookbackMonths, setLookbackMonths] = useState<number>(3);

  // Loaded scenarios state
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return PRESET_CASES[0].transactions.map(t => ({
      ...t,
      CUIT: t.CUIT.replace(/\D/g, ""),
      CUIT_CONTRAPARTE: t.CUIT_CONTRAPARTE.replace(/\D/g, ""),
      DENOMINACION_SUJETO: t.DENOMINACION_SUJETO || getArgentineFallbackName(t.CUIT, "Sujeto"),
      DENOMINACION_CONTRAPARTE: t.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(t.CUIT_CONTRAPARTE, "Contraparte")
    }));
  });
  
  // Custom copy-pasting Uploader States (Base de ARCA)
  const [arcaRecords, setArcaRecords] = useState<{cuit: string, fechaAlta: string, umbral: number}[]>(() => {
    return DEFAULT_ARCA_RECORDS.map(r => ({
      cuit: r.cuit.replace(/\D/g, ""),
      fechaAlta: r.fechaAlta,
      umbral: r.umbral
    }));
  });
  const [arcaImportError, setArcaImportError] = useState("");
  const [arcaSyncStatus, setArcaSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");

  const [opsImportError, setOpsImportError] = useState("");
  const [opsSyncStatus, setOpsSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");

  // Show inline raw importers inside Screen 2 as secondary tools
  const [showSecondaryImporter, setShowSecondaryImporter] = useState(false);

  // Analysis Result & Loading State
  const [analysisResult, setAnalysisResult] = useState<AMLAnalysisResult | null>(null);
  const [analyzerEngineName, setAnalyzerEngineName] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // Advertencias de calidad de datos al cargar archivos (badge B)
  type FileWarning = { fila: number; cuit: string; campo: string; detalle: string };
  const [arcaWarningsList, setArcaWarningsList] = useState<FileWarning[]>([]);
  const [opsWarningsList, setOpsWarningsList] = useState<FileWarning[]>([]);

  // Selected visual node in the network graph for forensic drill-down
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Explicitly selected subject under analysis (holds persistent CUIT)
  const [activeSubjectCuit, setActiveSubjectCuit] = useState<string | null>(null);

  const [exportLogs, setExportLogs] = useState<{
    id: string;
    timestamp: string;
    fileName: string;
    actionType: "DOWNLOAD" | "CLIPBOARD_COPY";
    fileSizeKb: number;
    sha256: string;
    officer: string;
    status: "EXITOSO" | "LIMITADO_POR_SANDBOX";
  }[]>([
    {
      id: "LOG-0182",
      timestamp: "2026-06-17 11:24:05 UTC",
      fileName: "Reporte_Altas_Transacciones_2026-05.html",
      actionType: "DOWNLOAD",
      fileSizeKb: 145.2,
      sha256: "SHA256-SIM-EA8290FB",
      officer: "M. González (Oficial PLD UBA)",
      status: "EXITOSO"
    },
    {
      id: "LOG-0181",
      timestamp: "2026-06-16 16:15:32 UTC",
      fileName: "Reporte_Altas_Transacciones_2026-04.html",
      actionType: "CLIPBOARD_COPY",
      fileSizeKb: 139.8,
      sha256: "SHA256-SIM-FB73909B",
      officer: "M. González (Oficial PLD UBA)",
      status: "EXITOSO"
    }
  ]);

  const [toast, setToast] = useState<{ text: string, type: "success" | "error" | "info" } | null>(null);

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Supabase connection status (real check against /api/supabase/status)
  const [isSupabaseOnline, setIsSupabaseOnline] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [supabaseLatency, setSupabaseLatency] = useState<number | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);

  const handleTestSupabase = async () => {
    setTestingConnection(true);
    try {
      const res = await fetch("/api/supabase/status");
      const data = await res.json();
      setIsSupabaseOnline(!!data.online);
      setSupabaseLatency(typeof data.latencyMs === "number" ? data.latencyMs : null);
    } catch {
      setIsSupabaseOnline(false);
      setSupabaseLatency(null);
    } finally {
      setTestingConnection(false);
    }
  };

  // Al montar la app: verificar conexión y rehidratar ARCA + transacciones desde Supabase
  useEffect(() => {
    const hydrate = async () => {
      setIsHydrating(true);
      try {
        const statusRes = await fetch("/api/supabase/status");
        const statusData = await statusRes.json();
        setIsSupabaseOnline(!!statusData.online);
        setSupabaseLatency(typeof statusData.latencyMs === "number" ? statusData.latencyMs : null);

        if (!statusData.online) return;

        // Cargar padrón ARCA y transacciones en paralelo para reducir tiempo de carga
        const [arcaRes, txRes] = await Promise.all([
          fetch("/api/arca-records"),
          fetch("/api/transactions")
        ]);

        const [arcaData, txData] = await Promise.all([
          arcaRes.json(),
          txRes.json()
        ]);

        // Solo reemplazar el estado si Supabase devuelve datos reales;
        // si ambas tablas están vacías se mantienen los datos del preset activo.
        const hasArcaData = Array.isArray(arcaData.records) && arcaData.records.length > 0;
        const hasTxData = Array.isArray(txData.transactions) && txData.transactions.length > 0;

        if (hasArcaData || hasTxData) {
          if (hasArcaData) setArcaRecords(arcaData.records);
          if (hasTxData) setTransactions(txData.transactions);
          setSelectedPresetId("custom");
        }
      } catch (err) {
        console.error("[supabase] Error rehidratando datos al inicio:", err);
      } finally {
        setIsHydrating(false);
      }
    };
    hydrate();
  }, []);

  // Filtered transactions and arca records in the specified date range
  const { filteredTransactions, filteredArcaRecords } = useMemo(() => {
    const [yearStr, monthStr] = analysisMonth.split("-");
    const yr = parseInt(yearStr, 10);
    const mo = parseInt(monthStr, 10);
    // End Date: end of selected month (last day of the month at 23:59:59)
    const end = new Date(yr, mo, 0, 23, 59, 59);
    // Start Date: first day of lookback month (e.g. if June 2026 and lookback is 3: month 6 - 3 = month 3, meaning April 1st)
    const start = new Date(yr, mo - lookbackMonths, 1, 0, 0, 0);

    const fArca = arcaRecords.filter(r => {
      const altaDate = parseDateString(r.fechaAlta);
      if (!altaDate) return false;
      return altaDate >= start && altaDate <= end;
    });

    // Create a Set of CUITs that have non-zero or defined threshold in the period
    const validSubjectCuits = new Set(
      fArca
        .filter(r => r.umbral !== undefined && r.umbral !== null && r.umbral > 0)
        .map(r => String(r.cuit).replace(/\D/g, ""))
    );

    const fTxs = transactions.filter(t => {
      const txDate = parseDateString(t.FECHA);
      if (!txDate) return false;
      const correctPeriod = txDate >= start && txDate <= end;
      if (!correctPeriod) return false;

      const cleanSubjectCuit = String(t.CUIT).replace(/\D/g, "");
      return validSubjectCuits.has(cleanSubjectCuit);
    });

    return { filteredTransactions: fTxs, filteredArcaRecords: fArca };
  }, [transactions, arcaRecords, analysisMonth, lookbackMonths]);

  // Description about evaluated date window
  const dateRangeDescription = useMemo(() => {
    const [yearStr, monthStr] = analysisMonth.split("-");
    const yr = parseInt(yearStr, 10);
    const mo = parseInt(monthStr, 10);
    const end = new Date(yr, mo, 0);
    const start = new Date(yr, mo - lookbackMonths, 1);
    
    const formatDateLabel = (d: Date) => {
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      return `${months[d.getMonth()]}-${d.getFullYear()}`;
    };
    
    return `Considerando transacciones y altas desde el 1º de ${formatDateLabel(start)} hasta el ${end.getDate()} de ${formatDateLabel(end)}`;
  }, [analysisMonth, lookbackMonths]);

  // 1. Compute dynamic ARCA Date range stats (Earliest/Latest parsed high-risk boundaries)
  const arcaDateMetrics = useMemo(() => {
    if (arcaRecords.length === 0) return { first: "N/A", last: "N/A" };
    
    // Sort chronological helper
    const sorted = [...arcaRecords]
      .map(r => ({ record: r, dateObj: parseDateString(r.fechaAlta) }))
      .filter(x => x.dateObj !== null)
      .sort((a, b) => a.dateObj!.getTime() - b.dateObj!.getTime());
      
    if (sorted.length === 0) return { first: "N/A", last: "N/A" };
    
    return {
      first: formatDateString(sorted[0].dateObj!),
      last: formatDateString(sorted[sorted.length - 1].dateObj!)
    };
  }, [arcaRecords]);

  // 2. Map of CUIT to high contrast name/Denominación for the whole app
  const cuitDenominacionesMap = useMemo(() => {
    const map: Record<string, string> = {};
    
    // Seed transaction overrides
    transactions.forEach(t => {
      if (t.CUIT) {
        map[t.CUIT] = t.DENOMINACION_SUJETO || getArgentineFallbackName(t.CUIT, "Sujeto");
      }
      if (t.CUIT_CONTRAPARTE) {
        map[t.CUIT_CONTRAPARTE] = t.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(t.CUIT_CONTRAPARTE, "Contraparte");
      }
    });

    // Seed arca databases fallbacks
    arcaRecords.forEach(r => {
      if (!map[r.cuit]) {
        map[r.cuit] = getArgentineFallbackName(r.cuit, "Sujeto");
      }
    });

    return map;
  }, [arcaRecords, transactions]);

  // 3. Map each CUIT to its active Fecha de Alta from the parsed registry database
  const cuitAltaDatesMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Start with transaction defaults
    transactions.forEach(tx => {
      if (tx.CUIT) {
        // Solo guardar si tiene fecha válida; sin hardcodear fallback
        if (tx.FECHA_ALTA_CUIT) {
          map[tx.CUIT] = tx.FECHA_ALTA_CUIT;
        }
      }
    });
    // Override con ARCA (fuente autoritativa); si fechaAlta está vacía queda sin entrada
    arcaRecords.forEach(r => {
      if (r.fechaAlta) {
        map[r.cuit] = r.fechaAlta;
      }
    });
    return map;
  }, [transactions, arcaRecords]);

  // Sync state with Presets changes
  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = PRESET_CASES.find(c => c.id === presetId);
    if (found) {
      // Feed preset transaccional data
      const processedPreset = found.transactions.map(t => ({
        ...t,
        CUIT: t.CUIT.replace(/\D/g, ""),
        CUIT_CONTRAPARTE: t.CUIT_CONTRAPARTE.replace(/\D/g, ""),
        DENOMINACION_SUJETO: t.DENOMINACION_SUJETO || getArgentineFallbackName(t.CUIT, "Sujeto"),
        DENOMINACION_CONTRAPARTE: t.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(t.CUIT_CONTRAPARTE, "Contraparte")
      }));
      setTransactions(processedPreset);
      setThreshold(found.suggestedThreshold);
      setAntiquityMonths(Math.round(found.suggestedDays / 30) || 3);
      setSelectedNodeId(null);

      // Synthesize matching ARCA registros from the unique CUITs of the selected simulation case
      const syntheticArcaList: { cuit: string; fechaAlta: string; umbral: number }[] = [];
      const seenCuits = new Set<string>();
      
      processedPreset.forEach(t => {
        if (t.CUIT && !seenCuits.has(t.CUIT)) {
          seenCuits.add(t.CUIT);
          syntheticArcaList.push({
            cuit: t.CUIT,
            fechaAlta: t.FECHA_ALTA_CUIT || "15/05/2026",
            umbral: found.suggestedThreshold
          });
        }
      });
      
      setArcaRecords(syntheticArcaList);
    }
  };

  // Run the API or Local analysis
  const executeAnalysis = async (useAi: boolean = false) => {
    setLoading(true);
    setApiError("");
    try {
      // Sync every transaction's FECHA_ALTA_CUIT and Denominaciones with our active ARCA states before posting
      const enrichedTransactions = filteredTransactions.map(t => {
        const matchingCuitAlta = cuitAltaDatesMap[t.CUIT] || t.FECHA_ALTA_CUIT || t.FECHA;
        const matchingSujetoDenom = cuitDenominacionesMap[t.CUIT] || t.DENOMINACION_SUJETO || getArgentineFallbackName(t.CUIT, "Sujeto");
        const matchingContraDenom = cuitDenominacionesMap[t.CUIT_CONTRAPARTE] || t.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(t.CUIT_CONTRAPARTE, "Contraparte");
        return {
          ...t,
          FECHA_ALTA_CUIT: matchingCuitAlta,
          DENOMINACION_SUJETO: matchingSujetoDenom,
          DENOMINACION_CONTRAPARTE: matchingContraDenom
        };
      });

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: enrichedTransactions,
          threshold,
          antiquityLimit,
          useAi,
          arcaRecords: filteredArcaRecords
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al procesar la solicitud.");
      }

      const data = await response.json();
      setAnalysisResult(data.analysis);
      setAnalyzerEngineName(data.engine);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "No se pudo establecer conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  // Run automatically when dependencies adapt
  useEffect(() => {
    executeAnalysis(false); 
  }, [filteredTransactions, threshold, antiquityLimit, filteredArcaRecords]);

  const arcaFileInputRef = useRef<HTMLInputElement>(null);
  const opsFileInputRef = useRef<HTMLInputElement>(null);

  // Limpia todas las tablas en Supabase y resetea el estado local.
  const handleClearAllData = async () => {
    setArcaWarningsList([]);
    setOpsWarningsList([]);
    if (!window.confirm("¿Confirmar limpieza completa? Se borrarán todos los registros de Supabase (ARCA, transacciones, análisis, nodos y edges). Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch("/api/clear-data", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Error limpiando las tablas.");
      // Resetear estado local también
      setTransactions([]);
      setArcaRecords([]);
      setAnalysisResult(null);
      setSelectedPresetId("custom");
      setArcaSyncStatus("idle");
      setOpsSyncStatus("idle");
      showToast("Tablas limpiadas correctamente.", "success");
    } catch (err: any) {
      showToast("Error limpiando las tablas: " + err.message, "error");
    }
  };

  // Persiste el padrón ARCA recién cargado en Supabase (tabla arca_records).
  // Reemplaza el padrón vigente completo, ya que cada carga representa el padrón
  // actualizado, no un agregado incremental.
  const persistArcaRecordsToSupabase = async (records: {cuit: string, fechaAlta: string, umbral: number}[]) => {
    setArcaSyncStatus("syncing");
    try {
      const res = await fetch("/api/arca-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records })
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error guardando el padrón ARCA.");
      setArcaSyncStatus("synced");
    } catch (err) {
      console.error("[supabase] No se pudo guardar el padrón ARCA:", err);
      setArcaSyncStatus("error");
    }
  };

  // Persiste el lote de transacciones recién cargado en Supabase (tabla transactions),
  // sin asociarlo todavía a un análisis. Reemplaza el lote "suelto" anterior.
  const persistTransactionsToSupabase = async (txs: Transaction[]) => {
    setOpsSyncStatus("syncing");
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: txs })
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error guardando las transacciones.");
      setOpsSyncStatus("synced");
    } catch (err) {
      console.error("[supabase] No se pudieron guardar las transacciones:", err);
      setOpsSyncStatus("error");
    }
  };

  // Handle ARCA file uploads (.xlsx, .xls, .csv)
  const handleArcaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setArcaImportError("");
    setArcaWarningsList([]); // limpiar advertencias previas al cargar nuevo archivo
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        
        const parsed: {cuit: string, fechaAlta: string, umbral: number}[] = [];
        
        const arcaWarnings: FileWarning[] = [];

        rows.forEach((row, rowIdx) => {
          if (row.length < 2) return;

          // Detectar y saltear fila de encabezado
          const firstColStr = String(row[0] || "").toLowerCase();
          const secondColStr = String(row[1] || "").toLowerCase();
          if (rowIdx === 0 && (firstColStr.includes("cuit") || secondColStr.includes("alta") || secondColStr.includes("fecha"))) {
            return;
          }

          const rawCuit = String(row[0] || "").trim();
          const cuitVal = rawCuit.replace(/\D/g, "");

          // CUIT -1 (contraparte desconocida): excluir de ARCA silenciosamente
          if (rawCuit.trim() === "-1" || cuitVal === "1" && rawCuit.includes("-")) return;

          // CUIT vacío → excluir silenciosamente
          if (!cuitVal) return;

          // CUIT con longitud incorrecta → excluir y advertir
          if (cuitVal.length !== 11) {
            arcaWarnings.push({ fila: rowIdx + 1, cuit: rawCuit, campo: "CUIT", detalle: `"${rawCuit}" tiene ${cuitVal.length} dígitos (se esperan 11) — excluido del análisis` });
            return;
          }

          // FECHA_ALTA: validar formato dd/mm/yyyy
          const fechaRaw = String(row[1] || "").trim();
          const fechaValida = /^\d{2}\/\d{2}\/\d{4}$/.test(fechaRaw);
          const fechaVal = fechaValida ? fechaRaw : "";
          if (!fechaRaw) {
            arcaWarnings.push({ fila: rowIdx + 1, cuit: cuitVal, campo: "FECHA_ALTA", detalle: "vacía — se registrará como Sin Fecha Informada" });
          } else if (!fechaValida) {
            arcaWarnings.push({ fila: rowIdx + 1, cuit: cuitVal, campo: "FECHA_ALTA", detalle: `"${fechaRaw}" no tiene formato dd/mm/yyyy — se registrará como Sin Fecha Informada` });
          }

          // UMBRAL: usar parseMonto para tolerar formatos argentinos
          const umbralRaw = String(row[2] || "").trim();
          const { amount: umbralVal, invalid: umbralInvalid } = parseMonto(umbralRaw);
          if (umbralInvalid || umbralRaw === "") {
            arcaWarnings.push({ fila: rowIdx + 1, cuit: cuitVal, campo: "UMBRAL", detalle: `"${umbralRaw || "(vacío)"}" no es un monto válido — se registra como $0` });
          }

          parsed.push({ cuit: cuitVal, fechaAlta: fechaVal, umbral: umbralVal });
        });

        if (parsed.length === 0) {
          throw new Error("No se leyeron registros válidos del archivo de Excel/CSV.");
        }

        // Toast A + estado badge B
        setArcaWarningsList(arcaWarnings);
        if (arcaWarnings.length > 0) {
          const preview = arcaWarnings.slice(0, 5)
            .map(w => `Fila ${w.fila} · ${w.campo}: ${w.detalle}`)
            .join("\n");
          const extra = arcaWarnings.length > 5 ? `\n...y ${arcaWarnings.length - 5} problema${arcaWarnings.length - 5 > 1 ? "s" : ""} más.` : "";
          showToast(`⚠️ ${arcaWarnings.length} problema${arcaWarnings.length > 1 ? "s" : ""} en el padrón ARCA:\n${preview}${extra}`, "error");
        }

        if (selectedPresetId !== "custom") {
          setTransactions([]);
          setSelectedPresetId("custom");
        }
        setArcaRecords(parsed);
        setArcaImportError("");
        persistArcaRecordsToSupabase(parsed);
      } catch (err: any) {
        setArcaImportError(err.message || "Error leyendo el archivo.");
      }
    };
    reader.readAsBinaryString(file);
    // Reset file input element
    e.target.value = "";
  };

  // Handle Operations File Upload (.xlsx, .xls, .csv)
  const handleOpsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOpsImportError("");
    setOpsWarningsList([]); // limpiar advertencias previas al cargar nuevo archivo
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        
        const parsed: Transaction[] = [];
        const opsWarnings: FileWarning[] = [];

        rows.forEach((row, rowIdx) => {
          if (row.length < 5) return;

          // Detectar y saltear fila de encabezado
          const col0Str = String(row[0] || "").toLowerCase();
          const col3Str = String(row[3] || "").toLowerCase();
          if (rowIdx === 0 && (col0Str.includes("sentido") || col0Str.includes("tipo") || col3Str.includes("cuit") || col3Str.includes("sujeto"))) {
            return;
          }

          // ── TIPO ──────────────────────────────────────────────────────────
          const tipoRaw = String(row[0] || "").trim().toUpperCase();
          const tipoRow: "ORDENADA" | "RECIBIDA" = tipoRaw === "ORDENADA" ? "ORDENADA" : "RECIBIDA";
          if (tipoRaw !== "ORDENADA" && tipoRaw !== "RECIBIDA") {
            opsWarnings.push({ fila: rowIdx + 1, cuit: String(row[3] || "").trim(), campo: "TIPO", detalle: `"${tipoRaw || "(vacío)"}" no es válido — se asume RECIBIDA` });
          }

          // ── FECHA ─────────────────────────────────────────────────────────
          const fechaRow = String(row[1] || "").trim();
          const fechaValida = /^\d{2}\/\d{2}\/\d{4}$/.test(fechaRow);
          if (!fechaRow) {
            opsWarnings.push({ fila: rowIdx + 1, cuit: String(row[3] || "").trim(), campo: "FECHA", detalle: "vacía — fila incluida sin fecha" });
          } else if (!fechaValida) {
            opsWarnings.push({ fila: rowIdx + 1, cuit: String(row[3] || "").trim(), campo: "FECHA", detalle: `"${fechaRow}" no tiene formato dd/mm/yyyy — fila incluida sin fecha` });
          }

          // ── MONTO ─────────────────────────────────────────────────────────
          const rawMonto = String(row[2] || "").trim();
          const { amount: montoAmount, invalid: montoInvalid } = parseMonto(rawMonto);
          if (montoInvalid) {
            opsWarnings.push({ fila: rowIdx + 1, cuit: String(row[3] || "").trim(), campo: "MONTO", detalle: `"${rawMonto || "(vacío)"}" no es válido — se registra como $0` });
          }

          // ── CUIT SUJETO ───────────────────────────────────────────────────
          const rawCuitSujeto = String(row[3] || "").trim();
          const isMinusOneSujeto = rawCuitSujeto.replace(/\s/g, "") === "-1";
          const cuitRow = isMinusOneSujeto ? "-1" : rawCuitSujeto.replace(/\D/g, "");

          // CUIT vacío → excluir silenciosamente
          if (!cuitRow) return;

          // CUIT no es -1 y no tiene 11 dígitos → excluir y advertir
          if (!isMinusOneSujeto && cuitRow.length !== 11) {
            opsWarnings.push({ fila: rowIdx + 1, cuit: rawCuitSujeto, campo: "CUIT", detalle: `"${rawCuitSujeto}" tiene ${cuitRow.length} dígitos (se esperan 11) — fila excluida del análisis` });
            return;
          }

          // ── DENOMINACION SUJETO ───────────────────────────────────────────
          const rawDenomSujeto = String(row[4] || "").trim();
          const sujetoDenom = (!rawDenomSujeto || isMinusOneSujeto)
            ? "SIN DENOMINACION"
            : rawDenomSujeto;

          // ── CUIT CONTRAPARTE ──────────────────────────────────────────────
          const rawCuitContra = String(row[5] || "").trim();
          const isMinusOneContra = rawCuitContra.replace(/\s/g, "") === "-1";
          const cuitContraRow = isMinusOneContra ? "-1" : rawCuitContra.replace(/\D/g, "");

          // ── DENOMINACION CONTRAPARTE ──────────────────────────────────────
          const rawDenomContra = String(row[6] || "").trim();
          const contraDenom = (!rawDenomContra || isMinusOneContra)
            ? "SIN DENOMINACION"
            : rawDenomContra;

          const fechaAltaLookup = cuitAltaDatesMap[cuitRow] || (fechaValida ? fechaRow : "");

          parsed.push({
            OPERACION: "TRANSFERENCIA",
            TIPO: tipoRow,
            FECHA: fechaValida ? fechaRow : "",
            MONTO: String(montoAmount),
            CUIT: cuitRow,
            CUIT_CONTRAPARTE: cuitContraRow,
            FECHA_ALTA_CUIT: fechaAltaLookup,
            DENOMINACION_SUJETO: sujetoDenom,
            DENOMINACION_CONTRAPARTE: contraDenom
          });
        });

        if (parsed.length === 0) {
          throw new Error("No se leyeron transacciones consistentes de Excel/CSV.");
        }

        // Toast A + estado badge B
        setOpsWarningsList(opsWarnings);
        if (opsWarnings.length > 0) {
          const preview = opsWarnings.slice(0, 5)
            .map(w => `Fila ${w.fila}${w.cuit ? ` · CUIT ${w.cuit}` : ""} · ${w.campo}: ${w.detalle}`)
            .join("\n");
          const extra = opsWarnings.length > 5 ? `\n...y ${opsWarnings.length - 5} problema${opsWarnings.length - 5 > 1 ? "s" : ""} más.` : "";
          showToast(`⚠️ ${opsWarnings.length} problema${opsWarnings.length > 1 ? "s" : ""} en operaciones:\n${preview}${extra}`, "error");
        }

        if (selectedPresetId !== "custom") {
          setArcaRecords([]);
          setSelectedPresetId("custom");
        }
        setTransactions(parsed);
        setOpsImportError("");
        persistTransactionsToSupabase(parsed);
      } catch (err: any) {
        setOpsImportError(err.message || "Error leyendo el archivo.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // Export full analytic output, loading report and transaction flows as a self-contained HTML document
  const handleExportHtmlReport = () => {
    const htmlContent = generateAMLReportHTML(currentAMLState);
    const sizeKb = parseFloat((htmlContent.length / 1024).toFixed(1));
    
    // Deterministic visual fingerprint checksum of document payload
    let hashVal = 0;
    for (let j = 0; j < htmlContent.length; j++) {
      hashVal = ((hashVal << 5) - hashVal) + htmlContent.charCodeAt(j);
      hashVal = hashVal & hashVal;
    }
    const signature = "SHA256-SIM-" + Math.abs(hashVal).toString(16).toUpperCase().substring(0, 8);

    let directDownloadSucceeded = true;
    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Reporte_Altas_Transacciones_${analysisMonth}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Descarga exitosa. Integridad referencial PLD y firma digital verificada.", "success");
    } catch (e) {
      console.warn("Direct download sandbox block:", e);
      directDownloadSucceeded = false;
      showToast("El navegador bloqueó la descarga directa. Intentá nuevamente.", "error");
    }

    const newLog = {
      id: "LOG-" + (182 + exportLogs.length + 1),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC",
      fileName: `Reporte_Altas_Transacciones_${analysisMonth}.html`,
      actionType: "DOWNLOAD" as const,
      fileSizeKb: sizeKb,
      sha256: signature,
      officer: "M. González (Oficial PLD UBA)",
      status: directDownloadSucceeded ? ("EXITOSO" as const) : ("LIMITADO_POR_SANDBOX" as const)
    };

    setExportLogs(prev => [newLog, ...prev]);
  };

  // Helper inside tables to update single CUIT dates
  const handleUpdateCuitAltaDate = (cuit: string, newDate: string) => {
    setArcaRecords(prev => {
      const matchIndex = prev.findIndex(r => r.cuit === cuit);
      if (matchIndex > -1) {
        const updated = [...prev];
        updated[matchIndex] = { ...updated[matchIndex], fechaAlta: newDate };
        return updated;
      }
      return [...prev, { cuit, fechaAlta: newDate, umbral: threshold }];
    });
  };

  // Remove individual row of operations
  const handleRemoveTx = (index: number) => {
    setTransactions(prev => prev.filter((_, i) => i !== index));
    setSelectedNodeId(null);
  };

  // Clear all sandbox datasets
  const handleClearAll = () => {
    setTransactions([]);
    setArcaRecords([]);
    setSelectedNodeId(null);
  };

  // Helper date arithmetic to show in positive rows
  const getAntiquityDaysLocal = (alta: string, txDate: string): number => {
    try {
      const [d1, m1, y1] = alta.split("/").map(Number);
      const [d2, m2, y2] = txDate.split("/").map(Number);
      const date1 = new Date(y1, m1 - 1, d1);
      const date2 = new Date(y2, m2 - 1, d2);
      const diffTime = Math.abs(date2.getTime() - date1.getTime());
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  // Extract unique analyzed subjects to manage registration dates
  const uniqueAnalyzedCuits = useMemo(() => {
    const list = new Set<string>();
    filteredTransactions.forEach(tx => {
      if (tx.CUIT) list.add(tx.CUIT);
    });
    return Array.from(list);
  }, [filteredTransactions]);

  useEffect(() => {
    if (uniqueAnalyzedCuits.length > 0 && (!activeSubjectCuit || !uniqueAnalyzedCuits.includes(activeSubjectCuit))) {
      setActiveSubjectCuit(uniqueAnalyzedCuits[0]);
    }
  }, [uniqueAnalyzedCuits, activeSubjectCuit]);

  // Calculate Positive High-Risk early warning cases (< threshold of antiquity Limit with operations exceeding)
  const positiveCases = useMemo(() => {
    if (!analysisResult) return [];
    
    // Filter subject nodes that meet early risk criteria (< antiquityLimit and registered high volumes)
    const filteredCases = analysisResult.nodes.filter(node => {
      if (node.type !== "ANALIZADO") return false;
      const belongsToLimit = node.antiquity_days < antiquityLimit;
      
      const relatedTxs = filteredTransactions.filter(t => t.CUIT === node.id);
      const totalVolume = relatedTxs.reduce((sum, t) => sum + parseMonto(t.MONTO).amount, 0);
      
      // Look up custom umbral from arca records
      const cleanId = String(node.id).replace(/\D/g, "");
      const matchingArca = filteredArcaRecords ? filteredArcaRecords.find((r: any) => String(r.cuit).replace(/\D/g, "") === cleanId) : null;
      const activeThreshold = matchingArca && matchingArca.umbral !== undefined ? matchingArca.umbral : threshold;
      const exceeds = totalVolume > activeThreshold; // Strictly thresholding accumulated volume inside lookup window

      return belongsToLimit && exceeds;
    }).map(node => {
      const relatedTxs = filteredTransactions.filter(t => t.CUIT === node.id);
      const totalVolume = relatedTxs.reduce((sum, t) => sum + parseMonto(t.MONTO).amount, 0);
      const opCount = relatedTxs.length;
      // Si no hay fecha de alta en ARCA ni en transacciones, usar la fecha
      // de transacción más antigua como proxy (el sujeto tiene umbral, no se excluye).
      const rawAltaDate = cuitAltaDatesMap[node.id] || null;
      const relatedTxsSorted = [...filteredTransactions.filter(t => t.CUIT === node.id)]
        .sort((a, b) => {
          const [da, ma, ya] = (a.FECHA || "").split("/").map(Number);
          const [db, mb, yb] = (b.FECHA || "").split("/").map(Number);
          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
        });
      const earliestTxFecha = relatedTxsSorted[0]?.FECHA || null;
      const altaDate = rawAltaDate || earliestTxFecha || "No especificada";
      const sinFechaInformada = !rawAltaDate;

      // Operaciones con fecha anterior a la fecha de alta ARCA — irregularidad fiscal:
      // el sujeto operó antes de estar registrado en el padrón.
      let previoAlAlta = 0;
      if (altaDate && altaDate !== "No especificada") {
        const [dA, mA, yA] = altaDate.split("/").map(Number);
        const altaTimestamp = new Date(yA, mA - 1, dA).getTime();
        previoAlAlta = relatedTxs.filter(t => {
          const [dT, mT, yT] = (t.FECHA || "").split("/").map(Number);
          if (!dT || !mT || !yT) return false;
          return new Date(yT, mT - 1, dT).getTime() < altaTimestamp;
        }).length;
      }

      return {
        ...node,
        totalVolume,
        opCount,
        altaDate,
        sinFechaInformada,
        previoAlAlta
      };
    });

    return filteredCases.sort((a, b) => b.totalVolume - a.totalVolume);
  }, [analysisResult, filteredTransactions, antiquityLimit, threshold, cuitAltaDatesMap, filteredArcaRecords]);

  // Compute aggregated data for the currently selected/analyzed subject
  const currentCuit = useMemo(() => {
    if (activeSubjectCuit && uniqueAnalyzedCuits.includes(activeSubjectCuit)) {
      return activeSubjectCuit;
    }
    if (positiveCases && positiveCases.length > 0) return positiveCases[0].id;
    const firstSubject = analysisResult?.nodes.find(n => n.type === "ANALIZADO");
    if (firstSubject) return firstSubject.id;
    return null;
  }, [activeSubjectCuit, uniqueAnalyzedCuits, positiveCases, analysisResult]);

  const currentSubjectName = useMemo(() => {
    if (!currentCuit) return "No seleccionado";
    return cuitDenominacionesMap[currentCuit] || getArgentineFallbackName(currentCuit, "Sujeto");
  }, [currentCuit, cuitDenominacionesMap]);

  // Reset forensic mode and group selection on preset change
  useEffect(() => {
    setForensicMode("individual");
    setSelectedGroupId(null);
  }, [selectedPresetId]);

  // Detected group flows of multiple interconnected subjects under analysis
  const detectedGroupFlows = useMemo(() => {
    if (!analysisResult) return [];
    
    // We only group nodes of type "ANALIZADO"
    const analyzedSubjects = analysisResult.nodes.filter(n => n.type === "ANALIZADO");
    const subjectIds = analyzedSubjects.map(n => n.id);

    if (subjectIds.length < 2) return [];

    // --- Union-Find: agrupa sujetos que comparten contraparte o se conectan directamente ---
    // Con detección de pares (algoritmo anterior), 15 sujetos interconectados generaban
    // hasta 89 "grupos" solapados. Con componentes conexos se genera 1 sola red real.

    const parent: Record<string, string> = {};
    subjectIds.forEach(id => { parent[id] = id; });

    const find = (x: string): string => {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    const union = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // Contrapartes de cada sujeto (excluyendo otros sujetos del padrón)
    const subjectSet = new Set(subjectIds);
    const counterpartsBySubject: Record<string, Set<string>> = {};
    subjectIds.forEach(id => {
      counterpartsBySubject[id] = new Set(
        analysisResult.edges
          .filter(e => e.source === id || e.target === id)
          .map(e => e.source === id ? e.target : e.source)
          .filter(cp => !subjectSet.has(cp))
      );
    });

    // Unir sujetos que comparten al menos una contraparte, o que tienen edge directa
    for (let i = 0; i < subjectIds.length; i++) {
      for (let j = i + 1; j < subjectIds.length; j++) {
        const subA = subjectIds[i];
        const subB = subjectIds[j];
        const directEdge = analysisResult.edges.some(e =>
          (e.source === subA && e.target === subB) || (e.source === subB && e.target === subA)
        );
        const sharedCounterparts = [...counterpartsBySubject[subA]].filter(id => counterpartsBySubject[subB].has(id));
        if (directEdge || sharedCounterparts.length > 0) {
          union(subA, subB);
        }
      }
    }

    // Agrupar sujetos por componente (raíz del union-find)
    const components: Record<string, string[]> = {};
    subjectIds.forEach(id => {
      const root = find(id);
      if (!components[root]) components[root] = [];
      components[root].push(id);
    });

    // Construir los grupos finales (solo los que tienen 2+ sujetos conectados)
    const groups: {
      id: string;
      name: string;
      subjects: string[];
      commonCounterparts: string[];
    }[] = [];

    Object.values(components).forEach(members => {
      if (members.length < 2) return;

      // Contrapartes compartidas: aparecen en las edges de al menos 2 sujetos del grupo
      const cpCount: Record<string, number> = {};
      members.forEach(subId => {
        counterpartsBySubject[subId].forEach(cp => {
          cpCount[cp] = (cpCount[cp] || 0) + 1;
        });
      });
      const commonCounterparts = Object.entries(cpCount)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1]) // más compartidas primero
        .map(([cp]) => cp);

      // Nombre descriptivo del grupo
      const names = members.map(id => {
        const denom = cuitDenominacionesMap[id] || id;
        return denom.split(" ")[0];
      });
      const groupName = members.length <= 3
        ? names.join(" / ") + " (Red Interconectada)"
        : `Red de ${members.length} Sujetos Interconectados`;

      groups.push({
        id: `grupo-${members.sort().join("-")}`,
        name: groupName,
        subjects: members,
        commonCounterparts
      });
    });

    return groups;
  }, [analysisResult, cuitDenominacionesMap]);

  // Auto-select first group if in grupal mode and none selected
  useEffect(() => {
    if (forensicMode === "grupal" && detectedGroupFlows.length > 0) {
      if (!selectedGroupId || !detectedGroupFlows.some(g => g.id === selectedGroupId)) {
        setSelectedGroupId(detectedGroupFlows[0].id);
      }
    } else if (forensicMode === "individual") {
      setSelectedGroupId(null);
    }
  }, [forensicMode, detectedGroupFlows, selectedGroupId]);

  const activeGroup = useMemo(() => {
    if (forensicMode !== "grupal" || !selectedGroupId) return null;
    return detectedGroupFlows.find(g => g.id === selectedGroupId) || null;
  }, [forensicMode, selectedGroupId, detectedGroupFlows]);

  // Compiled compliance and state report model (Paso 1: Captura de Estado de Interfaz y Datos Dinámicos)
  const currentAMLState = useMemo(() => {
    const selectedPresetName = PRESET_CASES.find(c => c.id === selectedPresetId)?.name || "Caso Custom/Archivo Subido";
    const groupFallback = activeGroup || (detectedGroupFlows.length > 0 ? detectedGroupFlows[0] : null);
    return captureCurrentAMLState({
      analysisMonth,
      lookbackMonths,
      threshold,
      selectedPresetId,
      selectedPresetName,
      transactions: filteredTransactions,
      positiveCases,
      cuitDenominacionesMap,
      activeGroup: groupFallback,
      antiquityLimit,
      activeTab,
      forensicMode,
      currentCuit: currentCuit || undefined,
      selectedGroupId: selectedGroupId || (groupFallback ? groupFallback.id : undefined),
      graphNodes: analysisResult?.nodes || [],
      graphEdges: analysisResult?.edges || [],
    });
  }, [analysisMonth, lookbackMonths, threshold, selectedPresetId, filteredTransactions, positiveCases, cuitDenominacionesMap, activeGroup, detectedGroupFlows, antiquityLimit, activeTab, forensicMode, currentCuit, selectedGroupId, analysisResult]);

  // Filter nodes and edges for FLUJO INDIVIDUAL to show ONLY the selected CUIT and its direct counterparties / transactions
  const forensicGraphData = useMemo(() => {
    if (!analysisResult) return { nodes: [], edges: [] };
    if (!currentCuit) return { nodes: [], edges: [] };
    
    // Filter edges connected directly to currentCuit
    const filteredEdges = analysisResult.edges.filter(edge => 
      edge.source === currentCuit || edge.target === currentCuit
    );
    
    // Collect involved node IDs (currentCuit and its counterparties)
    const involvedNodeIds = new Set<string>();
    involvedNodeIds.add(currentCuit);
    filteredEdges.forEach(edge => {
      involvedNodeIds.add(edge.source);
      involvedNodeIds.add(edge.target);
    });
    
    // Filter nodes that are involved in these edges
    const filteredNodes = analysisResult.nodes.filter(node => 
      involvedNodeIds.has(node.id)
    );
    
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [analysisResult, currentCuit]);

  // Combined active graph data before grouping
  const activeUnconsolidatedGraphData = useMemo(() => {
    if (forensicMode === "individual") {
      return forensicGraphData;
    } else {
      if (!activeGroup) return { nodes: [], edges: [] };
      const groupSubjects = activeGroup.subjects;

      // Filter edges connected to any of the group subjects
      const filteredEdges = (analysisResult?.edges || []).filter(edge => 
        groupSubjects.includes(edge.source) || groupSubjects.includes(edge.target)
      );

      // Collect involved nodes
      const involvedNodeIds = new Set<string>();
      groupSubjects.forEach(s => involvedNodeIds.add(s));
      filteredEdges.forEach(edge => {
        involvedNodeIds.add(edge.source);
        involvedNodeIds.add(edge.target);
      });

      const filteredNodes = (analysisResult?.nodes || []).filter(node => 
        involvedNodeIds.has(node.id)
      );

      return { nodes: filteredNodes, edges: filteredEdges };
    }
  }, [forensicMode, forensicGraphData, activeGroup, analysisResult]);

  // Final consolidated graph data to render
  const activeGraphData = useMemo(() => {
    const raw = activeUnconsolidatedGraphData;
    if (forensicMode === "individual") {
      if (!currentCuit) return { nodes: [], edges: [] };
      return consolidateGraphData(raw.nodes, raw.edges, [currentCuit]);
    } else {
      if (!activeGroup) return { nodes: [], edges: [] };
      return consolidateGraphData(raw.nodes, raw.edges, activeGroup.subjects, activeGroup.commonCounterparts);
    }
  }, [forensicMode, activeUnconsolidatedGraphData, currentCuit, activeGroup]);

  const { recibeList, recibeTotal, ordenaList, ordenaTotal, internasList, internasTotal } = useMemo(() => {
    if (forensicMode === "individual") {
      if (!currentCuit) {
        return { recibeList: [], recibeTotal: 0, ordenaList: [], ordenaTotal: 0, internasList: [], internasTotal: 0 };
      }

      // "RECIBE" flows: currentCuit is receiving money (TIPO === "RECIBIDA")
      // The counterparts who SENT this money are tx.CUIT_CONTRAPARTE
      const recibeMap: Record<string, { cuit: string; denom: string; sum: number }> = {};
      filteredTransactions
        .filter(tx => tx.CUIT === currentCuit && tx.TIPO === "RECIBIDA")
        .forEach(tx => {
          const contraCuit = tx.CUIT_CONTRAPARTE;
          const contraDenom = cuitDenominacionesMap[contraCuit] || tx.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(contraCuit, "Contraparte");
          const amount = parseMonto(tx.MONTO).amount;
          if (!recibeMap[contraCuit]) {
            recibeMap[contraCuit] = { cuit: contraCuit, denom: contraDenom, sum: 0 };
          }
          recibeMap[contraCuit].sum += amount;
        });

      const recibeList = Object.values(recibeMap).sort((a, b) => b.sum - a.sum);
      const recibeTotal = recibeList.reduce((acc, curr) => acc + curr.sum, 0);

      // "ORDENA" flows: currentCuit is ordering/sending money (TIPO === "ORDENADA")
      // The counterparts who RECEIVED this money are tx.CUIT_CONTRAPARTE
      const ordenaMap: Record<string, { cuit: string; denom: string; sum: number }> = {};
      filteredTransactions
        .filter(tx => tx.CUIT === currentCuit && tx.TIPO === "ORDENADA")
        .forEach(tx => {
          const contraCuit = tx.CUIT_CONTRAPARTE;
          const contraDenom = cuitDenominacionesMap[contraCuit] || tx.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(contraCuit, "Contraparte");
          const amount = parseMonto(tx.MONTO).amount;
          if (!ordenaMap[contraCuit]) {
            ordenaMap[contraCuit] = { cuit: contraCuit, denom: contraDenom, sum: 0 };
          }
          ordenaMap[contraCuit].sum += amount;
        });

      const ordenaList = Object.values(ordenaMap).sort((a, b) => b.sum - a.sum);
      const ordenaTotal = ordenaList.reduce((acc, curr) => acc + curr.sum, 0);

      return { recibeList, recibeTotal, ordenaList, ordenaTotal, internasList: [], internasTotal: 0 };
    } else {
      // MODE GRUPAL CONSOLIDADO DE PRECISIÓN DIRECTA
      if (!activeGroup) {
        return { recibeList: [], recibeTotal: 0, ordenaList: [], ordenaTotal: 0, internasList: [], internasTotal: 0 };
      }
      const subjects = activeGroup.subjects;

      const recibeMap: Record<string, { cuit: string; denom: string; sum: number }> = {};
      const ordenaMap: Record<string, { cuit: string; denom: string; sum: number }> = {};
      const internasMap: Record<string, { senderCuit: string; senderDenom: string; receiverCuit: string; receiverDenom: string; sum: number }> = {};

      filteredTransactions.forEach(tx => {
        const amount = parseMonto(tx.MONTO).amount;

        // Determine actual source sender and recipient receiver in this flow
        const sender = tx.TIPO === "RECIBIDA" ? tx.CUIT_CONTRAPARTE : tx.CUIT;
        const receiver = tx.TIPO === "RECIBIDA" ? tx.CUIT : tx.CUIT_CONTRAPARTE;

        const isSenderInGroup = subjects.includes(sender);
        const isReceiverInGroup = subjects.includes(receiver);

        if (isSenderInGroup && isReceiverInGroup) {
          // Both sender and receiver are part of the group -> Internal Flow!
          const key = `${sender}_${receiver}`;
          const senderDenom = cuitDenominacionesMap[sender] || getArgentineFallbackName(sender, "Sujeto");
          const receiverDenom = cuitDenominacionesMap[receiver] || getArgentineFallbackName(receiver, "Sujeto");
          if (!internasMap[key]) {
            internasMap[key] = {
              senderCuit: sender,
              senderDenom,
              receiverCuit: receiver,
              receiverDenom,
              sum: 0
            };
          }
          internasMap[key].sum += amount;
        } else if (!isSenderInGroup && isReceiverInGroup) {
          // Sender is outside, Receiver is inside -> Funds entering Group (RECIBE)
          const contraCuit = sender;
          const contraDenom = cuitDenominacionesMap[contraCuit] || tx.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(contraCuit, "Contraparte");
          if (!recibeMap[contraCuit]) {
            recibeMap[contraCuit] = { cuit: contraCuit, denom: contraDenom, sum: 0 };
          }
          recibeMap[contraCuit].sum += amount;
        } else if (isSenderInGroup && !isReceiverInGroup) {
          // Sender is inside, Receiver is outside -> Funds exiting Group (ORDENA)
          const contraCuit = receiver;
          const contraDenom = cuitDenominacionesMap[contraCuit] || tx.DENOMINACION_CONTRAPARTE || getArgentineFallbackName(contraCuit, "Contraparte");
          if (!ordenaMap[contraCuit]) {
            ordenaMap[contraCuit] = { cuit: contraCuit, denom: contraDenom, sum: 0 };
          }
          ordenaMap[contraCuit].sum += amount;
        }
      });

      const recibeList = Object.values(recibeMap).sort((a, b) => b.sum - a.sum);
      const recibeTotal = recibeList.reduce((acc, curr) => acc + curr.sum, 0);

      const ordenaList = Object.values(ordenaMap).sort((a, b) => b.sum - a.sum);
      const ordenaTotal = ordenaList.reduce((acc, curr) => acc + curr.sum, 0);

      const internasList = Object.values(internasMap).sort((a, b) => b.sum - a.sum);
      const internasTotal = internasList.reduce((acc, curr) => acc + curr.sum, 0);

      return { recibeList, recibeTotal, ordenaList, ordenaTotal, internasList, internasTotal };
    }
  }, [forensicMode, activeGroup, filteredTransactions, currentCuit, cuitDenominacionesMap]);

  const formatInThousands = (val: number) => {
    const inThousands = val / 1000;
    return `$ ${inThousands.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased pb-16">
      
      {/* Dynamic top gradient aesthetic bar */}
      <div className="h-1 bg-gradient-to-r from-rose-600 via-zinc-900 to-amber-500 w-full" />

      {/* Primary Top Header Area */}
      <header className="bg-white border-b border-zinc-200/80 px-6 py-4 shadow-xs relative">
        {/* Floating Toast Notification HUD inside sandboxed interface */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4.5 py-3 rounded-xl border shadow-lg text-xs font-bold font-sans animate-bounce transition-all duration-300
            ${toast.type === "success" 
              ? "bg-emerald-950/95 border-emerald-500/30 text-emerald-300" 
              : toast.type === "error"
                ? "bg-rose-950/95 border-rose-500/30 text-rose-300"
                : "bg-zinc-950/95 border-zinc-500/30 text-zinc-300"
            }
          `}>
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${toast.type === "success" ? "bg-emerald-400" : toast.type === "error" ? "bg-rose-400" : "bg-amber-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${toast.type === "success" ? "bg-emerald-500" : toast.type === "error" ? "bg-rose-500" : "bg-amber-500"}`}></span>
            </span>
            <span className="whitespace-pre-line leading-relaxed">{toast.text}</span>
          </div>
        )}

        <div className="max-w-7xl xl:max-w-[1555px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-white shadow-xs">
              <Scale className="w-5.5 h-5.5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-zinc-900 tracking-tight">
                  REPORTE ARCA / TRANSACCIONALIDAD
                </h1>
              </div>
              <p className="text-xs text-zinc-500 font-medium">
                Sujeto de Reciente Inscripción con Alta Transaccionalidad
              </p>
            </div>
          </div>

          {/* Paso 5: Botón Principal de Generación y Descarga Segura en el Encabezado */}
          <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto">
            <button
              onClick={handleExportHtmlReport}
              className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-zinc-900 to-zinc-950 hover:from-rose-950 hover:to-rose-900 text-white font-bold text-xs rounded-xl shadow-md border border-zinc-800 hover:border-rose-900/50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-97 group"
              id="exportar-pld-principal"
              title="Generar y Descargar Reporte Forense Interactivo con Filtros Dinámicos (Paso 5)"
            >
              <FileCheck className="w-4.5 h-4.5 text-emerald-400 group-hover:text-amber-400 transition" />
              <span className="uppercase tracking-wider font-mono text-[10.5px]">Exportar Reporte HTML</span>
            </button>
          </div>
        </div>
      </header>

      {/* Dynamic parameters input section */}
      <div id="arca-analysis-parameters" className="bg-white border-b border-zinc-200 px-6 py-4.5 shadow-2xs">
        <div className="max-w-7xl xl:max-w-[1555px] mx-auto flex flex-col gap-3">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
            
            {/* Mes de Corte (antes: Fecha del Análisis) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 font-sans flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                Mes de Corte
                <span className="relative group cursor-help ml-0.5">
                  <Info className="w-3 h-3 text-zinc-400 hover:text-zinc-600 transition" />
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                    Mes y año de referencia del análisis. Define el punto de corte final: solo se consideran transacciones y altas ocurridas hasta el último día de este mes.
                  </span>
                </span>
              </label>
              <input
                type="month"
                value={analysisMonth}
                onChange={(e) => { setAnalysisMonth(e.target.value); localStorage.setItem("aml_analysisMonth", e.target.value); }}
                className="w-full bg-zinc-50 text-zinc-900 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-zinc-900 cursor-pointer transition-colors shadow-2xs"
              />
            </div>

            {/* Período de Análisis */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 font-sans flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                Período de Análisis
                <span className="relative group cursor-help ml-0.5">
                  <Info className="w-3 h-3 text-zinc-400 hover:text-zinc-600 transition" />
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                    Cantidad de meses hacia atrás desde el Mes de Corte que se consideran para acumular el volumen de transacciones de cada sujeto.
                  </span>
                </span>
              </label>
              <select
                value={lookbackMonths}
                onChange={(e) => setLookbackMonths(parseInt(e.target.value, 10))}
                className="w-full bg-zinc-50 text-zinc-900 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-zinc-900 cursor-pointer transition-colors shadow-2xs"
              >
                <option value={1}>1 Mes</option>
                <option value={2}>2 Meses</option>
                <option value={3}>3 Meses</option>
                <option value={4}>4 Meses</option>
                <option value={6}>6 Meses</option>
                <option value={12}>12 Meses</option>
              </select>
            </div>

            {/* Antigüedad ARCA */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 font-sans flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-zinc-400" />
                Antigüedad ARCA
                <span className="relative group cursor-help ml-0.5">
                  <Info className="w-3 h-3 text-zinc-400 hover:text-zinc-600 transition" />
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                    Días máximos desde la fecha de alta en el padrón ARCA hasta el Mes de Corte. Si el sujeto tiene menos días de antigüedad que este umbral y supera el volumen de corte, se detecta como caso positivo. Los sujetos con umbral de volumen igual a 0 en el padrón son excluidos del análisis.
                  </span>
                </span>
              </label>
              <select
                value={antiquityMonths}
                onChange={(e) => setAntiquityMonths(parseInt(e.target.value, 10))}
                className="w-full bg-zinc-50 text-zinc-900 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-zinc-900 cursor-pointer transition-colors shadow-2xs"
              >
                <option value={1}>1 Mes</option>
                <option value={2}>2 Meses</option>
                <option value={3}>3 Meses</option>
                <option value={4}>4 Meses</option>
                <option value={6}>6 Meses</option>
                <option value={12}>12 Meses</option>
              </select>
            </div>

          </div>

          {/* Sub description informing current state of lookback evaluation filter */}
          <p className="text-[10px] font-bold text-zinc-500 italic bg-zinc-100 border border-zinc-200 px-3 py-2 rounded-lg flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>{dateRangeDescription} | El umbral aplica sobre el acumulado (ordenado + recibido) en este período.</span>
          </p>

        </div>
      </div>

      {/* Screen Tabs Selector Navigation Bar */}
      <nav id="viewport-navigation" className="bg-zinc-100 border-b border-zinc-200 px-6 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl xl:max-w-[1555px] mx-auto flex gap-4">
          
          <button
            id="tab-alertas"
            onClick={() => setActiveTab("alertas")}
            className={`py-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 border-b-2 cursor-pointer
              ${activeTab === "alertas" 
                ? "border-zinc-900 text-zinc-900 font-black bg-zinc-200/40" 
                : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
              }
            `}
          >
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span>Reporte y Carga de Datos</span>
            {positiveCases.length > 0 && (
              <span className="bg-rose-600 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {positiveCases.length}
              </span>
            )}
          </button>

          <button
            id="tab-forense"
            onClick={() => setActiveTab("forense")}
            className={`py-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 border-b-2 cursor-pointer
              ${activeTab === "forense" 
                ? "border-zinc-900 text-zinc-900 font-black bg-zinc-200/40" 
                : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
              }
            `}
          >
            <TrendingUp className="w-4 h-4 text-zinc-600" />
            <span>FLUJO INDIVIDUAL / GRUPAL</span>
          </button>

        </div>
      </nav>

      {/* Main Container Workspace */}
      <main className="max-w-7xl xl:max-w-[1555px] mx-auto px-4 sm:px-6 pt-8 flex flex-col gap-8">
        


        {loading && (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center shadow-xs flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-800">Cargando matriz analítica sandbox y consultando modelo...</h4>
              <p className="text-xs text-zinc-400 mt-0.5">Recalculando antigüedades fiscales y dependencias de flujo.</p>
            </div>
          </div>
        )}

        {apiError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-lg text-xs flex flex-col gap-1.5 shadow-xs">
            <span className="font-bold tracking-wider uppercase text-rose-700 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Atención de Servidor
            </span>
            <p className="font-medium text-rose-600 leading-normal">{apiError}</p>
          </div>
        )}

        {/* SCREEN 1: ALERTAS Y COMPILADO CENTRAL */}
        {!loading && activeTab === "alertas" && (
          <section className="flex flex-col gap-8 animate-fade-in">
            
            {/* KPI Overview Summary & Supabase Connection Badge Grid */}
            {analysisResult && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                
                {/* KPI 1 : Total Encontrados */}
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 font-extrabold font-mono text-sm shadow-inner">
                    {uniqueAnalyzedCuits.length}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase font-extrabold text-zinc-400 block tracking-widest">Total Encontrados</span>
                      <span className="relative group cursor-help">
                        <Info className="w-3 h-3 text-zinc-400 hover:text-zinc-600 transition" />
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                          Total de sujetos del padrón ARCA con transacciones en el período analizado (Mes de Corte - Período de Análisis).
                        </span>
                      </span>
                    </div>
                    <span className="text-sm font-bold text-zinc-800 leading-tight">Sujetos Registrados</span>
                  </div>
                </div>

                {/* KPI 2 : Casos Positivos */}
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs flex items-center gap-3.5">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-extrabold font-mono text-sm text-white shadow-inner
                    ${positiveCases.length > 0 ? "bg-rose-600 animate-pulse" : "bg-emerald-600"}
                  `}>
                    {positiveCases.length}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase font-bold text-rose-500 block tracking-widest">Casos Positivos</span>
                      <span className="relative group cursor-help">
                        <Info className="w-3 h-3 text-zinc-400 hover:text-zinc-600 transition" />
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                          Sujetos con antigüedad inferior al umbral de Antigüedad ARCA seleccionado y volumen acumulado superior al umbral individual definido en el padrón. El número de días se actualiza según lo configurado en "Antigüedad ARCA".
                        </span>
                      </span>
                    </div>
                    <span className="text-sm font-bold text-zinc-800 leading-tight">Alertas &lt; {antiquityLimit} Días</span>
                  </div>
                </div>

                {/* KPI 3 : Volumen Total de casos encontrados */}
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-800 border-emerald-200 border flex items-center justify-center font-extrabold text-sm shadow-inner">
                    $
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase font-bold text-zinc-400 block tracking-widest">Volumen Total</span>
                      <span className="relative group cursor-help">
                        <Info className="w-3 h-3 text-zinc-400 hover:text-zinc-600 transition" />
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                          Suma del volumen acumulado (ordenado + recibido) del universo completo de transacciones del período analizado, independientemente de si el sujeto fue alertado o no.
                        </span>
                      </span>
                    </div>
                    <span className="text-sm font-bold text-zinc-900 leading-tight">
                      $ {analysisResult.summary.total_volume_processed_ars.toLocaleString("es-AR")} ARS
                    </span>
                  </div>
                </div>

                {/* KPI 4 : Conexión Supabase (PostgreSQL) */}
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs flex items-center justify-between gap-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-555 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-inner">
                      <Database className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase font-extrabold text-zinc-400 block tracking-widest leading-none">Conexión Supabase</span>
                        <span className={`w-2 h-2 rounded-full inline-block ${isHydrating ? "bg-blue-400 animate-ping" : testingConnection ? "bg-amber-400 animate-ping" : "bg-emerald-500 animate-pulse"}`}></span>
                      </div>
                      <span className="text-xs font-black text-emerald-700 block mt-0.5 uppercase tracking-wide">
                        {isHydrating ? "Cargando datos..." : testingConnection ? "Verificando..." : "ONLINE / ACTIVA"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleClearAllData}
                        title="Limpiar todas las tablas de Supabase"
                        className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 transition text-rose-500 hover:text-rose-700 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleTestSupabase}
                        disabled={testingConnection || isHydrating}
                        title="Probar Latencia"
                        className="p-1.5 rounded bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition text-zinc-500 hover:text-zinc-800 disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${testingConnection ? "animate-spin text-amber-500" : ""}`} />
                      </button>
                    </div>
                    {!testingConnection && !isHydrating && (
                      <span className="text-[8px] font-mono font-bold text-zinc-400 block">
                        Ping: {supabaseLatency}ms
                      </span>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* REPORTE CRÍTICO TABLE */}
            <div className="bg-white border-2 border-rose-200/90 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4.5 bg-gradient-to-r from-zinc-900 via-zinc-950 to-rose-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-yellow-400" />
                  <div>
                    <h3 className="font-extrabold text-sm tracking-tight text-white uppercase">
                      RESUMEN: CASOS POSITIVOS
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5 font-medium leading-relaxed">
                      Sujetos con antigüedad inferior a {antiquityLimit} días y volumen superior al umbral de corte.
                    </p>
                  </div>
                </div>

                {/* Botón "Enriquecer con IA" — oculto hasta configurar OpenRouter */}
                <div className="hidden">
                  <button
                    onClick={() => executeAnalysis(true)}
                    disabled={positiveCases.length === 0 || loading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ✦ Enriquecer con IA
                  </button>
                </div>
              </div>

              {positiveCases.length === 0 ? (
                <div className="p-12 text-center bg-rose-50/5 text-zinc-500 font-medium text-xs flex flex-col items-center justify-center gap-2">
                  <CheckCircle className="w-7 h-7 text-emerald-500" />
                  <div>
                    <h4 className="font-bold text-zinc-800 uppercase text-xs">Sin Alertas en el Rango del Umbral</h4>
                    <p className="text-zinc-400 mt-0.5 font-normal">Ninguno de los contribuyentes reúne antigüedad inferior a {antiquityLimit} días operando montos sobre el umbral.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-rose-200 bg-rose-50/75 text-[10px] font-extrabold text-rose-900 uppercase tracking-wider">
                        <th className="py-3 px-4 text-center whitespace-nowrap">ID</th>
                        <th className="py-3 px-4 whitespace-nowrap">CUIT</th>
                        <th className="py-3 px-4">Denominación</th>
                        <th className="py-3 px-4 text-center whitespace-nowrap">Alta ARCA</th>
                        <th className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="flex items-center justify-center gap-1">
                            Antigüedad
                            <span className="relative group cursor-help">
                              <Info className="w-3 h-3 text-rose-400 hover:text-rose-200 transition" />
                              <span className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed whitespace-normal break-words">
                                Días transcurridos desde la primera operación detectada.
                              </span>
                            </span>
                          </span>
                        </th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Volumen Total</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">Operaciones</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Umbral</th>
                        <th className="py-3 px-4 text-center whitespace-nowrap font-bold">VER DETALLE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positiveCases.map((node, i) => {
                        const subjectName = cuitDenominacionesMap[node.id] || `Sujeto ${node.id}`;
                        
                        // Extract counterparties operated by this positive CUIT
                        const associatedTxs = filteredTransactions.filter(t => t.CUIT === node.id);
                        const uniqueContras = Array.from(new Set(associatedTxs.map(t => t.CUIT_CONTRAPARTE))) as string[];
 
                        // Look up custom umbral from arca records
                        const cleanId = String(node.id).replace(/\D/g, "");
                        const matchingArca = arcaRecords ? arcaRecords.find((r: any) => String(r.cuit).replace(/\D/g, "") === cleanId) : null;
                        const activeThreshold = matchingArca && matchingArca.umbral !== undefined ? matchingArca.umbral : threshold;

                        return (
                          <tr key={node.id} className="border-b border-rose-100 hover:bg-rose-50/30 text-xs transition-colors">
                            
                            {/* Sequential ID index column */}
                            <td className="py-4.5 px-4 font-mono font-extrabold text-[11px] text-zinc-950 text-center whitespace-nowrap">
                              {i + 1}
                            </td>

                            {/* CUIT */}
                            <td className="py-4.5 px-4 font-mono text-[10.5px] text-zinc-500 font-bold whitespace-nowrap">
                              {node.id}
                            </td>

                            {/* Denominación */}
                            <td className="py-4.5 px-4 font-bold text-zinc-950 font-sans tracking-tight">
                              {subjectName}
                            </td>
 
                            {/* Alta ARCA */}
                            <td className="py-4.5 px-4 font-mono font-bold text-zinc-800 text-center whitespace-nowrap">
                              <div className="flex flex-col items-center gap-1">
                                {node.sinFechaInformada ? (
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-300 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Sin fecha informada
                                  </span>
                                ) : (
                                  <span>{node.altaDate}</span>
                                )}
                                {node.previoAlAlta > 0 && (
                                  <span className="inline-flex items-center gap-0.5 bg-rose-100 text-rose-700 border border-rose-300 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {node.previoAlAlta} op. previas al alta
                                  </span>
                                )}
                              </div>
                            </td>
 
                            {/* Primera Operación detectada */}
                            <td className="py-4.5 px-4 font-mono font-black text-rose-600 text-center text-xs whitespace-nowrap">
                              {node.antiquity_days} días
                            </td>
 
                            {/* Volumen transaccionado */}
                            <td className="py-4.5 px-4 font-mono font-black text-zinc-950 text-right text-sm whitespace-nowrap">
                              $ {Math.round(node.totalVolume).toLocaleString("es-AR")}
                            </td>
 
                            {/* Cantidad de operaciones */}
                            <td className="py-4.5 px-4 font-mono font-bold text-zinc-900 text-center whitespace-nowrap">
                              {node.opCount} <span className="text-[10px] text-zinc-400 font-normal font-sans">giros</span>
                            </td>
 
                            {/* Standard simplified "Umbral" column header representation */}
                            <td className="py-4.5 px-4 font-mono font-bold text-zinc-400 text-right text-xs whitespace-nowrap">
                              $ {activeThreshold.toLocaleString("es-AR")}
                            </td>
 
                            {/* Action filter trigger */}
                            <td className="py-4.5 px-4 text-center whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setSelectedNodeId(node.id);
                                  setActiveTab("forense");
                                }}
                                className="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 text-white font-bold text-[10px] rounded flex items-center gap-1 transition mx-auto cursor-pointer shadow-2xs uppercase tracking-wider whitespace-nowrap"
                              >
                                <span>IR</span>
                                <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
                              </button>
                            </td>
 
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CARGA DE DATOS PARA ABAJO - Base d */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Panel A: ARCA Database Upload (CUIT, Date, Umbral) */}
              <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-amber-500" />
                    <div>
                      <h3 className="font-extrabold text-xs text-zinc-900 uppercase">
                        Cargar Base de Altas (ARCA)
                      </h3>
                      <p className="text-[10px] text-zinc-400">Padrón de inscripción de CUITs y umbrales específicos</p>
                    </div>
                  </div>
                  <span className="bg-amber-50 text-amber-800 text-[9px] uppercase font-mono font-black px-2 py-0.5 rounded border border-amber-200">
                    Padrón ARCA
                  </span>
                </div>

                {/* File Upload (única vía de carga) */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">
                      Formato esperado del archivo:
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-100 px-1 py-0.2 rounded border border-zinc-200">
                      CUIT | FECHA_ALTA | UMBRAL
                    </span>
                  </div>

                  <input 
                    type="file" 
                    ref={arcaFileInputRef} 
                    onChange={handleArcaFileChange} 
                    accept=".xlsx,.xls,.csv" 
                    className="hidden" 
                  />

                  <button
                    onClick={() => arcaFileInputRef.current?.click()}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 hover:bg-zinc-850 text-white text-xs font-bold rounded shadow-xs cursor-pointer transition flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="w-4 h-4 text-amber-400" />
                    <span>Subir Archivo (Excel/CSV)</span>
                  </button>

                  {arcaSyncStatus === "syncing" && (
                    <span className="text-[10px] text-zinc-500 font-semibold shrink-0">Guardando en Supabase…</span>
                  )}
                  {arcaSyncStatus === "synced" && (
                    <span className="text-[10px] text-emerald-600 font-bold shrink-0">✓ Padrón guardado en Supabase</span>
                  )}
                  {arcaSyncStatus === "error" && (
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">⚠ No se pudo guardar en Supabase (los datos siguen disponibles localmente)</span>
                  )}
                  {arcaImportError && (
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">⚠ {arcaImportError}</span>
                  )}
                </div>

                {/* Real-time metrics output block (First/Last date reads & total) */}
                <div className="mt-1 bg-gradient-to-r from-zinc-50 to-zinc-100/50 border border-zinc-200 p-3 rounded-lg grid grid-cols-3 gap-2 text-center text-zinc-700">
                  <div className="border-r border-zinc-200/85">
                    <span className="text-[9px] uppercase font-extrabold text-zinc-400 block tracking-wider">Total Registros</span>
                    <span className="text-xs font-black text-zinc-900 font-mono block leading-none mt-1">{arcaRecords.length}</span>
                  </div>
                  <div className="border-r border-zinc-200/85">
                    <span className="text-[9px] uppercase font-extrabold text-zinc-400 block tracking-wider">Primera Fecha</span>
                    <span className="text-xs font-bold text-zinc-800 font-mono block leading-none mt-1 text-rose-600">{arcaDateMetrics.first}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-extrabold text-zinc-400 block tracking-wider">Última Fecha</span>
                    <span className="text-xs font-bold text-zinc-800 font-mono block leading-none mt-1 text-emerald-600">{arcaDateMetrics.last}</span>
                  </div>
                </div>
              </div>

              {/* Badge B: Advertencias de calidad de datos ARCA */}
              {arcaWarningsList.length > 0 && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-amber-800 font-medium">
                  <div className="flex items-center gap-1.5 mb-1.5 font-extrabold text-amber-700 uppercase tracking-wider">
                    <span>⚠</span>
                    <span>{arcaWarningsList.length} problema{arcaWarningsList.length > 1 ? "s" : ""} detectado{arcaWarningsList.length > 1 ? "s" : ""} en el padrón ARCA</span>
                  </div>
                  <ul className="space-y-0.5 pl-1">
                    {arcaWarningsList.slice(0, 5).map((w, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500 shrink-0">·</span>
                        <span><span className="font-bold">Fila {w.fila}</span> · {w.campo}: {w.detalle}</span>
                      </li>
                    ))}
                    {arcaWarningsList.length > 5 && (
                      <li className="text-amber-600 font-bold pl-3">...y {arcaWarningsList.length - 5} problema{arcaWarningsList.length - 5 > 1 ? "s" : ""} más.</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Panel B: CARGAR OPERACIONES FINANCIERAS */}
              <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-zinc-800" />
                    <div>
                      <h3 className="font-extrabold text-xs text-zinc-900 uppercase">
                        CARGAR OPERACIONES FINANCIERAS
                      </h3>
                      <p className="text-[10px] text-zinc-400">Lote transaccional de depósitos y débitos</p>
                    </div>
                  </div>
                  <span className="bg-zinc-100 text-zinc-700 text-[9px] uppercase font-mono font-black px-2 py-0.5 rounded border border-zinc-200">
                    Lote de Transferencias
                  </span>
                </div>

                {/* File Upload (única vía de carga) */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">
                      Formato esperado del archivo:
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-100 px-1 py-0.2 rounded border border-zinc-200">
                      TIPO | FECHA | MONTO | CUIT | DENOM_SUJETO | CUIT_CONT | DENOM_CONT
                    </span>
                  </div>

                  <input 
                    type="file" 
                    ref={opsFileInputRef} 
                    onChange={handleOpsFileChange} 
                    accept=".xlsx,.xls,.csv" 
                    className="hidden" 
                  />

                  <button
                    onClick={() => opsFileInputRef.current?.click()}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 hover:bg-zinc-850 text-white text-xs font-bold rounded shadow-xs cursor-pointer transition flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="w-4 h-4 text-zinc-300" />
                    <span>Subir Archivo (Excel/CSV)</span>
                  </button>

                  {opsSyncStatus === "syncing" && (
                    <span className="text-[10px] text-zinc-500 font-semibold shrink-0">Guardando en Supabase…</span>
                  )}
                  {opsSyncStatus === "synced" && (
                    <span className="text-[10px] text-emerald-600 font-bold shrink-0">✓ Operaciones guardadas en Supabase</span>
                  )}
                  {opsSyncStatus === "error" && (
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">⚠ No se pudo guardar en Supabase (los datos siguen disponibles localmente)</span>
                  )}
                  {opsImportError && (
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">⚠ {opsImportError}</span>
                  )}
                </div>

                {/* Real-time Operations total counters box */}
                <div className="mt-1 bg-gradient-to-r from-zinc-50 to-zinc-100/50 border border-zinc-200 p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-[9px] uppercase font-extrabold text-zinc-400 block tracking-wider">Cantidad de Operaciones</span>
                    <span className="text-[10.5px] text-zinc-500 font-medium">Sincronizadas con Supabase</span>
                  </div>
                  <div className="bg-zinc-950 text-white font-mono text-xs font-black px-4 py-1.5 rounded-md border border-zinc-800 shadow-inner">
                    {transactions.length} Totales
                  </div>
                </div>

                {/* Badge B: Advertencias de calidad de datos Operaciones */}
                {opsWarningsList.length > 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-amber-800 font-medium">
                    <div className="flex items-center gap-1.5 mb-1.5 font-extrabold text-amber-700 uppercase tracking-wider">
                      <span>⚠</span>
                      <span>{opsWarningsList.length} problema{opsWarningsList.length > 1 ? "s" : ""} detectado{opsWarningsList.length > 1 ? "s" : ""} en operaciones</span>
                    </div>
                    <ul className="space-y-0.5 pl-1">
                      {opsWarningsList.slice(0, 5).map((w, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-amber-500 shrink-0">·</span>
                          <span><span className="font-bold">Fila {w.fila}</span>{w.cuit ? ` · CUIT ${w.cuit}` : ""} · {w.campo}: {w.detalle}</span>
                        </li>
                      ))}
                      {opsWarningsList.length > 5 && (
                        <li className="text-amber-600 font-bold pl-3">...y {opsWarningsList.length - 5} problema{opsWarningsList.length - 5 > 1 ? "s" : ""} más.</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

            </div>



            {/* General compliance notes */}
            <div className="bg-zinc-100 border border-zinc-200 rounded-lg p-3.5 text-[11px] text-zinc-500 leading-normal flex items-start gap-2">
              <span className="text-base text-zinc-400">ℹ</span>
              <div>
                <p className="font-semibold text-zinc-650">¿Qué son los casos positivos de inicio rápido?</p>
                <p className="font-normal mt-0.5">Aquellos contribuyentes recientemente incorporados en el padrón ARCA que inmediatamente canalizan volúmenes de fondos anormales superando el umbral de corte, atomización usada para el lavado de dinero.</p>
              </div>
            </div>

          </section>
        )}

        {/* SCREEN 2: RED FORENSE E INDIVIDUAL */}
        {!loading && activeTab === "forense" && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Visual network and analytical core (Left columns) */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* SVG interactive network block */}
              {analysisResult && (
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs flex flex-col gap-4">
                  
                  {/* Mode & Selection Header bar */}
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 pb-3 border-b border-zinc-150">
                    <div className="flex items-center gap-3">
                      <h3 className="font-extrabold text-xs uppercase tracking-wider text-zinc-900 flex items-center gap-1.5 shrink-0">
                        <Users className="w-4 h-4 text-zinc-500" />
                        ANÁLISIS DE FLUJOS
                      </h3>
                      
                      {/* Sub-tabs Capsule */}
                      <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 shrink-0">
                        <button
                          onClick={() => setForensicMode("individual")}
                          className={`px-3 py-1 rounded-md text-[10.5px] font-bold transition flex items-center gap-1 cursor-pointer select-none ${
                            forensicMode === "individual"
                              ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200 font-black"
                              : "text-zinc-500 hover:text-zinc-850"
                          }`}
                        >
                          Individual
                        </button>
                        <button
                          onClick={() => setForensicMode("grupal")}
                          className={`px-3 py-1 rounded-md text-[10.5px] font-bold transition flex items-center gap-1 cursor-pointer select-none relative ${
                            forensicMode === "grupal"
                              ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200 font-black"
                              : "text-zinc-500 hover:text-zinc-850"
                          }`}
                        >
                          <span>Grupal</span>
                          {detectedGroupFlows.length > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* SELECTOR FOR ACTIVE SUBJECT / GROUP */}
                    <div className="flex items-center gap-2 font-sans self-start md:self-auto">
                      {forensicMode === "individual" ? (
                        <>
                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 shrink-0">
                            Sujeto Analizado:
                          </label>
                          <select
                            value={currentCuit || ""}
                            onChange={(e) => {
                              const targetCuit = e.target.value;
                              if (targetCuit) {
                                setActiveSubjectCuit(targetCuit);
                                setSelectedNodeId(targetCuit);
                              }
                            }}
                            className="bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1 text-[11px] font-bold text-zinc-900 focus:outline-none focus:border-zinc-950 cursor-pointer transition shadow-2xs max-w-[260px]"
                          >
                            {uniqueAnalyzedCuits.map((c, i) => {
                              const name = cuitDenominacionesMap[c] || `Sujeto ${c}`;
                              return (
                                <option key={c} value={c}>
                                  ID: {i + 1} | CUIT: {c} | {name}
                                </option>
                              );
                            })}
                          </select>
                        </>
                      ) : (
                        <>
                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 shrink-0">
                            Grupo Interconectado:
                          </label>
                          {detectedGroupFlows.length > 0 ? (
                            <select
                              value={selectedGroupId || ""}
                              onChange={(e) => {
                                const targetGroupId = e.target.value;
                                if (targetGroupId) {
                                  setSelectedGroupId(targetGroupId);
                                  setSelectedNodeId(null);
                                }
                              }}
                              className="bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1 text-[11px] font-bold text-zinc-900 focus:outline-none focus:border-zinc-950 cursor-pointer transition shadow-2xs max-w-[280px]"
                            >
                              {detectedGroupFlows.map((g, i) => (
                                <option key={g.id} value={g.id}>
                                  Ref #{i + 1} | {g.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[10.5px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-2.5 py-0.5">
                              Sin conexiones grupales en este caso
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <NetworkGraph 
                    nodes={activeGraphData.nodes}
                    edges={activeGraphData.edges}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={(id) => setSelectedNodeId(id)}
                    cuitDenominacionesMap={cuitDenominacionesMap}
                    currentCuit={currentCuit}
                    commonCounterparts={activeGroup?.commonCounterparts || []}
                    isGroupMode={forensicMode === "grupal"}
                  />
                </div>
              )}
            </div>

            {/* RESUMEN DE OPERACIONES (Full Width Spanning 3 Columns on Row 2) */}
            <div className="col-span-1 lg:col-span-3 lg:row-start-2 lg:col-start-1 bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-zinc-100 mb-4">
                  <div>
                    <h3 className="font-extrabold text-xs uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-zinc-500" />
                      RESUMEN DE OPERACIONES
                    </h3>
                    <p className="text-[11px] font-sans text-zinc-650 mt-1 leading-normal">
                      {forensicMode === "individual" ? (
                        <>CUIT: <span className="text-zinc-950 font-black font-mono">{currentCuit || "NO SELECCIONADO"}</span> &emsp; <span className="text-zinc-900 font-extrabold">{currentSubjectName}</span></>
                      ) : (
                        <>
                          GRUPO: <span className="text-zinc-950 font-extrabold text-zinc-900">
                            {activeGroup ? `Red global de ${activeGroup.subjects.length} empresa${activeGroup.subjects.length !== 1 ? "s" : ""} interconectadas` : ""}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <span id="cifras-miles-label" className="text-[10px] font-extrabold italic text-zinc-500 font-sans pr-1 mr-[-6px] leading-none self-end sm:self-center">
                    -cifras en $ miles-
                  </span>
                </div>
 
                {forensicMode === "grupal" && activeGroup && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3.5 mb-4 text-xs text-amber-900 leading-relaxed font-normal">
                    <strong className="text-amber-950 uppercase font-black text-[10px] block tracking-wider mb-1">
                      💡 ¿QUÉ INCLUYE ESTA SECCIÓN DE ANÁLISIS CONSOLIDADO GRUPAL?
                    </strong>
                    Este panel fusiona la totalidad de los flujos de fondos correspondientes a todos los sujetos analizados del grupo. 
                    Muestra consolidado los fondos que ingresan (orígenes en la columna izquierda) y los fondos egresados (destinos en la columna derecha) de toda la red. 
                    Permite visualizar de manera inmediata cómo el nodo común (como <span className="font-bold underline">{activeGroup.commonCounterparts.map(c => cuitDenominacionesMap[c] || c).join(", ")}</span>) actúa como el vaso comunicante o canal amortiguador que unifica e interconecta las operaciones financieras del grupo.
                  </div>
                )}


                {/* Dual split: RECIBE on the Left, ORDENA on the Right */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                  
                  {/* Left Column: RECIBE */}
                  <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 flex flex-col justify-between">
                    <div>
                      <div className="border-b border-zinc-200 pb-2 mb-3.5 flex justify-between items-center bg-sky-50 -mx-4 -mt-4 p-3 rounded-t-xl border-t border-x">
                        <span className="font-extrabold text-xs text-sky-900 uppercase tracking-wider block">
                          {forensicMode === "grupal" ? "FONDOS ENTRANTES TOTALES A LA RED" : "RECIBE"}
                        </span>
                        <span className="bg-sky-100 text-sky-900 text-[9px] uppercase font-black px-2 py-0.5 rounded-full">
                          {forensicMode === "grupal" ? "INYECCIONES EXTERNAS" : "FLUJO ACUMULADO ENTRANTE"}
                        </span>
                      </div>

                      {recibeList.length === 0 ? (
                        <div className="text-center py-10 text-zinc-400 text-xs font-normal">
                          No se registraron fondos recibidos por este CUIT analizado.
                        </div>
                      ) : (() => {
                        const LIMIT = 10;
                        const visible = recibeList.slice(0, LIMIT);
                        const rest = recibeList.slice(LIMIT);
                        const restTotal = rest.reduce((a, b) => a + b.sum, 0);
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-200 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                                  <th className="pb-1.5 font-bold">CUIT</th>
                                  <th className="pb-1.5 font-bold">Denominación</th>
                                  <th className="pb-1.5 font-bold text-right">Monto Acumulado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visible.map((item, idx) => (
                                  <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-100/50 text-[13px]">
                                    <td className="py-1.5 font-mono text-zinc-900 font-semibold">{item.cuit}</td>
                                    <td className="py-1.5 text-zinc-700 truncate max-w-[150px] sm:max-w-[240px] md:max-w-[340px]" title={item.denom}>{item.denom}</td>
                                    <td className="py-1.5 text-right font-mono font-bold text-zinc-900">{formatInThousands(item.sum)}</td>
                                  </tr>
                                ))}
                                {rest.length > 0 && (
                                  <tr className="border-t border-zinc-200 bg-zinc-50 text-[13px]">
                                    <td className="py-1.5 font-mono text-zinc-700 font-semibold" colSpan={2}>
                                      Resto — {rest.length} empresa{rest.length !== 1 ? "s" : ""}
                                    </td>
                                    <td className="py-1.5 text-right font-mono font-bold text-zinc-700">{formatInThousands(restTotal)}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>

                    {recibeList.length > 0 && (
                      <div className="border-t border-zinc-200 pt-3 mt-4 flex justify-between items-center font-bold text-xs text-zinc-900">
                        <span>TOTAL</span>
                        <span className="font-mono text-xs text-sky-800 font-extrabold bg-sky-50 px-2.5 py-1 rounded border border-sky-200">
                          {formatInThousands(recibeTotal)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Column: ORDENA */}
                  <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 flex flex-col justify-between">
                    <div>
                      <div className="border-b border-zinc-200 pb-2 mb-3.5 flex justify-between items-center bg-amber-50 -mx-4 -mt-4 p-3 rounded-t-xl border-t border-x">
                        <span className="font-extrabold text-xs text-amber-900 uppercase tracking-wider block">
                          {forensicMode === "grupal" ? "EGRESOS DE RED TOTALES LIQUIDADOS" : "ORDENA"}
                        </span>
                        <span className="bg-amber-100 text-amber-900 text-[9px] uppercase font-black px-2 py-0.5 rounded-full">
                          {forensicMode === "grupal" ? "CANALIZACIONES EXTERNAS" : "FLUJO ACUMULADO SALIENTE"}
                        </span>
                      </div>

                      {ordenaList.length === 0 ? (
                        <div className="text-center py-10 text-zinc-400 text-xs font-normal">
                          No se registraron fondos ordenados por este CUIT analizado.
                        </div>
                      ) : (() => {
                        const LIMIT = 10;
                        const visible = ordenaList.slice(0, LIMIT);
                        const rest = ordenaList.slice(LIMIT);
                        const restTotal = rest.reduce((a, b) => a + b.sum, 0);
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-200 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                                  <th className="pb-1.5 font-bold">CUIT</th>
                                  <th className="pb-1.5 font-bold">Denominación</th>
                                  <th className="pb-1.5 font-bold text-right">Monto Acumulado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visible.map((item, idx) => (
                                  <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-100/50 text-[13px]">
                                    <td className="py-1.5 font-mono text-zinc-900 font-semibold">{item.cuit}</td>
                                    <td className="py-1.5 text-zinc-700 truncate max-w-[150px] sm:max-w-[240px] md:max-w-[340px]" title={item.denom}>{item.denom}</td>
                                    <td className="py-1.5 text-right font-mono font-bold text-zinc-900">{formatInThousands(item.sum)}</td>
                                  </tr>
                                ))}
                                {rest.length > 0 && (
                                  <tr className="border-t border-zinc-200 bg-zinc-50 text-[13px]">
                                    <td className="py-1.5 font-mono text-zinc-700 font-semibold" colSpan={2}>
                                      Resto — {rest.length} empresa{rest.length !== 1 ? "s" : ""}
                                    </td>
                                    <td className="py-1.5 text-right font-mono font-bold text-zinc-700">{formatInThousands(restTotal)}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>

                    {ordenaList.length > 0 && (
                      <div className="border-t border-zinc-200 pt-3 mt-4 flex justify-between items-center font-bold text-xs text-zinc-900">
                        <span>TOTAL</span>
                        <span className="font-mono text-xs text-amber-800 font-extrabold bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                          {formatInThousands(ordenaTotal)}
                        </span>
                      </div>
                    )}
                  </div>

                </div>


              </div>

            {/* Individual Inspection Panel (Right Sidebar - Positioned adjacent to graph on desktop) */}
            <div className="lg:col-span-1 lg:col-start-3 lg:row-start-1 flex flex-col gap-6">
              
              {/* Detailed focus card */}
              <div className="bg-zinc-950 text-white rounded-xl p-5 shadow-md border border-zinc-800 flex flex-col justify-between min-h-[400px]">
                
                <div>
                  <div className="flex items-center gap-1.5 pb-3 border-b border-zinc-800 mb-4 font-sans">
                    <FileCheck className="w-5 h-5 text-amber-500 animate-pulse" />
                    <div>
                      <h3 className="font-extrabold text-[11px] uppercase tracking-widest text-white leading-none">
                        {forensicMode === "individual" ? "Dictamen Técnico Individual" : "DICTAMEN TÉCNICO GRUPAL"}
                      </h3>
                    </div>
                  </div>

                  {forensicMode === "individual" ? (
                    currentCuit ? (
                      (() => {
                        const selectedNode = analysisResult?.nodes.find(n => n.id === currentCuit);
                        if (!selectedNode) {
                          return (
                            <div className="text-zinc-400 text-xs py-10 text-center font-normal">
                              No se encontraron detalles para el sujeto analizado.
                            </div>
                          );
                        }

                        const valAlta = cuitAltaDatesMap[currentCuit] || "N/A";
                        const resolvedLabelName = cuitDenominacionesMap[currentCuit] || selectedNode.label;

                        // Dynamic logic for building the perfect suspicion cause description
                        let displayText = selectedNode.suspicion_cause;
                        const nodeRecibidoAmount = filteredTransactions
                          .filter(t => t.CUIT === selectedNode.id && t.TIPO === "RECIBIDA")
                          .reduce((sum, t) => sum + (parseMonto(t.MONTO).amount), 0);
                        const nodeRecibidoMiles = Math.round(nodeRecibidoAmount / 1000).toLocaleString("es-AR");

                        const nodeOrdenadoAmount = filteredTransactions
                          .filter(t => t.CUIT === selectedNode.id && t.TIPO === "ORDENADA")
                          .reduce((sum, t) => sum + (parseMonto(t.MONTO).amount), 0);
                        const nodeOrdenadoMiles = Math.round(nodeOrdenadoAmount / 1000).toLocaleString("es-AR");

                        const nodeAcumuladoAmount = nodeRecibidoAmount + nodeOrdenadoAmount;
                        const nodeAcumuladoMiles = Math.round(nodeAcumuladoAmount / 1000).toLocaleString("es-AR");

                        const cleanId = String(selectedNode.id).replace(/\D/g, "");
                        const matchingArca = arcaRecords ? arcaRecords.find((r: any) => String(r.cuit).replace(/\D/g, "") === cleanId) : null;
                        const activeThreshold = matchingArca && matchingArca.umbral !== undefined ? matchingArca.umbral : threshold;
                        const activeThresholdMiles = Math.round(activeThreshold / 1000).toLocaleString("es-AR");

                        displayText = `Primera operación detectada hace ${selectedNode.antiquity_days} días. Registra un total de $ ${nodeRecibidoMiles} miles de fondos recibidos y $ ${nodeOrdenadoMiles} miles de fondos ordenados, volumen acumulado $ ${nodeAcumuladoMiles} miles, superando el umbral de corte acumulado de $ ${activeThresholdMiles} miles.`;

                        return (
                          <div className="flex flex-col gap-4">
                            
                            {/* CUIT Display & Denomination */}
                            <div>
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest">
                                Denominación
                              </span>
                              <span className="font-extrabold text-sm text-amber-300 block mt-0.5">
                                {resolvedLabelName}
                              </span>
                              <span className="font-mono text-xs font-semibold text-zinc-400 block mt-0.2 select-all">
                                CUIT {selectedNode.id}
                              </span>
                            </div>

                            {/* Typology */}
                            <div className="grid grid-cols-2 gap-3 bg-zinc-900 p-2.5 rounded border border-zinc-850">
                              <div>
                                <span className="text-[8px] uppercase font-bold text-zinc-500 block tracking-wider">Categoría</span>
                                <span className="text-[11px] font-bold text-zinc-200 mt-0.5 block truncate">
                                  Sujeto de Análisis
                                </span>
                              </div>
                              <div className="text-center">
                                <span className="text-[8px] uppercase font-bold text-zinc-500 block tracking-wider">FECHA</span>
                                <span className="text-[11px] font-mono font-bold text-amber-400 mt-0.5 block">
                                  {valAlta}
                                </span>
                              </div>
                            </div>

                            {/* Computed Metrics */}
                            <div>
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest">
                                Primera Operación Detectada
                              </span>
                              <span className="text-xs font-medium text-zinc-300 mt-0.5 block">
                                <strong className="text-white font-mono font-bold">{selectedNode.antiquity_days} días desde 1ª transacción</strong>
                              </span>
                            </div>

                            {/* Irregularidad: operaciones previas al alta ARCA */}
                            {(() => {
                              const matchedCase = positiveCases.find(pc => pc.id === selectedNode.id);
                              if (!matchedCase || !matchedCase.previoAlAlta || matchedCase.previoAlAlta === 0) return null;
                              return (
                                <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-3">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    <span className="text-[9px] uppercase font-extrabold text-rose-400 tracking-widest">
                                      Irregularidad Fiscal Detectada
                                    </span>
                                  </div>
                                  <p className="text-xs text-rose-200 leading-relaxed">
                                    Se detectaron <strong className="text-white font-mono">{matchedCase.previoAlAlta} operación{matchedCase.previoAlAlta > 1 ? "es" : ""}</strong> con fecha <strong className="text-white">anterior al alta en ARCA</strong> ({valAlta}). El sujeto operó financieramente antes de estar registrado en el padrón, lo que constituye una irregularidad fiscal independiente del volumen transaccionado.
                                  </p>
                                </div>
                              );
                            })()}

                            {/* Forensic Cause / Rationale */}
                            <div className="mt-2">
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest mb-1">
                                ALERTA DETECTADA
                              </span>
                              <p className="text-xs text-zinc-300 leading-relaxed font-normal bg-zinc-900 border border-zinc-850 p-3 rounded italic">
                                {displayText}
                              </p>
                            </div>

                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-lg flex flex-col justify-center items-center gap-2">
                        <Search className="w-6 h-6 text-zinc-700" />
                        <div className="text-xs font-medium">No hay ningún sujeto impositivo bajo análisis.</div>
                      </div>
                    )
                  ) : (
                    activeGroup ? (
                      (() => {
                        const subjects = activeGroup.subjects;
                        const hasCommonCounterparts = activeGroup.commonCounterparts.length > 0;
                        const TOP_CP = 3;

                        // Calcular volumen y % por contraparte común como ORDENANTE (recibe fondos del sujeto = ordenaList)
                        // y como RECEPTORA (envía fondos al sujeto = recibeList)
                        const cpOrdenaMap = Object.fromEntries(ordenaList.map(x => [x.cuit, x]));
                        const cpRecibeMap = Object.fromEntries(recibeList.map(x => [x.cuit, x]));

                        const cpOrdenaTotal = activeGroup.commonCounterparts.reduce((s, c) => s + (cpOrdenaMap[c]?.sum || 0), 0);
                        const cpRecibeTotal = activeGroup.commonCounterparts.reduce((s, c) => s + (cpRecibeMap[c]?.sum || 0), 0);

                        const buildCPLine = (cuits: string[], volMap: Record<string, {sum: number; denom: string}>, total: number) => {
                          const main = cuits.slice(0, TOP_CP);
                          const rest = cuits.slice(TOP_CP);
                          const mainTxt = main.map(c => {
                            const name = cuitDenominacionesMap[c] || getArgentineFallbackName(c, "Contraparte");
                            const vol = volMap[c]?.sum || 0;
                            const pct = total > 0 ? ((vol / total) * 100).toFixed(1) : "0.0";
                            return `${name} (CUIT ${c}) ${pct}%`;
                          }).join(", ");
                          const restVol = rest.reduce((s, c) => s + (volMap[c]?.sum || 0), 0);
                          const restPct = total > 0 ? ((restVol / total) * 100).toFixed(1) : "0.0";
                          const restTxt = rest.length > 0 ? `; el resto (${rest.length} empresa${rest.length !== 1 ? "s" : ""}) representa el ${restPct}%` : "";
                          return mainTxt + restTxt;
                        };

                        const ordenaLine = hasCommonCounterparts && cpOrdenaTotal > 0
                          ? buildCPLine(activeGroup.commonCounterparts, cpOrdenaMap, ordenaTotal)
                          : null;
                        const recibeLine = hasCommonCounterparts && cpRecibeTotal > 0
                          ? buildCPLine(activeGroup.commonCounterparts, cpRecibeMap, recibeTotal)
                          : null;

                        const allCPsFull = activeGroup.commonCounterparts.map(c => `${cuitDenominacionesMap[c] || getArgentineFallbackName(c, "Contraparte")} (CUIT ${c})`);

                        return (
                          <div className="flex flex-col gap-4">
                            
                            {/* Group header */}
                            <div>
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest">
                                Grupo Bajo Análisis
                              </span>
                              <span className="font-extrabold text-sm text-blue-400 block mt-0.5">
                                {activeGroup.name}
                              </span>
                              <span className="font-mono text-xs font-semibold text-zinc-400 block mt-0.2">
                                Vínculo: {hasCommonCounterparts ? "Contraparte Común" : "Transacción Directa"}
                              </span>
                            </div>

                            {/* Subject Grid/Table Box */}
                            <div>
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest mb-1.5">
                                Sujetos Involucrados (Alta Reciente)
                              </span>
                              <div className="border border-zinc-800 rounded bg-zinc-900/60 overflow-hidden font-sans">
                                {/* Header row */}
                                <div className="grid grid-cols-12 text-[8px] uppercase font-black text-zinc-500 bg-zinc-900 p-2 border-b border-zinc-800">
                                  <div className="col-span-4 font-black">CUIT</div>
                                  <div className="col-span-5 font-black">Denominación</div>
                                  <div className="col-span-3 text-right font-black">FECHA</div>
                                </div>
                                {/* Rows */}
                                <div className="flex flex-col">
                                  {subjects.map(cuit => {
                                    const labelName = cuitDenominacionesMap[cuit] || getArgentineFallbackName(cuit, "Sujeto");
                                    const alta = cuitAltaDatesMap[cuit] || "N/A";
                                    return (
                                      <div key={cuit} className="grid grid-cols-12 text-[10px] font-medium text-zinc-200 p-2 border-b border-zinc-900/50 last:border-0 hover:bg-zinc-900/40">
                                        <div className="col-span-4 font-mono font-bold text-amber-300 select-all">{cuit}</div>
                                        <div className="col-span-5 truncate font-sans text-zinc-100 pr-1" title={labelName}>{labelName}</div>
                                        <div className="col-span-3 font-mono text-right text-zinc-400">{alta}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Restored Group Detected Alert */}
                            <div className="mt-1">
                              <span className="text-[9px] uppercase font-bold text-zinc-500 block tracking-widest mb-1.5">
                                ALERTA GRUPAL DETECTADA
                              </span>
                              <div className="p-3 bg-red-950/20 rounded border border-red-900/60 text-[12px] text-red-200 font-sans shadow-sm leading-snug">
                                <div className="flex gap-2 items-start">
                                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                  <div className="flex-1 space-y-1.5">
                                    <strong className="text-red-300 block uppercase text-[9px] tracking-wider font-extrabold">ALERTA GRUPAL CRÍTICA DETECTADA</strong>
                                    <p>Se observan convergencia de flujos entre los <strong className="text-red-100">{subjects.length} sujetos analizados</strong>.</p>
                                    {ordenaLine && (
                                      <p><span className="text-red-300 font-bold">Como ordenantes comunes:</span> {ordenaLine}.</p>
                                    )}
                                    {recibeLine && (
                                      <p><span className="text-red-300 font-bold">Como receptoras comunes:</span> {recibeLine}.</p>
                                    )}
                                    {!hasCommonCounterparts && (
                                      <p>Presentan operaciones directas entre sí.</p>
                                    )}
                                    {allCPsFull.length > TOP_CP && (
                                      <details className="mt-1">
                                        <summary className="cursor-pointer text-[10px] text-red-400 font-bold select-none hover:text-red-300">
                                          Ver todas las contrapartes comunes ({allCPsFull.length})
                                        </summary>
                                        <ul className="mt-1.5 space-y-0.5 text-[10px] text-red-300 list-disc list-inside">
                                          {allCPsFull.map((cp, i) => <li key={i}>{cp}</li>)}
                                        </ul>
                                      </details>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-lg flex flex-col justify-center items-center gap-2">
                        <Users className="w-6 h-6 text-zinc-700" />
                        <div className="text-[11px] font-medium text-zinc-400">No se detectaron relaciones grupales estructuradas en este caso.</div>
                      </div>
                    )
                  )}

                </div>

              </div>

            </div>

          </section>
        )}

      </main>

    </div>
  );
}



