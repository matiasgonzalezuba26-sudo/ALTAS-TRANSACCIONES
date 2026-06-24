import express from "express";
// OpenRouter: no SDK needed, uses native fetch
import dotenv from "dotenv";
import { supabaseAdmin, isSupabaseConfigured } from "../lib/supabaseAdmin";

dotenv.config();

export const app = express();

// Middleware for parsing JSON requests with clean boundaries
app.use(express.json({ limit: "10mb" }));

// Parsea MONTO tolerando formatos argentinos y valores nulos; devuelve 0 si inválido
function parseMonto(value: any): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const str = String(value).trim();
  const cleaned = str
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[,]|$))/g, "")
    .replace(/,/g, ".");
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

// Helper function to calculate calendar day difference
function getDaysDifference(date1Str: string, date2Str: string): number {
  try {
    const [d1, m1, y1] = date1Str.split("/").map(Number);
    const [d2, m2, y2] = date2Str.split("/").map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch (error) {
    return 0;
  }
}

// Highly accurate deterministic local AML engine as fallback or local alternative
function performLocalAnalysis(transactions: any[], thresholdPrice: number, antiquityDaysLimit: number = 90, arcaRecords: any[] = []) {
  const uniqueSubjects = new Map<string, { earliestTxDate: string, altaDate: string }>();
  const counterparties = new Set<string>();
  let totalVolume = 0;

  // Process and gather information
  transactions.forEach(tx => {
    const amount = parseMonto(tx.MONTO);
    totalVolume += amount;

    if (tx.CUIT) {
      if (!uniqueSubjects.has(tx.CUIT)) {
        uniqueSubjects.set(tx.CUIT, {
          earliestTxDate: tx.FECHA,
          altaDate: tx.FECHA_ALTA_CUIT || tx.FECHA
        });
      } else {
        // Actualizar earliestTxDate si esta transacción es más antigua que la guardada
        const existing = uniqueSubjects.get(tx.CUIT)!;
        const [de, me, ye] = existing.earliestTxDate.split("/").map(Number);
        const [dt, mt, yt] = (tx.FECHA || "").split("/").map(Number);
        if (dt && mt && yt) {
          const existingDate = new Date(ye, me - 1, de);
          const txDate = new Date(yt, mt - 1, dt);
          if (txDate < existingDate) {
            uniqueSubjects.set(tx.CUIT, { ...existing, earliestTxDate: tx.FECHA });
          }
        }
      }
    }
    if (tx.CUIT_CONTRAPARTE) {
      counterparties.add(tx.CUIT_CONTRAPARTE);
    }
  });

  const nodesList: any[] = [];
  const edgesList: any[] = [];
  let highRiskCount = 0;

  // Evaluate subject nodes
  uniqueSubjects.forEach((info, cuit) => {
    const antiquity = getDaysDifference(info.altaDate, info.earliestTxDate);
    const isNewcomer = antiquity < antiquityDaysLimit;

    // Calculate aggregated amounts or picos
    const cuitTxs = transactions.filter(t => t.CUIT === cuit);
    const maxSingleMonto = Math.max(...cuitTxs.map(t => parseMonto(t.MONTO)), 0);
    const totalCuitVolume = cuitTxs.reduce((sum, t) => sum + (parseMonto(t.MONTO)), 0);

    // Look up custom umbral from arca records
    const cleanCuitStr = String(cuit).replace(/\D/g, "");
    const matchingArca = arcaRecords ? arcaRecords.find((r: any) => String(r.cuit).replace(/\D/g, "") === cleanCuitStr) : null;

    // Strict constraint: only analyze subjects with registered thresholds inside ARCA
    if (!matchingArca || !matchingArca.umbral || matchingArca.umbral <= 0) {
      return;
    }

    const activeThreshold = matchingArca.umbral;
    const exceedsUmbral = totalCuitVolume > activeThreshold;
    
    let riskLevel: "BAJO" | "MEDIO" | "ALTO" = "BAJO";
    let suspicionCause = "";

    if (isNewcomer && exceedsUmbral) {
      riskLevel = "ALTO";
      highRiskCount++;
      suspicionCause = `CRÍTICO: Cuenta dada de alta hace solo ${antiquity} días. Registra un volumen acumulado de $ ${Math.round(totalCuitVolume / 1000).toLocaleString("es-AR")} mil en el período, superando el umbral de corte acumulado de $ ${Math.round(activeThreshold / 1000).toLocaleString("es-AR")} mil (fijado p/ período). Alerta compatible con tipología de 'Empresa Cáscara de Uso Único' o instrumental.`;
    } else if (isNewcomer) {
      riskLevel = "MEDIO";
      suspicionCause = `PREVENTIVO: Contribuyente dado de alta recientemente (${antiquity} días). Su volumen acumulado de $ ${Math.round(totalCuitVolume / 1000).toLocaleString("es-AR")} mil no supera el umbral límite de $ ${Math.round(activeThreshold / 1000).toLocaleString("es-AR")} mil para el período, pero se recomienda monitoreo preventivo.`;
    } else if (exceedsUmbral) {
      riskLevel = "MEDIO";
      suspicionCause = `MONITOREO: Contribuyente con antigüedad fiscal consolidada (${antiquity} días). Supera el umbral transaccional acumulado asignado de $ ${Math.round(activeThreshold / 1000).toLocaleString("es-AR")} mil en el período con un acumulado total de $ ${Math.round(totalCuitVolume / 1000).toLocaleString("es-AR")} mil. Patrón transaccional inusual pero mitigado por madurez fiscal.`;
    } else {
      riskLevel = "BAJO";
      suspicionCause = `Establecido: Antigüedad de ${antiquity} días con volumen acumulado de $ ${Math.round(totalCuitVolume / 1000).toLocaleString("es-AR")} mil, consistente dentro del rango estándar parametrizado para el período.`;
    }

    // Try to find a custom denomination name for the subject CUIT
    const associatedTxWithDenom = transactions.find(t => t.CUIT === cuit && t.DENOMINACION_SUJETO);
    const subjectLabel = associatedTxWithDenom ? associatedTxWithDenom.DENOMINACION_SUJETO : `Sujeto ${cuit}`;

    nodesList.push({
      id: cuit,
      label: subjectLabel,
      type: "ANALIZADO",
      risk_level: riskLevel,
      antiquity_days: antiquity,
      suspicion_cause: suspicionCause
    });
  });

  // Evaluate counterpart nodes
  counterparties.forEach(cuitContra => {
    // Keep it unique if counterpart is not already in analyzed nodes.
    if (!uniqueSubjects.has(cuitContra)) {
      // Find transactions to check if it interacts with high risk nodes
      const isLinkedToHighRisk = transactions.some(t => {
        if (t.CUIT_CONTRAPARTE === cuitContra) {
          const subjectNode = nodesList.find(n => n.id === t.CUIT);
          return subjectNode && subjectNode.risk_level === "ALTO";
        }
        return false;
      });

      const associatedTxWithDenom = transactions.find(t => t.CUIT_CONTRAPARTE === cuitContra && t.DENOMINACION_CONTRAPARTE);
      const counterpartLabel = associatedTxWithDenom ? associatedTxWithDenom.DENOMINACION_CONTRAPARTE : `Contraparte ${cuitContra}`;

      nodesList.push({
        id: cuitContra,
        label: counterpartLabel,
        type: "CONTRAPARTE",
        risk_level: isLinkedToHighRisk ? "MEDIO" : "BAJO",
        antiquity_days: 0,
        suspicion_cause: isLinkedToHighRisk 
          ? `CONTRAFLUJO: Entidad receptora/emisora de fondos vinculada a un CUIT calificado con ALTO RIESGO por sospecha de uso único o picos injustificados.`
          : `Canal General: Cuenta de contraparte convencional participante en el flujo de transferencias del sandbox.`
      });
    }
  });

  // Build edges
  transactions.forEach((tx, i) => {
    const amount = parseMonto(tx.MONTO);
    const isTransgressor = amount > thresholdPrice;
    
    // Check subject's antiquity for this transaction
    const subjectAlta = tx.FECHA_ALTA_CUIT || tx.FECHA;
    const txAntiquity = getDaysDifference(subjectAlta, tx.FECHA);
    const isEarlyStage = txAntiquity < antiquityDaysLimit;

    let alertReason = "Flujo normal dentro del umbral financiero parametrizado.";
    if (isTransgressor && isEarlyStage) {
      alertReason = `ALERTA CRÍTICA: Desvío extremo. Pico transaccional de ${amount.toLocaleString("es-AR")} ARS en cuenta de solo ${txAntiquity} días de alta.`;
    } else if (isTransgressor) {
      alertReason = `DESVÍO DE UMBRAL: Transferencia individual excede el umbral máximo asignado (${thresholdPrice.toLocaleString("es-AR")} ARS) en una cuenta fiscal madura.`;
    } else if (isEarlyStage) {
      alertReason = `Rango Temprano detectado: Movimiento menor al umbral operado en los primeros ${txAntiquity} días desde su inscripción fiscal.`;
    }

    // Directing source -> target based on TIPO
    // TIPO === 'ORDENADA' means Subject CUIT is sender -> Counterparty is receiver
    // TIPO === 'RECIBIDA' means Counterparty is sender -> Subject CUIT is receiver
    const isOrdenada = tx.TIPO === "ORDENADA";
    edgesList.push({
      id: `e${i + 1}`,
      source: isOrdenada ? tx.CUIT : tx.CUIT_CONTRAPARTE,
      target: isOrdenada ? tx.CUIT_CONTRAPARTE : tx.CUIT,
      amount_ars: amount,
      date: tx.FECHA,
      alert_reason: alertReason
    });
  });

  return {
    summary: {
      total_cuits_analyzed: uniqueSubjects.size,
      high_risk_cases_detected: highRiskCount,
      total_volume_processed_ars: totalVolume
    },
    nodes: nodesList,
    edges: edgesList
  };
}

// Persiste un análisis (summary + transacciones + nodos + edges) en Supabase.
// No bloquea ni rompe la respuesta al cliente si falla: solo loguea el error.
async function persistAnalysis(params: {
  transactions: any[];
  threshold: number;
  antiquityLimit: number;
  usedAi: boolean;
  result: { summary: any; nodes: any[]; edges: any[] };
}) {
  if (!isSupabaseConfigured || !supabaseAdmin) return;

  try {
    const { transactions, threshold, antiquityLimit, usedAi, result } = params;

    const { data: analysisRow, error: analysisError } = await supabaseAdmin
      .from("analyses")
      .insert({
        threshold,
        antiquity_days_limit: antiquityLimit,
        used_ai: usedAi,
        total_cuits_analyzed: result.summary?.total_cuits_analyzed ?? 0,
        high_risk_cases_detected: result.summary?.high_risk_cases_detected ?? 0,
        total_volume_processed_ars: result.summary?.total_volume_processed_ars ?? 0
      })
      .select("id")
      .single();

    if (analysisError || !analysisRow) {
      console.error("[supabase] No se pudo crear el registro de análisis:", analysisError);
      return;
    }

    const analysisId = analysisRow.id;

    const parseFecha = (f: string) => {
      if (!f) return null;
      const [d, m, y] = f.split("/").map(Number);
      if (!d || !m || !y) return null;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    if (transactions.length > 0) {
      const txRows = transactions.map(t => ({
        analysis_id: analysisId,
        operacion: t.OPERACION || "TRANSFERENCIA",
        tipo: t.TIPO,
        fecha: parseFecha(t.FECHA),
        monto: parseMonto(t.MONTO),
        cuit: t.CUIT,
        cuit_contraparte: t.CUIT_CONTRAPARTE,
        fecha_alta_cuit: parseFecha(t.FECHA_ALTA_CUIT),
        denominacion_sujeto: t.DENOMINACION_SUJETO || null,
        denominacion_contraparte: t.DENOMINACION_CONTRAPARTE || null
      }));
      const { error: txError } = await supabaseAdmin.from("transactions").insert(txRows);
      if (txError) console.error("[supabase] Error guardando transacciones:", txError);
    }

    if (result.nodes?.length > 0) {
      const nodeRows = result.nodes.map(n => ({
        analysis_id: analysisId,
        node_ref: n.id,
        label: n.label,
        type: n.type,
        risk_level: n.risk_level,
        antiquity_days: n.antiquity_days ?? null,
        suspicion_cause: n.suspicion_cause ?? null
      }));
      const { error: nodesError } = await supabaseAdmin.from("aml_nodes").insert(nodeRows);
      if (nodesError) console.error("[supabase] Error guardando nodos:", nodesError);
    }

    if (result.edges?.length > 0) {
      const edgeRows = result.edges.map(e => ({
        analysis_id: analysisId,
        source_ref: e.source,
        target_ref: e.target,
        amount_ars: e.amount_ars,
        date: parseFecha(e.date),
        alert_reason: e.alert_reason ?? null
      }));
      const { error: edgesError } = await supabaseAdmin.from("aml_edges").insert(edgeRows);
      if (edgesError) console.error("[supabase] Error guardando edges:", edgesError);
    }
  } catch (err) {
    console.error("[supabase] Error inesperado persistiendo análisis:", err);
  }
}

// Endpoint de salud para verificar conexión real con Supabase desde el frontend
app.get("/api/supabase/status", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.json({ online: false, configured: false });
  }
  const start = Date.now();
  const { error } = await supabaseAdmin.from("analyses").select("id").limit(1);
  const latencyMs = Date.now() - start;
  return res.json({ online: !error, configured: true, latencyMs });
});

