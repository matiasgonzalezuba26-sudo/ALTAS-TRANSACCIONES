import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// El cliente solo se crea si ambas variables están presentes.
// Si faltan, la app sigue funcionando (sin persistencia) y loguea un aviso.
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })
  : null;

export const isSupabaseConfigured = !!supabaseAdmin;

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas. " +
    "Los análisis no se persistirán en base de datos."
  );
}
