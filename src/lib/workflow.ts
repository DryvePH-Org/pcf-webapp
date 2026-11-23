import type { Database, Json } from "@/lib/database.types";
export type ReceiptRecord = {
  id: string;
  liquidation_id: string;
  position: number;
  particulars: string;
  amount: number;
  supplier: string;
  tin: string;
  tag: string;
  expense_date: string;
  plate: string;
  receipt_number: string;
  receipt_path: string | null;
  physical_checked: boolean;
  company: string;
};
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type WorkflowFunctions = {
      approver_acts_in: { Args: { p_fund: string }; Returns: boolean };
      approve_request_as_approver: { Args: { p_id: string; p_approve: boolean; p_note: string | null }; Returns: undefined };
      voucher_needs_pre_approval: { Args: { p_voucher: string }; Returns: boolean };
      advance_cancellation_state: {
        Args: { p_voucher: string };
        Returns: {
          can_cancel: boolean; can_record_return: boolean; blocked: string | null; cancelled: boolean; returned: boolean;
          amount: number | null; reason_code: string | null; note: string | null; cancelled_at: string | null;
          canceller_name: string | null; returned_on: string | null; returner_name: string | null;
        }[];
      };
      cancel_unused_advance: {
        Args: { p_voucher: string; p_reason: string; p_note: string | null; p_cash_back: boolean; p_returned_on: string | null };
        Returns: undefined;
      };
      record_cancelled_advance_return: { Args: { p_voucher: string; p_returned_on: string }; Returns: undefined };
      approver_reviews_owner: { Args: { p_fund: string; p_owner: string }; Returns: boolean };
      approver_prepares_owner: { Args: { p_fund: string; p_owner: string }; Returns: boolean };
      remove_user: { Args: { p_user: string }; Returns: undefined };
      create_liquidation_for: { Args: { p_voucher_id: string }; Returns: string };
      can_file_liquidation_for: { Args: { p_voucher: string }; Returns: boolean };
      telegram_issue_link_code: { Args: { p_user: string }; Returns: string };
      telegram_unlink: { Args: { p_user: string }; Returns: undefined };
      telegram_redeem_link_code: { Args: { p_code: string; p_chat: number; p_username: string | null }; Returns: { profile_id: string; full_name: string }[] };
      telegram_create_budget_request: { Args: { p_user: string; p_fund: string; p_amount: number; p_purpose: string }; Returns: string };
      accounting_latest_date: { Args: { p_source: string; p_book: string | null; p_tab: number | null; p_custodian: string | null }; Returns: string | null };
      close_replenishment_with_handover: { Args: { p_id: string; p_on: string; p_amount: number; p_note: string | null }; Returns: undefined };
      apply_sheet_edits: { Args: { p_book: string; p_rows: Json }; Returns: { applied: number; flagged: number } };
      set_liquidation_photos: { Args: { p_id: string; p_photos: { item_id: string; path: string }[] }; Returns: undefined };
      set_fund_expense_tags: { Args: { p_fund: string; p_tags: string[] }; Returns: undefined };
      approve_liquidation_without_sheet: { Args: { p_id: string }; Returns: undefined };
      apply_grokbot_book_snapshot: { Args: { p_book: string; p_rows: Json; p_tab: Json; p_token: string }; Returns: undefined };
      queue_grokbot_replenishment: { Args: { p_id: string; p_operation: string; p_hash: string; p_book?: string }; Returns: string };
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: undefined };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: undefined };
      prune_notifications: { Args: Record<string, never>; Returns: number };
      set_notification_preferences: { Args: { p_email_actions: boolean; p_email_digest: boolean }; Returns: undefined };
      set_fund_self_approval: { Args: { p_fund_id: string; p_allowed: boolean }; Returns: undefined };
      fund_self_approval_flags: { Args: Record<string, never>; Returns: { fund_id: string; allowed: boolean }[] };
      self_approval_allowed: { Args: { p_fund: string; p_user: string }; Returns: boolean };
      request_needs_fund_approver: { Args: { p_fund: string; p_requester: string }; Returns: boolean };
      is_fund_approver: { Args: { p_fund: string }; Returns: boolean };
      set_fund_approvers: { Args: { p_fund_id: string; p_approver_ids: string[] }; Returns: undefined };
      list_fund_review_routes: {
        Args: Record<string, never>;
        Returns: { fund_id: string; approver_names: string[]; i_am_custodian: boolean }[];
      };
      save_custodian_receipts: {
        Args: { p_id: string; p_revision: number; p_lines: Json };
        Returns: undefined;
      };
      list_custodian_tags: { Args: { p_fund: string }; Returns: string[] };
      save_workflow_voucher: {
        Args: {
          p_id: string | null;
          p_fund: string | null;
          p_request: string | null;
          p_payee: string;
          p_date: string;
          p_items: Json;
          p_number_mode: string;
          p_number: string | null;
        };
        Returns: string;
      };
      suggest_voucher_number: { Args: { p_fund: string }; Returns: string };
      approve_replenishment: {
        Args: { p_id: string; p_approve: boolean; p_note: string | null };
        Returns: undefined;
      };
    };

