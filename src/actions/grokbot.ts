"use server";

import { randomUUID } from "node:crypto";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueGrokbotOperation, dispatchGrokbot } from "@/lib/grokbot/delivery";
import { simulationPayload } from "@/lib/grokbot/simulation";
import { withinLimit } from "@/lib/rate-limit";

export async function getGrokbotSimulation() {
  if (!(await getAdminUser())) return null;
  const result = await createAdminClient()
    .from("grokbot_operations")
    .select("id,status,report,error,updated_at,expires_at")
    .eq("kind", "integration_test")
    .contains("payload", { source: "webapp-simulation" })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error)
    throw new Error("Could not read the Grokbot simulation status.");
  if (!result.data) return null;
  const report = (result.data.report ?? {}) as Record<string, unknown>;
  return {
    id: result.data.id,
    status: result.data.status,
    error: result.data.error,
    updatedAt: result.data.updated_at,
    expired: Date.parse(result.data.expires_at) < Date.now(),
    verified: report.verified === true,
    restored: report.restored === true,
    checks: Object.entries(
      (report.checks ?? {}) as Record<string, unknown>,
    ).map(([name, value]) => ({ name, passed: value === true })),
  };
}

export async function startGrokbotSimulation() {
  const user = await getAdminUser();
  if (!user)
    return { ok: false as const, error: "Administrator access required." };
  if (!(await withinLimit(`grokbot-simulation:${user.id}`, 3, 60)))
    return {
      ok: false as const,
      error: "Wait a minute before starting another test.",
    };
  const db = createAdminClient();
  const active = await db
    .from("grokbot_operations")
    .select("id")
    .in("status", ["queued", "running"])
    .limit(1);
  if (active.error)
    return {
      ok: false as const,
      error: "Could not check pending Grokbot operations.",
    };
  if (active.data.length)
    return {
      ok: false as const,
      error: "Complete the current Grokbot job before starting a simulation.",
    };
  try {
    const id = randomUUID();
    await queueGrokbotOperation({
      id,
      kind: "integration_test",
      payload: simulationPayload(id),
    });
    await dispatchGrokbot();
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error:
        "Could not start the simulation. Refresh its status before retrying.",
    };
  }
}
