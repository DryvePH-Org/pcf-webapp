import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { shortRef } from "@/lib/refs";
import { buildRequestTrail, type TrailKey, type TrailStep } from "@/lib/request-trail";

// Finds the rest of the trail from the page you are on. It reads with the signed-in person's own access, so a step
// they may not see simply shows as "not yet" with no link. A failure here never breaks the page: the trail is hidden.
export async function loadRequestTrail(
  db: SupabaseClient<Database>,
  here: { key: Exclude<TrailKey, "settlement">; id: string },
): Promise<TrailStep[] | null> {
  try {
    let requestId: string | null = null;
    let voucherId: string | null = null;
    let liquidationId: string | null = null;

    if (here.key === "request") requestId = here.id;
    if (here.key === "voucher") voucherId = here.id;
    if (here.key === "liquidation") {
      liquidationId = here.id;
      const found = await db.from("liquidations").select("voucher_id").eq("id", here.id).maybeSingle();
      voucherId = found.data?.voucher_id ?? null;
    }

    if (requestId && !voucherId) {
      // a request can have had more than one voucher: follow the live one, or the latest if all were voided
      const found = await db.from("vouchers").select("id,status,created_at").eq("budget_request_id", requestId).order("created_at", { ascending: false }).limit(10);
      const rows = found.data ?? [];
      voucherId = (rows.find((row) => row.status !== "void") ?? rows[0])?.id ?? null;
    }

    const voucher = voucherId
      ? (await db.from("vouchers").select("id,pcv_number,status,released_at,budget_request_id").eq("id", voucherId).maybeSingle()).data
      : null;
    if (!requestId && voucher?.budget_request_id) requestId = voucher.budget_request_id;

    const [request, liquidation] = await Promise.all([
      requestId ? db.from("budget_requests").select("id,request_no,status").eq("id", requestId).maybeSingle() : Promise.resolve({ data: null }),
      liquidationId || voucher
        ? db.from("liquidations").select("id,status,amount_received,total_spent")
            .eq(liquidationId ? "id" : "voucher_id", liquidationId ?? voucher!.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const settlement = liquidation.data
      ? (await db.from("cash_settlements").select("kind,amount").eq("liquidation_id", liquidation.data.id).maybeSingle()).data
      : null;

    return buildRequestTrail(
      {
        request: request.data ? { id: request.data.id, ref: shortRef(request.data.request_no), status: request.data.status } : null,
        voucher: voucher ? { id: voucher.id, pcv: voucher.pcv_number, status: voucher.status, released: Boolean(voucher.released_at) } : null,
        liquidation: liquidation.data
          ? { id: liquidation.data.id, status: liquidation.data.status, received: String(liquidation.data.amount_received), spent: String(liquidation.data.total_spent) }
          : null,
        settlement: settlement ? { kind: settlement.kind, amount: String(settlement.amount) } : null,
      },
      here.key,
    );
  } catch {
    return null;
  }
}
