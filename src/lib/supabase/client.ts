import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, key };
}

export function createClient() {
  const { url, key } = getConfig();
  return createBrowserClient<Database>(url, key);
}
