import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

// The proxy (deploy/hostinger/Caddyfile.fragment) always overwrites
// X-PCF-Client-IP with the visitor's real address: Cloudflare's
// CF-Connecting-IP when the connection comes from Cloudflare, otherwise the
// connecting address. Before that proxy change is live, X-Forwarded-For holds
// the connecting address (a Cloudflare edge), which is shared by many people.
const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

export function pickClientIp(list: Pick<Headers, "get">) {
  const candidates = [
    list.get("x-pcf-client-ip"),
    list.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed && IP_PATTERN.test(trimmed)) return trimmed;
  }
  return "unknown";
}

export async function clientIp() {
  return pickClientIp(await headers());
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
