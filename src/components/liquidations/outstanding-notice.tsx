import { DailyLiquidationReminder } from "./daily-reminder";
import { CreateLiquidationButton } from "./create-liquidation-button";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTz } from "@/lib/dates";
import { formatDateTime } from "@/lib/dates";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export async function OutstandingLiquidationNotice() {
  const db = await createClient();
  const result = await db.rpc("my_outstanding_liquidations");
  if (result.error)
    throw new Error("Could not check outstanding liquidations.");
  if (!result.data.length) return null;
  const reminders = await db
    .from("liquidation_reminders")
    .select("voucher_id,recipient_id")
    .eq("reminder_date", todayInAppTz())
    .in(
      "voucher_id",
      result.data
        .map((item) => item.voucher_id)
        .filter((id): id is string => Boolean(id)),
    )
    .limit(1);

  return (
    <Alert
      variant={
        result.data.some((item) => item.overdue) ? "destructive" : "default"
      }
    >
      {reminders.data?.[0] && <DailyLiquidationReminder userId={reminders.data[0].recipient_id} date={todayInAppTz()}/>}
      <AlertTitle>
        {reminders.data?.length
          ? "Daily reminder. Your liquidation is overdue"
          : "Complete your earlier liquidation before requesting another budget"}
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-3">
          <p>
            Liquidation is due within 48 hours of cash release. New budget
            requests become available after you submit your earlier liquidation.
          </p>
          {result.data.map((item) =>
            item.voucher_id && item.due_at ? (
              <div
                key={item.voucher_id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="space-y-1">
                  {item.liquidation_id ? (
                    <Link
                      className="font-medium underline underline-offset-4"
                      href={`/liquidations/${item.liquidation_id}`}
                    >
                      {item.pcv_number}
                    </Link>
                  ) : (
                    <p className="font-medium">{item.pcv_number}</p>
                  )}
                  <p>{item.fund_name}</p>
                  <p>Due {formatDateTime(item.due_at)}</p>
                </div>
                <div className="space-y-2">
                  <Badge variant={item.overdue ? "destructive" : "outline"}>
                    {item.overdue ? "Overdue" : "Liquidation due"}
                  </Badge>
                  {!item.liquidation_id && (
                    <CreateLiquidationButton voucherId={item.voucher_id} />
                  )}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