// Persiste el padrón ARCA (CUIT, fecha de alta, umbral) apenas se carga en el front,
// sin esperar a que se corra un análisis. Usa upsert por CUIT: si el sujeto ya existía,
// actualiza su umbral/fecha de alta en vez de duplicarlo.
app.post("/api/arca-records", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
  }
  try {
    const { records } = req.body as { records: { cuit: string; fechaAlta: string; umbral: number }[] };
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "Se requiere un array 'records' no vacío." });
    }

    const parseFecha = (f: string) => {
      if (!f) return null;
      const [d, m, y] = f.split("/").map(Number);
      if (!d || !m || !y) return null;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    // Limpiar el padrón existente y reemplazarlo por el lote nuevo, ya que la carga
    // de ARCA en la app representa el padrón completo vigente, no un agregado incremental.
    const { error: deleteError } = await supabaseAdmin.from("arca_records").delete().neq("cuit", "");
    if (deleteError) {
      console.error("[supabase] Error limpiando arca_records previo:", deleteError);
    }

    const rows = records.map(r => ({
      cuit: r.cuit,
      umbral: r.umbral ?? 0,
      denominacion: null,
      fecha_alta: parseFecha(r.fechaAlta)
    }));

    const { data, error } = await supabaseAdmin.from("arca_records").insert(rows).select("id");
    if (error) {
      console.error("[supabase] Error insertando arca_records:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ inserted: data?.length ?? 0 });
  } catch (err: any) {
    console.error("[supabase] Error inesperado en /api/arca-records:", err);
    return res.status(500).json({ error: err.message || "Error guardando el padrón ARCA." });
  }
});

