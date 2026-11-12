import { createHash } from "node:crypto";
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

// True when this exact action was just sent by the same person, for example a
// double-click, or the same form sent twice from a slow connection. Two
// different window lengths are checked so a repeat that lands on the edge of
// one window is still caught by the other. The first send always passes.
export async function isRepeat(
  userId: string,
  action: string,
  payload: unknown,
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(payload) ?? "")
    .digest("hex")
    .slice(0, 32);
  const key = `once:${action}:${userId}:${fingerprint}`;
  const first = await withinLimit(`${key}:a`, 1, 15);
  const second = await withinLimit(`${key}:b`, 1, 23);
  return !first || !second;
}

export const REPEAT_MESSAGE =
  "That was already sent a moment ago. Check the list before trying again.";
