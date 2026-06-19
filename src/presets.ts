import { PresetCase } from "./types";

export const PRESET_CASES: PresetCase[] = [
  {
    id: "caso-grupal-compartido",
    name: "Caso A: Red de Circulación de Fondos (Flujo Grupal - Contraparte Común)",
    description: "Detección de dos sujetos analizados recientemente inscritos (Establecimiento Don Pedro S.A. e Inversiones del Oeste S.A.) que comparten una misma contraparte de red en común (Fideicomiso de Préstamos S.A.) operando como puente de compensación de flujo cruzado.",
    suggestedThreshold: 35000000,
    suggestedDays: 90,
    transactions: [
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "04/06/2026",
        MONTO: "48000000.00",
        CUIT: "30-70444555-9",
        CUIT_CONTRAPARTE: "30-60001112-9",
        FECHA_ALTA_CUIT: "10/05/2026",
        DENOMINACION_SUJETO: "Establecimiento Don Pedro S.A.",
        DENOMINACION_CONTRAPARTE: "Fideicomiso de Préstamos S.A."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "RECIBIDA",
        FECHA: "05/06/2026",
        MONTO: "48000000.00",
        CUIT: "30-70888999-9",
        CUIT_CONTRAPARTE: "30-60001112-9",
        FECHA_ALTA_CUIT: "18/05/2026",
        DENOMINACION_SUJETO: "Inversiones del Oeste S.A.",
        DENOMINACION_CONTRAPARTE: "Fideicomiso de Préstamos S.A."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "RECIBIDA",
        FECHA: "02/06/2026",
        MONTO: "150000.00",
        CUIT: "30-70444555-9",
        CUIT_CONTRAPARTE: "30-65829103-2",
        FECHA_ALTA_CUIT: "10/05/2026",
        DENOMINACION_SUJETO: "Establecimiento Don Pedro S.A.",
        DENOMINACION_CONTRAPARTE: "Distribuidora El Sol S.R.L."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "06/06/2026",
        MONTO: "1200000.00",
        CUIT: "30-70888999-9",
        CUIT_CONTRAPARTE: "30-80124893-1",
        FECHA_ALTA_CUIT: "18/05/2026",
        DENOMINACION_SUJETO: "Inversiones del Oeste S.A.",
        DENOMINACION_CONTRAPARTE: "Estudio Contable Bianchi & Asoc."
      }
    ]
  },
  {
    id: "caso-grupal-directo",
    name: "Caso B: Préstamos Cruzados y Cuentas Espejo (Flujo Grupal - Transacción Directa)",
    description: "Auditoría de dos sujetos bajo análisis (Comercializadora del Litoral S.A. y Constructora del Plata S.A.) que registran una transferencia directa de alto volumen entre ellos ($ 42 millones) y que además comparten un mismo Estudio Impositivo Integral como contraparte común.",
    suggestedThreshold: 30000000,
    suggestedDays: 90,
    transactions: [
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "03/06/2026",
        MONTO: "42000000.00",
        CUIT: "30-71122334-9",
        CUIT_CONTRAPARTE: "30-72233445-9",
        FECHA_ALTA_CUIT: "01/05/2026",
        DENOMINACION_SUJETO: "Comercializadora del Litoral S.A.",
        DENOMINACION_CONTRAPARTE: "Constructora del Plata S.A."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "04/06/2026",
        MONTO: "8500000.00",
        CUIT: "30-71122334-9",
        CUIT_CONTRAPARTE: "30-50111222-3",
        FECHA_ALTA_CUIT: "01/05/2026",
        DENOMINACION_SUJETO: "Comercializadora del Litoral S.A.",
        DENOMINACION_CONTRAPARTE: "Estudio Impositivo Integral"
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "05/06/2026",
        MONTO: "6200000.00",
        CUIT: "30-72233445-9",
        CUIT_CONTRAPARTE: "30-50111222-3",
        FECHA_ALTA_CUIT: "05/05/2026",
        DENOMINACION_SUJETO: "Constructora del Plata S.A.",
        DENOMINACION_CONTRAPARTE: "Estudio Impositivo Integral"
      }
    ]
  },
  {
    id: "caso-grupal-triangulacion",
    name: "Caso C: Triangulación y Retorno (Flujo Grupal - Tres Sujetos Interconectados)",
    description: "Esquema coordinado de triangulación compleja entre tres nuevos CUITs impositivos (Agro-Logística del Paraná S.A., Servicios Generales del Delta S.A. y Sinergia Corporativa S.A.) que registran transferencias bilaterales directas recíprocas de alto volumen y derivan comisiones consolidadas a un mismo Estudio Fiduciario Central.",
    suggestedThreshold: 20000000,
    suggestedDays: 90,
    transactions: [
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "04/06/2026",
        MONTO: "35000000.00",
        CUIT: "30-73344556-9",
        CUIT_CONTRAPARTE: "30-74455667-9",
        FECHA_ALTA_CUIT: "12/05/2026",
        DENOMINACION_SUJETO: "Agro-Logística del Paraná S.A.",
        DENOMINACION_CONTRAPARTE: "Servicios Generales del Delta S.A."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "05/06/2026",
        MONTO: "32000000.00",
        CUIT: "30-74455667-9",
        CUIT_CONTRAPARTE: "30-75566778-9",
        FECHA_ALTA_CUIT: "22/05/2026",
        DENOMINACION_SUJETO: "Servicios Generales del Delta S.A.",
        DENOMINACION_CONTRAPARTE: "Sinergia Corporativa S.A."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "06/06/2026",
        MONTO: "31000000.00",
        CUIT: "30-75566778-9",
        CUIT_CONTRAPARTE: "30-73344556-9",
        FECHA_ALTA_CUIT: "26/05/2026",
        DENOMINACION_SUJETO: "Sinergia Corporativa S.A.",
        DENOMINACION_CONTRAPARTE: "Agro-Logística del Paraná S.A."
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "07/06/2026",
        MONTO: "12000000.00",
        CUIT: "30-73344556-9",
        CUIT_CONTRAPARTE: "30-58888999-3",
        FECHA_ALTA_CUIT: "12/05/2026",
        DENOMINACION_SUJETO: "Agro-Logística del Paraná S.A.",
        DENOMINACION_CONTRAPARTE: "Estudio Fiduciario del Litoral"
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "07/06/2026",
        MONTO: "15000000.00",
        CUIT: "30-74455667-9",
        CUIT_CONTRAPARTE: "30-58888999-3",
        FECHA_ALTA_CUIT: "22/05/2026",
        DENOMINACION_SUJETO: "Servicios Generales del Delta S.A.",
        DENOMINACION_CONTRAPARTE: "Estudio Fiduciario del Litoral"
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "08/06/2026",
        MONTO: "14000000.00",
        CUIT: "30-75566778-9",
        CUIT_CONTRAPARTE: "30-58888999-3",
        FECHA_ALTA_CUIT: "26/05/2026",
        DENOMINACION_SUJETO: "Sinergia Corporativa S.A.",
        DENOMINACION_CONTRAPARTE: "Estudio Fiduciario del Litoral"
      }
    ]
  },
  {
    id: "caso-moderado",
    name: "Caso D: Fideicomiso Nuevo Inmobiliario (Riesgo Medio - Un Solo Sujeto)",
    description: "Inscripción fiscal de 45 días (dentro del límite de riesgo temprano). Registra un pico que supera el umbral, sin embargo, los fondos permanecen parcialmente integrados en la cuenta y no se liquidan de inmediato en un patrón circular.",
    suggestedThreshold: 6000000,
    suggestedDays: 90,
    transactions: [
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "RECIBIDA",
        FECHA: "05/06/2026",
        MONTO: "18000000.00",
        CUIT: "30-71954820-2",
        CUIT_CONTRAPARTE: "30-55910394-5",
        FECHA_ALTA_CUIT: "15/04/2026",
        DENOMINACION_SUJETO: "Desarrollos Inmobiliarios Puerto Madero",
        DENOMINACION_CONTRAPARTE: "Inversores del Plata"
      },
      {
        OPERACION: "TRANSFERENCIA",
        TIPO: "ORDENADA",
        FECHA: "08/06/2026",
        MONTO: "4000000.00",
        CUIT: "30-71954820-2",
        CUIT_CONTRAPARTE: "30-88482019-2",
        FECHA_ALTA_CUIT: "15/04/2026",
        DENOMINACION_SUJETO: "Desarrollos Inmobiliarios Puerto Madero",
        DENOMINACION_CONTRAPARTE: "Fideicomiso La Horqueta"
      }
    ]
  }
];
