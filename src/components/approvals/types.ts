export type ApprovalItem = {
  id: string;
  pcv_number: string;
  voucher_date: string;
  payee: string;
  particulars: string;
  amount: string;
  category_name: string;
  fund_name: string;
  prepared_by: string;
  prepared_by_name: string;
  released_at: string | null;
  receipt_url: string | null;
  no_receipt_reason: string | null;
};
