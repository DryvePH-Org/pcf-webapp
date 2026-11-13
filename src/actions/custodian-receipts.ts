"use server";

import { mayReviewOwner } from "@/lib/self-approval";
import { extractPhilippineReceipt } from "@/lib/receipt-extraction";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeDbMessage } from "@/lib/db-error";
import { withinLimit } from "@/lib/rate-limit";
import { toMoneyNumber } from "@/lib/money";
import { custodianReviewSchema } from "@/lib/validators/custodian-receipts";
import type { WorkflowDatabase } from "@/lib/workflow";

export async function saveCustodianReceipts(input: unknown) {
  const user = await getCurrentUser();
  if (!user || !["admin", "custodian"].includes(user.role))
    return { ok: false as const, error: "Custodian access required." };
  const parsed = custodianReviewSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0].message };
  const db =
    (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const { error } = await db.rpc("save_custodian_receipts", {
    p_id: parsed.data.id,
    p_revision: parsed.data.revision,
    p_lines: parsed.data.lines.map((line) => ({
      ...line,
      amount: toMoneyNumber(line.amount),
    })),
  });
  if (error) return { ok: false as const, error: safeDbMessage(error) };
  revalidatePath(`/liquidations/${parsed.data.id}`);
  return { ok: true as const };
}

export async function extractCustodianReceipt(id: string, path: string) {
  const user = await getCurrentUser();
  if (
    !user ||
    !["admin", "custodian"].includes(user.role) ||
    !z.uuid().safeParse(id).success ||
    !path.startsWith(id + "/") ||
    path.length > 300
  )
    return { ok: false as const, error: "Receipt unavailable." };
  const db =
    (await createClient()) as unknown as SupabaseClient<WorkflowDatabase>;
  const liquidation = await db
    .from("liquidations")
    .select("id,owner_id,status,fund_id")
    .eq("id", id)
    .single();
  if (
    liquidation.error ||
    liquidation.data.status !== "submitted" ||
    !(await mayReviewOwner(db, user, liquidation.data.fund_id, liquidation.data.owner_id))
  )
    return {
      ok: false as const,
      error:
        "Open a submitted liquidation you may review to extract its receipts.",
    };
  const access = await db.rpc("can_access_fund", {
    p_fund_id: liquidation.data.fund_id,
  });
  if (access.error || !access.data)
    return { ok: false as const, error: "This fund is not assigned to you." };
  const key = process.env.GROQ_API_KEY;
  if (!key)
    return {
      ok: false as const,
      error:
        "Receipt extraction is not configured. Ask an administrator to enable it.",
    };
  if (!(await withinLimit(`receipt-extract:${user.id}`, 10, 60)))
    return {
      ok: false as const,
      error: "Extraction limit reached. Wait a minute before trying again.",
    };
  const [download, tags] = await Promise.all([
    db.storage.from("liquidation-receipts").download(path),
    db.rpc("list_custodian_tags", { p_fund: liquidation.data.fund_id }),
  ]);
  if (download.error || tags.error || !download.data)
    return {
      ok: false as const,
      error: "Could not read the receipt or workbook tags.",
    };
  const file = download.data;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    return { ok: false as const, error: "Use a receipt image up to 5 MB." };
  try {
    const extracted = await extractPhilippineReceipt(file, tags.data ?? []);
    return { ok: true as const, ...extracted };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not extract the receipt. Enter the details manually.",
    };
  }
}