export type NotificationRecord = {
  id: string;
  user_id: string;
  event: string;
  title: string;
  body: string | null;
  link_path: string | null;
  tone: "info" | "action" | "alert" | "success";
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};
export type NotificationPreferenceRecord = {
  user_id: string;
  email_actions: boolean;
  email_digest: boolean;
  updated_at: string;
};
type RequestRow = Database["public"]["Tables"]["budget_requests"]["Row"] & {
  approver_id: string | null;
  approver_name: string | null;
  approver_at: string | null;
  approver_note: string | null;
};
type FundRow = Database["public"]["Tables"]["funds"]["Row"] & { custodian_self_approval: boolean; sheet_ledger: boolean };

export type WorkflowDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "liquidation_receipt_lines" | "funds" | "budget_requests"> & {
      funds: Table<FundRow>;
      budget_requests: Table<RequestRow>;
      notifications: Table<NotificationRecord>;
      notification_preferences: Table<NotificationPreferenceRecord>;
      liquidation_receipt_lines: Table<ReceiptRecord>;
      advance_cancellations: Table<{ id: string; voucher_id: string; fund_id: string; amount: number; cancelled_at: string; returned_on: string | null }>;
      fund_approvers: Table<{ fund_id: string; approver_id: string; created_at: string }>;
      fund_expense_tags: Table<{ fund_id: string; tag: string; position: number }>;
      telegram_links: Table<{ profile_id: string; chat_id: number; username: string | null; linked_at: string }>;
      telegram_drafts: Table<{ id: string; chat_id: number; profile_id: string; fund_id: string | null; amount: number | null; purpose: string | null; transcript: string | null; status: string; request_id: string | null; message_id: number | null; created_at: string; updated_at: string }>;
      telegram_updates: Table<{ update_id: number; received_at: string }>;
      request_approval_emails: Table<{ request_id: string; created_at: string; emailed_at: string | null }>;
      sheet_edit_log: Table<{ id: string; book_id: string; fund_id: string | null; liquidation_id: string | null; line_id: string | null; voucher: string; kind: "tag_changed" | "tag_unknown" | "amount_differs"; summary: string; app_value: string; sheet_value: string; sheet_row: number | null; applied: boolean; detected_at: string; resolved_at: string | null }>;
      liquidation_item_photos: Table<{ liquidation_id: string; item_id: string; position: number; path: string; created_at: string }>;
      fund_export_templates: Table<{ fund_id: string; file_name: string; storage_path: string; uploaded_by: string | null; uploaded_at: string }>;
    };
    // PostgreSQL does not expose RPC argument nullability to generated clients.
    Functions: Omit<Database["public"]["Functions"], keyof WorkflowFunctions> & WorkflowFunctions;
  };
};
