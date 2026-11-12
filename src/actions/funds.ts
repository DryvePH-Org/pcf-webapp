"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/db-error";
import { isRepeat, REPEAT_MESSAGE } from "@/lib/rate-limit";
import { actionError, type ActionResult } from "@/lib/action-result";
import { getAdminUser, getCurrentUser } from "@/lib/auth";
import { parseMoney, toMoneyNumber } from "@/lib/money";
import { queueNotification } from "@/lib/notifications/deliver";
import { notifyFundAssignment } from "@/lib/notifications/events";
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

  const { id, confirmAmountChange, custodian_ids, ...values } = parsed.data;
  if (!id && (await isRepeat(admin.id, "fund:create", parsed.data))) return actionError(REPEAT_MESSAGE);
  const wanted = [...new Set(custodian_ids)];
  const payload = {
    name: values.name,
    amount: toMoneyNumber(values.amount),
    per_txn_limit: toMoneyNumber(values.per_txn_limit),
    approval_threshold: toMoneyNumber(values.approval_threshold),
    low_balance_pct: values.low_balance_pct,
  };

  const supabase = await createClient();
  let previous: string[] = [];
  let fundId = id;

  if (id) {
    const { data: current, error: readError } = await supabase
      .from("funds")
      .select("amount")
      .eq("id", id)
      .maybeSingle();

    if (readError) return actionError(safeDbMessage(readError));
    if (!current) return actionError("Fund not found.");

    const { data: links, error: linkError } = await supabase
      .from("fund_custodians")
      .select("custodian_id")
      .eq("fund_id", id);
    if (linkError) return actionError(safeDbMessage(linkError));
    previous = links.map((link) => link.custodian_id);

    const amountChanged =
      parseMoney(String(current.amount)) !== parseMoney(values.amount);
    if (amountChanged && !confirmAmountChange) {
      return actionError(
        "Confirm the fund amount change before saving. It recalculates expected cash.",
      );
    }

    const { error } = await supabase.from("funds").update(payload).eq("id", id);
    if (error) return actionError(safeDbMessage(error));
  } else {
    const { data: created, error } = await supabase
      .from("funds")
      .insert(payload)
      .select("id")
      .single();
    if (error) return actionError(safeDbMessage(error));
    fundId = created.id;
  }

  const { error: custodianError } = await supabase.rpc("set_fund_custodians", {
    p_fund_id: fundId as string,
    p_custodian_ids: wanted,
  });
  if (custodianError) return actionError(safeDbMessage(custodianError));

  const fundName = payload.name;
  const added = wanted.filter((userId) => !previous.includes(userId));
  const removed = previous.filter((userId) => !wanted.includes(userId));
  for (const userId of added) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({ userId, added: [fundName], removed: [], actorId: admin.id }),
    );
  }
  for (const userId of removed) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({ userId, added: [], removed: [fundName], actorId: admin.id }),
    );
  }

  revalidatePath("/admin/funds");
  return { ok: true };
}

const assignFundSchema = z.object({ fundId: z.uuid(), custodianIds: z.array(z.uuid()).max(20) });
export async function assignFundCustodians(input: z.input<typeof assignFundSchema>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !["admin", "accounting"].includes(user.role)) return actionError("Only accounting and administrators can assign custodians.");
  const parsed = assignFundSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const db = await createClient();
  const { error } = await db.rpc("set_fund_custodians", { p_fund_id: parsed.data.fundId, p_custodian_ids: [...new Set(parsed.data.custodianIds)] });
  if (error) return actionError(safeDbMessage(error));
  for (const path of ["/funds", "/admin/funds", "/admin/users", "/dashboard", "/requests"]) revalidatePath(path);
  return { ok: true };
}
