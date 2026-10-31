import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  CircleCheck,
  FileText,
  Flag,
  PackageCheck,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/layout/print-button";
import { MoneyText } from "@/components/shared/money-text";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReceiptViewer } from "@/components/vouchers/receipt-viewer";
import { VoucherActions } from "@/components/vouchers/voucher-actions";
import { VoucherPrint } from "@/components/vouchers/voucher-print";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import {
  isVoucherStatus,
  type VoucherStatus,
} from "@/lib/voucher-status";

export const instant = false;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VoucherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("/vouchers");
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createClient();
  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!voucher) notFound();

  const profileIds = [
    voucher.prepared_by,
    ...(voucher.approved_by ? [voucher.approved_by] : []),
  ];

  const [categoryResult, fundResult, profileResult] = await Promise.all([
    supabase
      .from("categories")
      .select("name")
      .eq("id", voucher.category_id)
      .maybeSingle(),
    supabase
      .from("funds")
      .select("name")
      .eq("id", voucher.fund_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds),
  ]);

  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (fundResult.error) throw new Error(fundResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const names = new Map(
    profileResult.data.map((profile) => [profile.id, profile.full_name]),
  );
  const preparedByName = names.get(voucher.prepared_by) ?? "—";
  const approvedByName = voucher.approved_by
    ? (names.get(voucher.approved_by) ?? "—")
    : null;
  const categoryName = categoryResult.data?.name ?? "—";
  const fundName = fundResult.data?.name ?? "—";
  const status: VoucherStatus = isVoucherStatus(voucher.status)
    ? voucher.status
    : "draft";

  let receiptUrl: string | null = null;
  if (voucher.receipt_path) {
    const { data: signed } = await supabase.storage
      .from("receipts")
      .createSignedUrl(voucher.receipt_path, 3600);
    receiptUrl = signed?.signedUrl ?? null;
  }

  const events = buildTimeline({
    createdAt: voucher.created_at,
    releasedAt: voucher.released_at,
    approvedAt: voucher.approved_at,
    approvedByName,
    rejected: status === "rejected",
    rejectReason: voucher.reject_reason,
    closed: status === "closed" || Boolean(voucher.replenishment_id),
    voided: status === "void",
    voidReason: voucher.void_reason,
    preparedByName,
  });

  return (
    <>
      <div className="space-y-6 print:hidden">
        <PageHeader
          title={voucher.pcv_number}
          description={`${voucher.payee} · ${formatDate(voucher.voucher_date)}`}
          actions={
            <>
              <StatusBadge status={status} />
              <PrintButton />
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/vouchers" />}
              >
                Back
              </Button>
            </>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Voucher</CardTitle>
                <CardDescription>{particularsSummary(voucher.particulars)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <MoneyText
                      value={String(voucher.amount)}
                      className="font-heading text-2xl font-semibold"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {fundName} · {categoryName}
                  </p>
                </div>

                {status === "rejected" ? (
                  <Alert variant="destructive">
                    <Flag />
                    <AlertTitle>Flagged by the approver</AlertTitle>
                    <AlertDescription>
                      {voucher.reject_reason ??
                        "The approver flagged this voucher."}{" "}
                      Cash stays counted. Ask an admin to void or correct it.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {status === "void" ? (
                  <Alert variant="destructive">
                    <Ban />
                    <AlertTitle>Voided</AlertTitle>
                    <AlertDescription>
                      {voucher.void_reason ?? "This voucher was voided."}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Detail label="Voucher date" value={formatDate(voucher.voucher_date)} />
                  <Detail label="Payee" value={voucher.payee} />
                  <Detail label="Category" value={categoryName} />
                  <Detail label="Fund" value={fundName} />
                  <Detail label="Prepared by" value={preparedByName} />
                  <Detail
                    label="Cash released"
                    value={
                      voucher.released_at
                        ? formatDateTime(voucher.released_at)
                        : "Not yet released"
                    }
                  />
                  <Detail
                    label="Reviewed by"
                    value={
                      approvedByName
                        ? `${approvedByName}${
                            voucher.approved_at
                              ? ` · ${formatDateTime(voucher.approved_at)}`
                              : ""
                          }`
                        : "Pending review"
                    }
                  />
                  <Detail
                    label="Replenishment"
                    value={
                      voucher.replenishment_id
                        ? "Included in a replenishment"
                        : "Not yet included"
                    }
                  />
                </dl>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Particulars</p>
                  <p className="text-sm whitespace-pre-wrap">
                    {voucher.particulars}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Receipt</CardTitle>
                <CardDescription>
                  {voucher.receipt_path
                    ? "Signed link, valid for one hour."
                    : "No receipt photo on file."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReceiptViewer
                  url={receiptUrl}
                  noReceiptReason={voucher.no_receipt_reason}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <VoucherActions
              voucher={{
                id: voucher.id,
                fund_id: voucher.fund_id,
                payee: voucher.payee,
                amount: String(voucher.amount),
                status,
                prepared_by: voucher.prepared_by,
                receipt_path: voucher.receipt_path,
                no_receipt_reason: voucher.no_receipt_reason,
                replenishment_id: voucher.replenishment_id,
              }}
              viewer={{ id: user.id, role: user.role }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>
                  Prepared, released, then reviewed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {events.map((event) => {
                    const Icon = event.icon;
                    return (
                      <li key={event.key} className="flex gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium">{event.label}</p>
                          {event.at ? (
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(event.at)}
                            </p>
                          ) : null}
                          {event.detail ? (
                            <p className="text-xs text-muted-foreground">
                              {event.detail}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <VoucherPrint
          pcvNumber={voucher.pcv_number}
          fundName={fundName}
          voucherDate={voucher.voucher_date}
          payee={voucher.payee}
          particulars={voucher.particulars}
          amount={String(voucher.amount)}
          categoryName={categoryName}
          status={status}
          preparedByName={preparedByName}
          approvedByName={approvedByName}
          approvedAt={voucher.approved_at}
          releasedAt={voucher.released_at}
          noReceiptReason={voucher.no_receipt_reason}
          voidReason={voucher.void_reason}
        />
      </div>
    </>
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

function particularsSummary(particulars: string) {
  return particulars.length > 80
    ? `${particulars.slice(0, 80).trimEnd()}…`
    : particulars;
}

function buildTimeline({
  createdAt,
  releasedAt,
  approvedAt,
  approvedByName,
  rejected,
  rejectReason,
  closed,
  voided,
  voidReason,
  preparedByName,
}: {
  createdAt: string;
  releasedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  rejected: boolean;
  rejectReason: string | null;
  closed: boolean;
  voided: boolean;
  voidReason: string | null;
  preparedByName: string;
}) {
  const events: {
    key: string;
    label: string;
    at?: string | null;
    detail?: string;
    icon: typeof FileText;
  }[] = [
    {
      key: "prepared",
      label: "Prepared",
      at: createdAt,
      detail: `by ${preparedByName}`,
      icon: FileText,
    },
  ];

  if (releasedAt) {
    events.push({
      key: "released",
      label: "Cash released",
      at: releasedAt,
      detail: "Cash left the fund and the approver was notified.",
      icon: Wallet,
    });
  }

  if (approvedAt) {
    events.push({
      key: "approved",
      label: "Reviewed and approved",
      at: approvedAt,
      detail: approvedByName ? `by ${approvedByName}` : undefined,
      icon: CircleCheck,
    });
  }

  if (rejected) {
    events.push({
      key: "flagged",
      label: "Flagged by the approver",
      detail: rejectReason ?? undefined,
      icon: Flag,
    });
  }

  if (closed) {
    events.push({
      key: "closed",
      label: "Closed in a replenishment",
      icon: PackageCheck,
    });
  }

  if (voided) {
    events.push({
      key: "voided",
      label: "Voided",
      detail: voidReason ?? undefined,
      icon: Ban,
    });
  }

  return events;
}
