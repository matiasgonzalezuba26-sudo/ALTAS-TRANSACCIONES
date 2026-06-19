export interface Transaction {
  OPERACION: "TRANSFERENCIA";
  TIPO: "RECIBIDA" | "ORDENADA";
  FECHA: string; // dd/mm/yyyy
  MONTO: string; // ####.00
  CUIT: string; // ##-########-#
  CUIT_CONTRAPARTE: string;
  FECHA_ALTA_CUIT: string; // dd/mm/yyyy
  DENOMINACION_SUJETO?: string;
  DENOMINACION_CONTRAPARTE?: string;
}

export interface AMLSummary {
  total_cuits_analyzed: number;
  high_risk_cases_detected: number;
  total_volume_processed_ars: number;
}

export interface AMLNode {
  id: string;
  label: string;
  type: "ANALIZADO" | "CONTRAPARTE";
  risk_level: "BAJO" | "MEDIO" | "ALTO";
  antiquity_days: number;
  suspicion_cause: string;
}

export interface AMLEdge {
  id: string;
  source: string;
  target: string;
  amount_ars: number;
  date: string;
  alert_reason: string;
}

export interface AMLAnalysisResult {
  summary: AMLSummary;
  nodes: AMLNode[];
  edges: AMLEdge[];
}

export interface PresetCase {
  id: string;
  name: string;
  description: string;
  transactions: Transaction[];
  suggestedThreshold: number;
  suggestedDays: number;
}
