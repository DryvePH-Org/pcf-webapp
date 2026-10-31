"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getAdminUser } from "@/lib/auth";
import { parseMoney, toMoneyNumber } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { saveFundSchema, type SaveFundInput } from "@/lib/validators/fund";

function validationError(error: z.ZodError): ActionResult {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<
    string,
    string[]
  >;
  return actionError("Check the highlighted fields.", fieldErrors);
}

export async function saveFund(input: SaveFundInput): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can change fund settings.");
  }

  const parsed = saveFundSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { id, confirmAmountChange, custodian_id, ...values } = parsed.data;
  const payload = {
    name: values.name,
    amount: toMoneyNumber(values.amount),
    per_txn_limit: toMoneyNumber(values.per_txn_limit),
    low_balance_pct: values.low_balance_pct,
    custodian_id: custodian_id === "none" ? null : custodian_id,
  };

  const supabase = await createClient();

  if (id) {
    const { data: current, error: readError } = await supabase
      .from("funds")
      .select("amount")
      .eq("id", id)
      .maybeSingle();

    if (readError) return actionError(readError.message);
    if (!current) return actionError("Fund not found.");

    const amountChanged =
      parseMoney(String(current.amount)) !== parseMoney(values.amount);
    if (amountChanged && !confirmAmountChange) {
      return actionError(
        "Confirm the fund amount change before saving. It recalculates expected cash.",
      );
    }

    const { error } = await supabase.from("funds").update(payload).eq("id", id);
    if (error) return actionError(error.message);
  } else {
    const { error } = await supabase.from("funds").insert(payload);
    if (error) return actionError(error.message);
  }

  revalidatePath("/admin/funds");
  return { ok: true };
}
