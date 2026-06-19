import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for parsing JSON requests with clean boundaries
app.use(express.json());

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
    const amount = parseFloat(tx.MONTO) || 0;
    totalVolume += amount;

    if (tx.CUIT) {
      if (!uniqueSubjects.has(tx.CUIT)) {
        uniqueSubjects.set(tx.CUIT, {
          earliestTxDate: tx.FECHA,
          altaDate: tx.FECHA_ALTA_CUIT || tx.FECHA
        });
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
    const maxSingleMonto = Math.max(...cuitTxs.map(t => parseFloat(t.MONTO) || 0), 0);
    const totalCuitVolume = cuitTxs.reduce((sum, t) => sum + (parseFloat(t.MONTO) || 0), 0);

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
    const amount = parseFloat(tx.MONTO) || 0;
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
    const hasApiKey = !!process.env.GEMINI_API_KEY;

    if (useAi && hasApiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const promptContent = `
Analiza forensemente las siguientes transacciones financieras en pesos argentinos (ARS) aplicando las reglas de prevención de lavado de dinero de inicio rápido (Early-Stage Risk).

## Parámetros del Filtro:
- UMBRAL DE CORTE GENERAL: ${numericThreshold} ARS
- LÍMITE DE RANG TEMPRANO (ANTIGÜEDAD): ${numericAntiquityLimit} días
- PADRÓN DE ALTA ARCA (CON HISTORIAL DE UMBRAL ESPECÍFICO): ${JSON.stringify(arcaRecords || [])}

## Lote de Transacciones:
${JSON.stringify(transactions, null, 2)}

## Instrucciones de Análisis (AML):
1. Calcula la diferencia en días entre la 'FECHA' de la transacción y la 'FECHA_ALTA_CUIT' del CUIT para evaluar la antigüedad.
2. Solo se analizan (y se declaran como tipo "ANALIZADO") aquellos CUITs de sujetos que existan en el Padrón de Alta ARCA con un "umbral" asignado que sea mayor a 0. Si un sujeto no está en el Padrón o su umbral es 0, NO lo analices, no lo incluyas como nodo "ANALIZADO" y descarta sus flujos directos de análisis.
3. Si la cuenta de un CUIT analizado es nueva (menos de ${numericAntiquityLimit} días de antigüedad fiscal) Y su volumen transaccionado acumulado supera su umbral específico, clasifícalo como de riesgo ALTO ('Empresa Cáscara de Uso Único'). Explica esto técnicamente en 'suspicion_cause'.
4. Si la antigüedad fiscal es holgada o los montos no desvían, califícalo de forma correspondiente.
5. El sentido de la red transaccional se basa en el campo 'TIPO'. Si es ORDENADA, los fondos fluyen del CUIT analizado hacia la contracartes. Si es RECIBIDA, fluyen de la contraparte hacia el CUIT analizado.

Genera una respuesta JSON estrictamente alineada con este esquema exacto, sin marcadores de código adicionales ni textos introductorios:
{
  "summary": {
    "total_cuits_analyzed": <Número entero de CUITs analizados como sujeto>,
    "high_risk_cases_detected": <Número entero de casos de alto riesgo temprano identificados>,
    "total_volume_processed_ars": <Monto de todos los movimientos juntos en ARS>
  },
  "nodes": [
    {
      "id": "CUIT del sujeto o contraparte",
      "label": "CUIT o máscara anónima (Sujeto o Contraparte)",
      "type": "ANALIZADO" o "CONTRAPARTE",
      "risk_level": "BAJO" o "MEDIO" o "ALTO",
      "antiquity_days": <antigüedad en días calculada u 0 si es contraparte pura>,
      "suspicion_cause": "Detalle técnico descriptivo criminalístico del nivel de riesgo, fundamentando los cálculos fiscales y de umbral"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "CUIT del origen de los fondos",
      "target": "CUIT del destino de los fondos",
      "amount_ars": <monto de la transacción>,
      "date": "dd/mm/yyyy",
      "alert_reason": "Razón clave de la alerta"
    }
  ]
}
`;

        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: promptContent,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const rawText = aiResponse.text || "";
        
        // Clean markdown backticks if returned
        let cleanedText = rawText.trim();
        if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        const parsedJson = JSON.parse(cleanedText);
        
        // Return analytical workspace result
        return res.json({
          analysis: parsedJson,
          engine: "Gemini-3.5-Flash AML Investigator"
        });

      } catch (aiError: any) {
        console.error("AI Analysis failed, falling back to local engine:", aiError);
        // Fallback to local engine immediately on API failure
        const localResult = performLocalAnalysis(transactions, numericThreshold, numericAntiquityLimit, arcaRecords);
        return res.json({
          analysis: localResult,
          engine: "Deterministic Local Forensic Engine (Vía Fallback de IA - " + aiError.message + ")"
        });
      }
    } else {
      // Local analysis triggered intentionally or due to missing key
      const localResult = performLocalAnalysis(transactions, numericThreshold, numericAntiquityLimit, arcaRecords);
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

// Vite middleware configuration or Static build fallback
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AML SERVER] Running on port http://localhost:${PORT}`);
  });
}

setupServer();
