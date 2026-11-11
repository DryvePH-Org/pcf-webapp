import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SheetsDatabase } from "./types";
export function sheetsAdmin() {
  return createAdminClient() as unknown as SupabaseClient<SheetsDatabase>;
}
