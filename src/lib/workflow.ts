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
      approver_reviews_owner: { Args: { p_fund: string; p_owner: string }; Returns: boolean };
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
type FundRow = Database["public"]["Tables"]["funds"]["Row"] & { custodian_self_approval: boolean };

export type WorkflowDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "liquidation_receipt_lines" | "funds"> & {
      funds: Table<FundRow>;
      notifications: Table<NotificationRecord>;
      notification_preferences: Table<NotificationPreferenceRecord>;
      liquidation_receipt_lines: Table<ReceiptRecord>;
      fund_approvers: Table<{ fund_id: string; approver_id: string; created_at: string }>;
    };
    // PostgreSQL does not expose RPC argument nullability to generated clients.
    Functions: Omit<Database["public"]["Functions"], keyof WorkflowFunctions> & WorkflowFunctions;
  };
};
