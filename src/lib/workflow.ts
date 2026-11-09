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
};
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type WorkflowFunctions = {
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

export type WorkflowDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "liquidation_receipt_lines"> & {
      liquidation_receipt_lines: Table<ReceiptRecord>;
    };
    // PostgreSQL does not expose RPC argument nullability to generated clients.
    Functions: Omit<Database["public"]["Functions"], keyof WorkflowFunctions> & WorkflowFunctions;
  };
};