// Persiste el lote de transacciones apenas se carga en el front, sin asociarlas
// todavía a ningún análisis (analysis_id queda null hasta que se corra /api/analyze).
app.post("/api/transactions", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
  }
  try {
    const { transactions } = req.body as { transactions: any[] };
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "Se requiere un array 'transactions' no vacío." });
    }

    const parseFecha = (f: string) => {
      if (!f) return null;
      const [d, m, y] = f.split("/").map(Number);
      if (!d || !m || !y) return null;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    // Reemplazar el lote anterior de transacciones "sueltas" (sin análisis asociado)
    // por el lote nuevo cargado, igual criterio que con el padrón ARCA.
    const { error: deleteError } = await supabaseAdmin.from("transactions").delete().is("analysis_id", null);
    if (deleteError) {
      console.error("[supabase] Error limpiando transactions previas sin análisis:", deleteError);
    }

    const rows = transactions.map(t => ({
      analysis_id: null,
      operacion: t.OPERACION || "TRANSFERENCIA",
      tipo: t.TIPO,
      fecha: parseFecha(t.FECHA),
      monto: parseMonto(t.MONTO),
      cuit: t.CUIT,
      cuit_contraparte: t.CUIT_CONTRAPARTE,
      fecha_alta_cuit: parseFecha(t.FECHA_ALTA_CUIT),
      denominacion_sujeto: t.DENOMINACION_SUJETO || null,
      denominacion_contraparte: t.DENOMINACION_CONTRAPARTE || null
    }));

    // Insertar en lotes para evitar límites de payload con archivos grandes (1000+ filas)
    const batchSize = 500;
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { data, error } = await supabaseAdmin.from("transactions").insert(batch).select("id");
      if (error) {
        console.error("[supabase] Error insertando lote de transactions:", error);
        return res.status(500).json({ error: error.message, insertedSoFar: totalInserted });
      }
      totalInserted += data?.length ?? 0;
    }

    return res.json({ inserted: totalInserted });
  } catch (err: any) {
    console.error("[supabase] Error inesperado en /api/transactions:", err);
    return res.status(500).json({ error: err.message || "Error guardando las transacciones." });
  }
});

