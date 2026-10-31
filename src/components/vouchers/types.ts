import type { VoucherStatus } from "@/lib/voucher-status";

export type FundOption = {
  id: string;
  name: string;
  per_txn_limit: string;
};

export type CategoryOption = {
  id: string;
  name: string;
};

export type VoucherListRow = {
  id: string;
  pcv_number: string;
  voucher_date: string;
  payee: string;
  particulars: string;
  amount: string;
  status: VoucherStatus;
  category_name: string;
  fund_name: string;
};

export type VoucherDetail = VoucherListRow & {
  fund_id: string;
  category_id: string;
  receipt_path: string | null;
  no_receipt_reason: string | null;
  reject_reason: string | null;
  void_reason: string | null;
  replenishment_id: string | null;
  prepared_by: string;
  prepared_by_name: string;
  approved_by_name: string | null;
  created_at: string;
  released_at: string | null;
  approved_at: string | null;
};
