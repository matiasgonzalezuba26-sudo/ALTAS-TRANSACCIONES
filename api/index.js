var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/app.ts
var app_exports = {};
__export(app_exports, {
  app: () => app,
  default: () => app_default
});
module.exports = __toCommonJS(app_exports);
var import_express = __toESM(require("express"));
var import_dotenv = __toESM(require("dotenv"));

// src/lib/supabaseAdmin.ts
var import_supabase_js = require("@supabase/supabase-js");
var supabaseUrl = process.env.SUPABASE_URL;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
var supabaseAdmin = supabaseUrl && supabaseServiceKey ? (0, import_supabase_js.createClient)(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
}) : null;
var isSupabaseConfigured = !!supabaseAdmin;
if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas. Los an\xE1lisis no se persistir\xE1n en base de datos."
  );
}

// src/server/app.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "10mb" }));
function parseMonto(value) {
  if (value === null || value === void 0 || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const str = String(value).trim();
  const cleaned = str.replace(/\$/g, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:[,]|$))/g, "").replace(/,/g, ".");
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}
function getDaysDifference(date1Str, date2Str) {
  if (!date1Str || !date2Str) return null;
  const isValidDate = (s) => /^\d{2}\/\d{2}\/\d{4}$/.test(s);
  if (!isValidDate(date1Str) || !isValidDate(date2Str)) return null;
  try {
    const [d1, m1, y1] = date1Str.split("/").map(Number);
    const [d2, m2, y2] = date2Str.split("/").map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return null;
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(diffTime / (1e3 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
function performLocalAnalysis(transactions, thresholdPrice, antiquityDaysLimit = 90, arcaRecords = []) {
  const uniqueSubjects = /* @__PURE__ */ new Map();
  const counterparties = /* @__PURE__ */ new Set();
  let totalVolume = 0;
  transactions.forEach((tx) => {
    const amount = parseMonto(tx.MONTO);
    totalVolume += amount;
    if (tx.CUIT) {
      if (!uniqueSubjects.has(tx.CUIT)) {
        uniqueSubjects.set(tx.CUIT, {
          earliestTxDate: tx.FECHA,
          // Si no hay fecha de alta ARCA, usar la fecha de la primera tx como proxy
          altaDate: tx.FECHA_ALTA_CUIT || tx.FECHA || ""
        });
      } else {
        const existing = uniqueSubjects.get(tx.CUIT);
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
  const nodesList = [];
  const edgesList = [];
  let highRiskCount = 0;
  uniqueSubjects.forEach((info, cuit) => {
    const antiquity = getDaysDifference(info.altaDate, info.earliestTxDate);
    const isNewcomer = antiquity !== null && antiquity < antiquityDaysLimit;
    const cuitTxs = transactions.filter((t) => t.CUIT === cuit);
    const maxSingleMonto = Math.max(...cuitTxs.map((t) => parseMonto(t.MONTO)), 0);
    const totalCuitVolume = cuitTxs.reduce((sum, t) => sum + parseMonto(t.MONTO), 0);
    const cleanCuitStr = String(cuit).replace(/\D/g, "");
    const matchingArca = arcaRecords ? arcaRecords.find((r) => String(r.cuit).replace(/\D/g, "") === cleanCuitStr) : null;
    if (!matchingArca || !matchingArca.umbral || matchingArca.umbral <= 0) {
      return;
    }
    const activeThreshold = matchingArca.umbral;
    const exceedsUmbral = totalCuitVolume > activeThreshold;
    let riskLevel = "BAJO";
    let suspicionCause = "";
    if (isNewcomer && exceedsUmbral) {
      riskLevel = "ALTO";
      highRiskCount++;
      suspicionCause = `CR\xCDTICO: Cuenta dada de alta hace solo ${antiquity} d\xEDas. Registra un volumen acumulado de $ ${Math.round(totalCuitVolume / 1e3).toLocaleString("es-AR")} mil en el per\xEDodo, superando el umbral de corte acumulado de $ ${Math.round(activeThreshold / 1e3).toLocaleString("es-AR")} mil (fijado p/ per\xEDodo). Alerta compatible con tipolog\xEDa de 'Empresa C\xE1scara de Uso \xDAnico' o instrumental.`;
    } else if (isNewcomer) {
      riskLevel = "MEDIO";
      suspicionCause = `PREVENTIVO: Contribuyente dado de alta recientemente (${antiquity} d\xEDas). Su volumen acumulado de $ ${Math.round(totalCuitVolume / 1e3).toLocaleString("es-AR")} mil no supera el umbral l\xEDmite de $ ${Math.round(activeThreshold / 1e3).toLocaleString("es-AR")} mil para el per\xEDodo, pero se recomienda monitoreo preventivo.`;
    } else if (exceedsUmbral) {
      riskLevel = "MEDIO";
      suspicionCause = `MONITOREO: Contribuyente con antig\xFCedad fiscal consolidada (${antiquity} d\xEDas). Supera el umbral transaccional acumulado asignado de $ ${Math.round(activeThreshold / 1e3).toLocaleString("es-AR")} mil en el per\xEDodo con un acumulado total de $ ${Math.round(totalCuitVolume / 1e3).toLocaleString("es-AR")} mil. Patr\xF3n transaccional inusual pero mitigado por madurez fiscal.`;
    } else {
      riskLevel = "BAJO";
      suspicionCause = `Establecido: Antig\xFCedad de ${antiquity} d\xEDas con volumen acumulado de $ ${Math.round(totalCuitVolume / 1e3).toLocaleString("es-AR")} mil, consistente dentro del rango est\xE1ndar parametrizado para el per\xEDodo.`;
    }
    const associatedTxWithDenom = transactions.find((t) => t.CUIT === cuit && t.DENOMINACION_SUJETO);
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
  counterparties.forEach((cuitContra) => {
    if (!uniqueSubjects.has(cuitContra)) {
      const isLinkedToHighRisk = transactions.some((t) => {
        if (t.CUIT_CONTRAPARTE === cuitContra) {
          const subjectNode = nodesList.find((n) => n.id === t.CUIT);
          return subjectNode && subjectNode.risk_level === "ALTO";
        }
        return false;
      });
      const associatedTxWithDenom = transactions.find((t) => t.CUIT_CONTRAPARTE === cuitContra && t.DENOMINACION_CONTRAPARTE);
      const counterpartLabel = associatedTxWithDenom ? associatedTxWithDenom.DENOMINACION_CONTRAPARTE : `Contraparte ${cuitContra}`;
      nodesList.push({
        id: cuitContra,
        label: counterpartLabel,
        type: "CONTRAPARTE",
        risk_level: isLinkedToHighRisk ? "MEDIO" : "BAJO",
        antiquity_days: 0,
        suspicion_cause: isLinkedToHighRisk ? `CONTRAFLUJO: Entidad receptora/emisora de fondos vinculada a un CUIT calificado con ALTO RIESGO por sospecha de uso \xFAnico o picos injustificados.` : `Canal General: Cuenta de contraparte convencional participante en el flujo de transferencias del sandbox.`
      });
    }
  });
  transactions.forEach((tx, i) => {
    const amount = parseMonto(tx.MONTO);
    const isTransgressor = amount > thresholdPrice;
    const subjectAlta = tx.FECHA_ALTA_CUIT || tx.FECHA;
    const txAntiquity = getDaysDifference(subjectAlta, tx.FECHA);
    const isEarlyStage = txAntiquity < antiquityDaysLimit;
    let alertReason = "Flujo normal dentro del umbral financiero parametrizado.";
    if (isTransgressor && isEarlyStage) {
      alertReason = `ALERTA CR\xCDTICA: Desv\xEDo extremo. Pico transaccional de ${amount.toLocaleString("es-AR")} ARS en cuenta de solo ${txAntiquity} d\xEDas de alta.`;
    } else if (isTransgressor) {
      alertReason = `DESV\xCDO DE UMBRAL: Transferencia individual excede el umbral m\xE1ximo asignado (${thresholdPrice.toLocaleString("es-AR")} ARS) en una cuenta fiscal madura.`;
    } else if (isEarlyStage) {
      alertReason = `Rango Temprano detectado: Movimiento menor al umbral operado en los primeros ${txAntiquity} d\xEDas desde su inscripci\xF3n fiscal.`;
    }
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
async function persistAnalysis(params) {
  if (!isSupabaseConfigured || !supabaseAdmin) return;
  try {
    const { transactions, threshold, antiquityLimit, usedAi, result } = params;
    const { data: analysisRow, error: analysisError } = await supabaseAdmin.from("analyses").insert({
      threshold,
      antiquity_days_limit: antiquityLimit,
      used_ai: usedAi,
      total_cuits_analyzed: result.summary?.total_cuits_analyzed ?? 0,
      high_risk_cases_detected: result.summary?.high_risk_cases_detected ?? 0,
      total_volume_processed_ars: result.summary?.total_volume_processed_ars ?? 0
    }).select("id").single();
    if (analysisError || !analysisRow) {
      console.error("[supabase] No se pudo crear el registro de an\xE1lisis:", analysisError);
      return;
    }
    const analysisId = analysisRow.id;
    const parseFecha = (f) => {
      if (!f) return null;
      const [d, m, y] = f.split("/").map(Number);
      if (!d || !m || !y) return null;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    if (transactions.length > 0) {
      const txRows = transactions.map((t) => ({
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
      const nodeRows = result.nodes.map((n) => ({
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
      const edgeRows = result.edges.map((e) => ({
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
    console.error("[supabase] Error inesperado persistiendo an\xE1lisis:", err);
  }
}
app.get("/api/supabase/status", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.json({ online: false, configured: false });
  }
  const start = Date.now();
  const { error } = await supabaseAdmin.from("analyses").select("id").limit(1);
  const latencyMs = Date.now() - start;
  return res.json({ online: !error, configured: true, latencyMs });
});
app.post("/api/arca-records", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.status(503).json({ error: "Supabase no est\xE1 configurado en el servidor." });
  }
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "Se requiere un array 'records' no vac\xEDo." });
    }
    const parseFecha = (f) => {
      if (!f) return null;
      const [d, m, y] = f.split("/").map(Number);
      if (!d || !m || !y) return null;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    const { error: deleteError } = await supabaseAdmin.from("arca_records").delete().neq("cuit", "");
    if (deleteError) {
      console.error("[supabase] Error limpiando arca_records previo:", deleteError);
    }
    const rows = records.map((r) => ({
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
  } catch (err) {
    console.error("[supabase] Error inesperado en /api/arca-records:", err);
    return res.status(500).json({ error: err.message || "Error guardando el padr\xF3n ARCA." });
  }
});
app.post("/api/transactions", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.status(503).json({ error: "Supabase no est\xE1 configurado en el servidor." });
  }
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "Se requiere un array 'transactions' no vac\xEDo." });
    }
    const parseFecha = (f) => {
      if (!f) return null;
      const [d, m, y] = f.split("/").map(Number);
      if (!d || !m || !y) return null;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    const { error: deleteError } = await supabaseAdmin.from("transactions").delete().is("analysis_id", null);
    if (deleteError) {
      console.error("[supabase] Error limpiando transactions previas sin an\xE1lisis:", deleteError);
    }
    const rows = transactions.map((t) => ({
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
  } catch (err) {
    console.error("[supabase] Error inesperado en /api/transactions:", err);
    return res.status(500).json({ error: err.message || "Error guardando las transacciones." });
  }
});
app.get("/api/arca-records", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.json({ records: [] });
  }
  try {
    const { data, error } = await supabaseAdmin.from("arca_records").select("cuit, umbral, fecha_alta").order("created_at", { ascending: true });
    if (error) {
      console.error("[supabase] Error leyendo arca_records:", error);
      return res.status(500).json({ error: error.message });
    }
    const formatFecha = (iso) => {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };
    const records = (data || []).map((r) => ({
      cuit: r.cuit,
      fechaAlta: formatFecha(r.fecha_alta),
      umbral: Number(r.umbral)
    }));
    return res.json({ records });
  } catch (err) {
    console.error("[supabase] Error inesperado en GET /api/arca-records:", err);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/transactions", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.json({ transactions: [] });
  }
  try {
    const { data, error } = await supabaseAdmin.from("transactions").select("operacion, tipo, fecha, monto, cuit, cuit_contraparte, fecha_alta_cuit, denominacion_sujeto, denominacion_contraparte").is("analysis_id", null).order("created_at", { ascending: true });
    if (error) {
      console.error("[supabase] Error leyendo transactions:", error);
      return res.status(500).json({ error: error.message });
    }
    const formatFecha = (iso) => {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };
    const transactions = (data || []).map((t) => ({
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
  } catch (err) {
    console.error("[supabase] Error inesperado en GET /api/transactions:", err);
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/clear-data", async (req, res) => {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    return res.status(503).json({ error: "Supabase no est\xE1 configurado en el servidor." });
  }
  try {
    await supabaseAdmin.from("aml_edges").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("aml_nodes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("analyses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("arca_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return res.json({ cleared: true });
  } catch (err) {
    console.error("[supabase] Error inesperado en DELETE /api/clear-data:", err);
    return res.status(500).json({ error: err.message || "Error limpiando las tablas." });
  }
});
app.post("/api/analyze", async (req, res) => {
  try {
    const { transactions, threshold, antiquityLimit, useAi, arcaRecords } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "Debe ingresar un lote de transacciones v\xE1lido." });
    }
    const numericThreshold = parseFloat(threshold) || 5e6;
    const numericAntiquityLimit = parseInt(antiquityLimit, 10) || 90;
    const hasApiKey = !!process.env.OPENROUTER_API_KEY;
    if (useAi && hasApiKey) {
      try {
        const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
        const prompt = `Eres un experto en prevenci\xF3n de lavado de dinero (AML). Analiza los siguientes casos positivos ya detectados por el motor local y enriquece cada uno con:
1. Una narrativa forense en lenguaje natural (2-3 oraciones) describiendo el patr\xF3n de riesgo
2. La tipolog\xEDa AML m\xE1s probable: "Empresa C\xE1scara", "Pitufeo", "Estructuraci\xF3n", "Triangulaci\xF3n", "Uso \xDAnico", u "Otra"
3. Se\xF1ales adicionales que el motor de reglas no detecta (patrones entre CUITs, contrapartes compartidas, concentraci\xF3n temporal)

Casos positivos detectados:
${JSON.stringify(positiveCasesPayload, null, 2)}

Responde SOLO con un JSON v\xE1lido sin markdown, con este esquema:
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
        const positiveNodes = arcaRecords || [];
        const positiveCasesPayload = transactions.reduce((acc, tx) => {
          if (!acc.find((a) => a.cuit === tx.CUIT)) {
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
      } catch (aiError) {
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
          engine: "Deterministic Local Forensic Engine (Fallback \u2014 " + aiError.message + ")"
        });
      }
    } else {
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
  } catch (error) {
    console.error("Critical server error in /api/analyze:", error);
    return res.status(500).json({ error: error.message || "Error procesando el lote de transacciones." });
  }
});
var app_default = app;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  app
});
