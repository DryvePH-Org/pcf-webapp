import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { shortRef } from "@/lib/refs";
import { buildRequestTrail, stageLabel, type TrailInput, type TrailKey, type TrailStep } from "@/lib/request-trail";

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

// The stage line for every row of a list page (a page has at most a few dozen rows): one batch of reads for the
// whole page, then the same trail logic as the detail pages. A failure only means no line is shown.
export async function loadStageLabels(
  db: SupabaseClient<Database>,
  kind: Exclude<TrailKey, "settlement">,
  ids: string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (!ids.length) return labels;
  try {
    type V = { id: string; pcv_number: string; status: string; released_at: string | null; budget_request_id: string | null; created_at: string };
    type L = { id: string; voucher_id: string; status: string; amount_received: number; total_spent: number };
    const voucherCols = "id,pcv_number,status,released_at,budget_request_id,created_at";
    let vouchers: V[] = [];
    let liquidations: L[] = [];
    if (kind === "request") {
      vouchers = ((await db.from("vouchers").select(voucherCols).in("budget_request_id", ids)).data ?? []) as V[];
    } else if (kind === "voucher") {
      vouchers = ((await db.from("vouchers").select(voucherCols).in("id", ids)).data ?? []) as V[];
    } else {
      liquidations = ((await db.from("liquidations").select("id,voucher_id,status,amount_received,total_spent").in("id", ids)).data ?? []) as L[];
      vouchers = ((await db.from("vouchers").select(voucherCols).in("id", liquidations.map((row) => row.voucher_id))).data ?? []) as V[];
    }
    if (kind !== "liquidation" && vouchers.length)
      liquidations = ((await db.from("liquidations").select("id,voucher_id,status,amount_received,total_spent").in("voucher_id", vouchers.map((row) => row.id))).data ?? []) as L[];
    const requestIds = [...new Set(kind === "request" ? ids : vouchers.map((row) => row.budget_request_id).filter((id): id is string => Boolean(id)))];
    const [requests, settlements] = await Promise.all([
      requestIds.length ? db.from("budget_requests").select("id,request_no,status").in("id", requestIds) : Promise.resolve({ data: [] }),
      liquidations.length ? db.from("cash_settlements").select("liquidation_id,kind,amount").in("liquidation_id", liquidations.map((row) => row.id)) : Promise.resolve({ data: [] }),
    ]);
    const requestById = new Map((requests.data ?? []).map((row) => [row.id, row]));
    const liquidationByVoucher = new Map(liquidations.map((row) => [row.voucher_id, row]));
    const settlementByLiquidation = new Map((settlements.data ?? []).map((row) => [row.liquidation_id, row]));
    const liveVoucher = (list: V[]) => [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((row) => row.status !== "void") ?? list[0] ?? null;

    for (const id of ids) {
      let voucher: V | null = null;
      let requestId: string | null = null;
      if (kind === "request") {
        requestId = id;
        voucher = liveVoucher(vouchers.filter((row) => row.budget_request_id === id));
      } else if (kind === "voucher") {
        voucher = vouchers.find((row) => row.id === id) ?? null;
        requestId = voucher?.budget_request_id ?? null;
      } else {
        const liquidation = liquidations.find((row) => row.id === id);
        voucher = vouchers.find((row) => row.id === liquidation?.voucher_id) ?? null;
        requestId = voucher?.budget_request_id ?? null;
      }
      const request = requestId ? requestById.get(requestId) : null;
      const liquidation = voucher ? liquidationByVoucher.get(voucher.id) : null;
      const settlement = liquidation ? settlementByLiquidation.get(liquidation.id) : null;
      const input: TrailInput = {
        request: request ? { id: request.id, ref: shortRef(request.request_no), status: request.status } : null,
        voucher: voucher ? { id: voucher.id, pcv: voucher.pcv_number, status: voucher.status, released: Boolean(voucher.released_at) } : null,
        liquidation: liquidation ? { id: liquidation.id, status: liquidation.status, received: String(liquidation.amount_received), spent: String(liquidation.total_spent) } : null,
        settlement: settlement ? { kind: settlement.kind, amount: String(settlement.amount) } : null,
      };
      labels.set(id, stageLabel(buildRequestTrail(input, kind)));
    }
  } catch {
    return new Map();
  }
  return labels;
}
