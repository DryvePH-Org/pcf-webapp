import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

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

// One client per request. Every new client checks the signed-in user with the auth server before its first query
// (a network round trip), and a page asks for a client in dozens of places, so a page used to wait on that check
// many times over. Within one request they all share this one.
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const { url, key } = getConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies; the proxy refreshes them.
        }
      },
    },
  });
});
