import { createClient } from "@supabase/supabase-js";

export function privateStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase private storage is not configured");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function evidenceBucket() {
  return process.env.SUPABASE_EVIDENCE_BUCKET || "covra-evidence-private";
}