// Lee el padrón ARCA guardado en Supabase para rehidratar el estado de la app al inicio.
app.get("/api/arca-records", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.json({ records: [] });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("arca_records")
      .select("cuit, umbral, fecha_alta")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[supabase] Error leyendo arca_records:", error);
      return res.status(500).json({ error: error.message });
    }

    const formatFecha = (iso: string | null) => {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };

    const records = (data || []).map((r: any) => ({
      cuit: r.cuit,
      fechaAlta: formatFecha(r.fecha_alta),
      umbral: Number(r.umbral)
    }));

    return res.json({ records });
  } catch (err: any) {
    console.error("[supabase] Error inesperado en GET /api/arca-records:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Lee las transacciones guardadas en Supabase para rehidratar el estado de la app al inicio.
// Solo devuelve las transacciones "sueltas" (sin analysis_id), que son las cargadas
// directamente por el usuario, no las generadas por análisis anteriores.
app.get("/api/transactions", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.json({ transactions: [] });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("operacion, tipo, fecha, monto, cuit, cuit_contraparte, fecha_alta_cuit, denominacion_sujeto, denominacion_contraparte")
      .is("analysis_id", null)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[supabase] Error leyendo transactions:", error);
      return res.status(500).json({ error: error.message });
    }

    const formatFecha = (iso: string | null) => {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };

    const transactions = (data || []).map((t: any) => ({
      OPERACION: t.operacion || "TRANSFERENCIA",
      TIPO: t.tipo,
      FECHA: formatFecha(t.fecha),
      MONTO: String(t.monto),
      CUIT: t.cuit,
      CUIT_CONTRAPARTE: t.cuit_contraparte,
      FECHA_ALTA_CUIT: formatFecha(t.fecha_alta_cuit),
      DENOMINACION_SUJETO: t.denominacion_sujeto || "",
      DENOMINACION_CONTRAPARTE: t.denominacion_contraparte || ""
    }));

    return res.json({ transactions });
  } catch (err: any) {
    console.error("[supabase] Error inesperado en GET /api/transactions:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Limpia todas las tablas de datos del proyecto (ARCA, transacciones, análisis, nodos, edges).
// Útil para depuración y para empezar de cero con un nuevo lote de datos.
app.delete("/api/clear-data", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
  }
  try {
    // Orden: primero tablas dependientes (edges, nodes, transactions) antes que la raíz (analyses)
    await supabaseAdmin.from("aml_edges").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("aml_nodes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("analyses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("arca_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    return res.json({ cleared: true });
  } catch (err: any) {
    console.error("[supabase] Error inesperado en DELETE /api/clear-data:", err);
    return res.status(500).json({ error: err.message || "Error limpiando las tablas." });
  }
});

// Endpoint implementation
app.post("/api/analyze", async (req, res) => {
  try {
    const { transactions, threshold, antiquityLimit, useAi, arcaRecords } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "Debe ingresar un lote de transacciones válido." });
    }

    const numericThreshold = parseFloat(threshold) || 5000000;
    const numericAntiquityLimit = parseInt(antiquityLimit, 10) || 90;

    // Check if the user opted for AI analysis and if the key exists
    const hasApiKey = !!process.env.OPENROUTER_API_KEY;

    if (useAi && hasApiKey) {
      try {
        // ── OpenRouter API (drop-in para cualquier modelo LLM) ──────────────
        // Para cambiar de modelo, solo modificar OPENROUTER_MODEL en las variables
        // de entorno de Vercel. Modelos gratuitos disponibles en openrouter.ai/models
        // Ejemplos:
        //   "meta-llama/llama-3.1-8b-instruct:free"   ← gratuito
        //   "google/gemma-2-9b-it:free"                ← gratuito
        //   "openai/gpt-4o-mini"                       ← pago, alta calidad
        //   "anthropic/claude-3-haiku"                 ← pago, alta calidad
        const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";

        const prompt = `Eres un experto en prevención de lavado de dinero (AML). Analiza los siguientes casos positivos ya detectados por el motor local y enriquece cada uno con:
1. Una narrativa forense en lenguaje natural (2-3 oraciones) describiendo el patrón de riesgo
2. La tipología AML más probable: "Empresa Cáscara", "Pitufeo", "Estructuración", "Triangulación", "Uso Único", u "Otra"
3. Señales adicionales que el motor de reglas no detecta (patrones entre CUITs, contrapartes compartidas, concentración temporal)

Casos positivos detectados:
${JSON.stringify(positiveCasesPayload, null, 2)}

Responde SOLO con un JSON válido sin markdown, con este esquema:
{
  "enriched": [
    {
      "cuit": "string",
      "narrativa": "string",
      "tipologia": "string",
      "senales_adicionales": ["string"]
    }
  ]
}`;

        const positiveNodes = (arcaRecords || []);
        const positiveCasesPayload = transactions
          .reduce((acc: any[], tx: any) => {
            if (!acc.find((a: any) => a.cuit === tx.CUIT)) {
              acc.push({ cuit: tx.CUIT, denominacion: tx.DENOMINACION_SUJETO, fecha_alta: tx.FECHA_ALTA_CUIT });
            }
            return acc;
          }, []);

        const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://altas-transacciones.vercel.app",
            "X-Title": "ALTAS-TRANSACCIONES AML"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            response_format: { type: "json_object" }
          })
        });

        if (!openRouterRes.ok) {
          throw new Error(`OpenRouter error: ${openRouterRes.status} ${await openRouterRes.text()}`);
        }

        const openRouterData = await openRouterRes.json();
        const rawText = openRouterData.choices?.[0]?.message?.content || "";

        let cleanedText = rawText.trim();
        if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        const enrichedData = JSON.parse(cleanedText);

        // Correr igualmente el motor local para tener el resultado base completo
        const localResult = performLocalAnalysis(transactions, numericThreshold, numericAntiquityLimit, arcaRecords);

        persistAnalysis({
          transactions,
          threshold: numericThreshold,
          antiquityLimit: numericAntiquityLimit,
          usedAi: true,
          result: localResult
        });

        return res.json({
          analysis: localResult,
          enriched: enrichedData.enriched || [],
          engine: `OpenRouter / ${model}`
        });

      } catch (aiError: any) {
        console.error("AI enrichment failed, returning local result:", aiError);
        const localResult = performLocalAnalysis(transactions, numericThreshold, numericAntiquityLimit, arcaRecords);

        persistAnalysis({
          transactions,
          threshold: numericThreshold,
          antiquityLimit: numericAntiquityLimit,
          usedAi: false,
          result: localResult
        });

        return res.json({
          analysis: localResult,
          enriched: [],
          engine: "Deterministic Local Forensic Engine (Fallback — " + aiError.message + ")"
        });
      }
    } else {
      // Local analysis triggered intentionally or due to missing key
      const localResult = performLocalAnalysis(transactions, numericThreshold, numericAntiquityLimit, arcaRecords);

      persistAnalysis({
        transactions,
        threshold: numericThreshold,
        antiquityLimit: numericAntiquityLimit,
        usedAi: false,
        result: localResult
      });

      return res.json({
        analysis: localResult,
        engine: hasApiKey ? "Deterministic Local Forensic Engine" : "Deterministic Local Forensic Engine (Sin API Key configurada)"
      });
    }

  } catch (error: any) {
    console.error("Critical server error in /api/analyze:", error);
    return res.status(500).json({ error: error.message || "Error procesando el lote de transacciones." });
  }
});

// Export default: la app de Express es directamente invocable como (req, res),
// lo cual es compatible con el formato de handler que Vercel espera para
// funciones serverless de Node. Esto permite reusar exactamente la misma
// app tanto en local (server.ts -> app.listen) como en Vercel (api/index.js).
export default app;

