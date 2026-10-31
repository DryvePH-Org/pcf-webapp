"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink, Flag } from "lucide-react";
import { toast } from "sonner";

import { approveVoucher, flagVoucher } from "@/actions/vouchers";
import type { ApprovalItem } from "@/components/approvals/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReceiptViewer } from "@/components/vouchers/receipt-viewer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ActionResult } from "@/lib/action-result";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPHP } from "@/lib/money";

type DialogState = { kind: "approve" | "flag"; id: string };

export function ApprovalsBoard({
  items,
  viewerId,
}: {
  items: ApprovalItem[];
  viewerId: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const sheetItem = sheetId
    ? (items.find((item) => item.id === sheetId) ?? null)
    : null;
  const dialogItem = dialog
    ? (items.find((item) => item.id === dialog.id) ?? null)
    : null;

  function run(id: string, action: () => Promise<ActionResult>, message: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(message);
        setDialog(null);
        setSheetId(null);
        setSelectedId(items.find((item) => item.id !== id)?.id ?? null);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong.",
        );
      }
    });
  }

  return (
    <>
      <div className="hidden gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle>Queue</CardTitle>
            <CardDescription>
              {items.length} waiting · oldest first
            </CardDescription>
          </CardHeader>
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const active = selected?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-current={active ? "true" : undefined}
                    className={
                      active
                        ? "w-full space-y-1.5 bg-muted px-4 py-3 text-left"
                        : "w-full space-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.pcv_number}</span>
                      <MoneyText value={item.amount} className="text-sm font-medium" />
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {item.payee}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Released {formatReleased(item.released_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {selected ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review voucher</CardTitle>
                <CardDescription>
                  The cash is already out of the fund. Approve the record, or
                  flag it with a reason.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApprovalSummary item={selected} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  disabled={pending || selected.prepared_by === viewerId}
                  onClick={() =>
                    setDialog({ kind: "approve", id: selected.id })
                  }
                >
                  <CircleCheck />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || selected.prepared_by === viewerId}
                  onClick={() => setDialog({ kind: "flag", id: selected.id })}
                >
                  <Flag />
                  Flag
                </Button>
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href={`/vouchers/${selected.id}`} />}
                >
                  <ExternalLink />
                  Open full page
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 lg:hidden">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSheetId(item.id)}
            className="w-full space-y-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-medium">{item.pcv_number}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {item.payee}
                </span>
              </span>
              <StatusBadge status="released" />
            </span>
            <span className="flex items-end justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                <span className="block">{formatDate(item.voucher_date)}</span>
                <span className="block">{item.category_name}</span>
              </span>
              <MoneyText value={item.amount} className="font-medium" />
            </span>
            <span className="block text-xs text-muted-foreground">
              Released {formatReleased(item.released_at)} · Tap to review
            </span>
          </button>
        ))}
      </div>

      <Sheet
        open={Boolean(sheetItem)}
        onOpenChange={(open) => {
          if (!open) setSheetId(null);
        }}
      >
        {sheetItem ? (
          <SheetContent
            side="right"
            className="w-full max-w-none gap-0 p-0 data-[side=right]:w-full sm:max-w-lg sm:data-[side=right]:w-[32rem]"
          >
            <SheetHeader className="border-b p-4 pr-12">
              <SheetTitle>{sheetItem.pcv_number}</SheetTitle>
              <SheetDescription>
                {sheetItem.payee} · {formatPHP(sheetItem.amount)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <ApprovalSummary item={sheetItem} />
            </div>
            <SheetFooter className="border-t p-4">
              <Button
                className="w-full"
                disabled={pending || sheetItem.prepared_by === viewerId}
                onClick={() => setDialog({ kind: "approve", id: sheetItem.id })}
              >
                <CircleCheck />
                Approve
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={pending || sheetItem.prepared_by === viewerId}
                onClick={() => setDialog({ kind: "flag", id: sheetItem.id })}
              >
                <Flag />
                Flag
              </Button>
            </SheetFooter>
          </SheetContent>
        ) : null}
      </Sheet>

      {dialogItem && dialog?.kind === "approve" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          title="Approve this voucher?"
          description={
            <>
              {formatPHP(dialogItem.amount)} to {dialogItem.payee}. The cash was
              already released; approving records your review.
            </>
          }
          confirmLabel="Approve"
          pending={pending}
          onConfirm={() =>
            run(
              dialogItem.id,
              () => approveVoucher(dialogItem.id),
              "Voucher approved.",
            )
          }
        />
      ) : null}

      {dialogItem && dialog?.kind === "flag" ? (
        <ReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          title="Flag this voucher"
          description="The cash stays counted. Tell the custodian what needs to be corrected."
          label="What is wrong?"
          placeholder="Example: the receipt does not match the amount."
          confirmLabel="Flag voucher"
          destructive
          pending={pending}
          onSubmit={(reason) =>
            run(
              dialogItem.id,
              () => flagVoucher({ voucher_id: dialogItem.id, reason }),
              "Voucher flagged.",
            )
          }
        />
      ) : null}
    </>
  );
}

function ApprovalSummary({ item }: { item: ApprovalItem }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="font-heading text-lg font-semibold">
            {item.pcv_number}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.payee} · {formatDate(item.voucher_date)}
          </p>
        </div>
        <div className="text-right">
          <MoneyText
            value={item.amount}
            className="font-heading text-xl font-semibold"
          />
          <p className="text-xs text-muted-foreground">
            Released {formatReleased(item.released_at)}
          </p>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Detail label="Fund" value={item.fund_name} />
        <Detail label="Category" value={item.category_name} />
        <Detail label="Prepared by" value={item.prepared_by_name} />
        <Detail
          label="Cash released"
          value={item.released_at ? formatDateTime(item.released_at) : "—"}
        />
      </dl>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Particulars</p>
        <p className="text-sm whitespace-pre-wrap">{item.particulars}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Receipt</p>
        <ReceiptViewer
          url={item.receipt_url}
          noReceiptReason={item.no_receipt_reason}
        />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function formatReleased(value: string | null) {
  return value ? formatDateTime(value) : "—";
}
