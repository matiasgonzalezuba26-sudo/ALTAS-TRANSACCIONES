// Función serverless de Vercel. Reutiliza la misma app de Express
// (rutas /api/analyze y /api/supabase/status) definida en src/server/app.ts,
// sin duplicar lógica entre el entorno local y el de Vercel.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../src/server/app";

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Express puede manejar directamente los objetos req/res de Vercel,
  // ya que ambos son compatibles con la interfaz de Node http.
  return (app as any)(req, res);
}
