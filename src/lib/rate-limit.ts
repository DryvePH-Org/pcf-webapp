import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

// The deployment proxy must overwrite forwarded IP headers and block direct
// access to the Node server. Configure this when preparing the shared VPS.
export async function clientIp() {
  const list = await headers();
  return (
    list.get("cf-connecting-ip") ??
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// True while `key` is within `limit` hits per `windowSeconds`. If the limiter
// itself is unavailable we let the request through rather than lock everyone
// out, and log it.
export async function withinLimit(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limiter unavailable", error.message);
    return true;
  }
  return data === true;
}
