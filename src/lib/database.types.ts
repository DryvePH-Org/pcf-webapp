export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
      }
      budget_requests: {
        Row: {
          amount: number
          created_at: string
          fund_id: string
          fund_name: string
          id: string
          purpose: string
          request_no: string
          requester_id: string
          requester_name: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          fund_id: string
          fund_name: string
          id?: string
          purpose: string
          request_no: string
          requester_id: string
          requester_name: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          fund_id?: string
          fund_name?: string
          id?: string
          purpose?: string
          request_no?: string
          requester_id?: string
          requester_name?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_requests_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "budget_requests_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counts: {
        Row: {
          counted_by: string
          counted_cash: number
          created_at: string
          expected_cash: number
          fund_id: string
          id: string
          note: string | null
          variance: number | null
        }
        Insert: {
          counted_by: string
          counted_cash: number
          created_at?: string
          expected_cash: number
          fund_id: string
          id?: string
          note?: string | null
          variance?: number | null
        }
        Update: {
          counted_by?: string
          counted_cash?: number
          created_at?: string
          expected_cash?: number
          fund_id?: string
          id?: string
          note?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_counts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "cash_counts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_settlements: {
        Row: {
          amount: number
          created_at: string
          fund_id: string
          id: string
          kind: string
          liquidation_id: string
          note: string | null
          recorded_by: string
          recorder_name: string
          voucher_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fund_id: string
          id?: string
          kind: string
          liquidation_id: string
          note?: string | null
          recorded_by: string
          recorder_name: string
          voucher_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fund_id?: string
          id?: string
          kind?: string
          liquidation_id?: string
          note?: string | null
          recorded_by?: string
          recorder_name?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_settlements_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "cash_settlements_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_settlements_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: true
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_settlements_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: true
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
          {
            foreignKeyName: "cash_settlements_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_settlements_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: true
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["voucher_id"]
          },
          {
            foreignKeyName: "cash_settlements_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: true
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      data_deletions: {
        Row: {
          actor_id: string
          created_at: string
          executed_at: string | null
          filters: Json
          id: string
          plan: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          executed_at?: string | null
          filters: Json
          id?: string
          plan: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          executed_at?: string | null
          filters?: Json
          id?: string
          plan?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_deletions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_files: {
        Row: {
          bucket: string
          deletion_id: string
          path: string
        }
        Insert: {
          bucket: string
          deletion_id: string
          path: string
        }
        Update: {
          bucket?: string
          deletion_id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_files_deletion_id_fkey"
            columns: ["deletion_id"]
            isOneToOne: false
            referencedRelation: "data_deletions"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_counters: {
        Row: {
          fund_id: string
          last_no: number
          year: number
        }
        Insert: {
          fund_id: string
          last_no?: number
          year: number
        }
        Update: {
          fund_id?: string
          last_no?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fund_counters_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_counters_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_custodians: {
        Row: {
          assigned_at: string
          custodian_id: string
          fund_id: string
        }
        Insert: {
          assigned_at?: string
          custodian_id: string
          fund_id: string
        }
        Update: {
          assigned_at?: string
          custodian_id?: string
          fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_custodians_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_custodians_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_custodians_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          amount: number
          approval_threshold: number
          created_at: string
          id: string
          is_active: boolean
          low_balance_pct: number
          name: string
          per_txn_limit: number
        }
        Insert: {
          amount: number
          approval_threshold?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_balance_pct?: number
          name: string
          per_txn_limit: number
        }
        Update: {
          amount?: number
          approval_threshold?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_balance_pct?: number
          name?: string
          per_txn_limit?: number
        }
        Relationships: []
      }
      liquidation_items: {
        Row: {
          amount: number
          category_id: string
          id: string
          liquidation_id: string
          no_receipt_reason: string | null
          particulars: string
          position: number
          receipt_path: string | null
          sheet_details: Json
        }
        Insert: {
          amount: number
          category_id: string
          id?: string
          liquidation_id: string
          no_receipt_reason?: string | null
          particulars: string
          position: number
          receipt_path?: string | null
          sheet_details?: Json
        }
        Update: {
          amount?: number
          category_id?: string
          id?: string
          liquidation_id?: string
          no_receipt_reason?: string | null
          particulars?: string
          position?: number
          receipt_path?: string | null
          sheet_details?: Json
        }
        Relationships: [
          {
            foreignKeyName: "liquidation_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidation_items_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidation_items_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
        ]
      }
      liquidation_receipt_lines: {
        Row: {
          amount: number
          expense_date: string
          id: string
          liquidation_id: string
          particulars: string
          physical_checked: boolean
          plate: string
          position: number
          receipt_number: string
          receipt_path: string | null
          supplier: string
          tag: string
          tin: string
        }
        Insert: {
          amount: number
          expense_date: string
          id?: string
          liquidation_id: string
          particulars: string
          physical_checked: boolean
          plate?: string
          position: number
          receipt_number?: string
          receipt_path?: string | null
          supplier: string
          tag: string
          tin: string
        }
        Update: {
          amount?: number
          expense_date?: string
          id?: string
          liquidation_id?: string
          particulars?: string
          physical_checked?: boolean
          plate?: string
          position?: number
          receipt_number?: string
          receipt_path?: string | null
          supplier?: string
          tag?: string
          tin?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidation_receipt_lines_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidation_receipt_lines_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
        ]
      }
      liquidation_revisions: {
        Row: {
          created_at: string
          id: string
          liquidation_id: string
          payload: Json
          review_note: string | null
          reviewed_at: string | null
          reviewer_name: string | null
          revision: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          liquidation_id: string
          payload: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          revision: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          liquidation_id?: string
          payload?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          revision?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidation_revisions_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidation_revisions_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
        ]
      }
      liquidations: {
        Row: {
          amount_received: number
          created_at: string
          department: string
          employee_name: string
          filing_date: string
          flow_version: number
          fund_id: string
          fund_name: string
          id: string
          owner_id: string
          pcv_number: string
          receipt_review_revision: number
          receipt_reviewed_by: string | null
          reimbursement_approved_at: string | null
          reimbursement_approved_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_name: string | null
          revision: number
          status: string
          total_spent: number
          unspent_reason: string | null
          updated_at: string
          voucher_id: string
        }
        Insert: {
          amount_received: number
          created_at?: string
          department?: string
          employee_name: string
          filing_date?: string
          flow_version?: number
          fund_id: string
          fund_name: string
          id?: string
          owner_id: string
          pcv_number: string
          receipt_review_revision?: number
          receipt_reviewed_by?: string | null
          reimbursement_approved_at?: string | null
          reimbursement_approved_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          revision?: number
          status?: string
          total_spent?: number
          unspent_reason?: string | null
          updated_at?: string
          voucher_id: string
        }
        Update: {
          amount_received?: number
          created_at?: string
          department?: string
          employee_name?: string
          filing_date?: string
          flow_version?: number
          fund_id?: string
          fund_name?: string
          id?: string
          owner_id?: string
          pcv_number?: string
          receipt_review_revision?: number
          receipt_reviewed_by?: string | null
          reimbursement_approved_at?: string | null
          reimbursement_approved_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          revision?: number
          status?: string
          total_spent?: number
          unspent_reason?: string | null
          updated_at?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "liquidations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidations_receipt_reviewed_by_fkey"
            columns: ["receipt_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidations_reimbursement_approved_by_fkey"
            columns: ["reimbursement_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidations_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: true
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["voucher_id"]
          },
          {
            foreignKeyName: "liquidations_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: true
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          event: string
          id: number
          recipient_email: string
          recipient_id: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event: string
          id?: never
          recipient_email: string
          recipient_id?: string | null
          status: string
          subject: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          event?: string
          id?: never
          recipient_email?: string
          recipient_id?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      replenishment_items: {
        Row: {
          amount: number
          fund_id: string
          id: string
          liquidation_id: string | null
          replenishment_id: string
          voucher_id: string
        }
        Insert: {
          amount: number
          fund_id: string
          id?: string
          liquidation_id?: string | null
          replenishment_id: string
          voucher_id: string
        }
        Update: {
          amount?: number
          fund_id?: string
          id?: string
          liquidation_id?: string | null
          replenishment_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "replenishment_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_items_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_items_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
          {
            foreignKeyName: "replenishment_items_replenishment_id_fkey"
            columns: ["replenishment_id"]
            isOneToOne: false
            referencedRelation: "replenishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["voucher_id"]
          },
          {
            foreignKeyName: "replenishment_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishments: {
        Row: {
          approver_approved_at: string | null
          approver_id: string | null
          created_at: string
          fund_id: string
          id: string
          paid_at: string | null
          paid_by: string | null
          request_no: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["replenishment_status"]
          total: number
        }
        Insert: {
          approver_approved_at?: string | null
          approver_id?: string | null
          created_at?: string
          fund_id: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          request_no: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["replenishment_status"]
          total?: number
        }
        Update: {
          approver_approved_at?: string | null
          approver_id?: string | null
          created_at?: string
          fund_id?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          request_no?: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["replenishment_status"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "replenishments_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "replenishments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_expenses: {
        Row: {
          address: string
          amount: number
          book_id: string
          category: string
          company: string
          expense_date: string | null
          particulars: string
          person: string
          plate: string
          receipt_number: string
          sheet_id: number
          sheet_name: string
          source_row: number
          supplier: string
          tin: string
          voucher: string
        }
        Insert: {
          address?: string
          amount: number
          book_id: string
          category?: string
          company?: string
          expense_date?: string | null
          particulars: string
          person?: string
          plate?: string
          receipt_number?: string
          sheet_id: number
          sheet_name: string
          source_row: number
          supplier?: string
          tin?: string
          voucher?: string
        }
        Update: {
          address?: string
          amount?: number
          book_id?: string
          category?: string
          company?: string
          expense_date?: string | null
          particulars?: string
          person?: string
          plate?: string
          receipt_number?: string
          sheet_id?: number
          sheet_name?: string
          source_row?: number
          supplier?: string
          tin?: string
          voucher?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_expenses_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "sheet_workbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_jobs: {
        Row: {
          attempts: number
          book_id: string
          error: string | null
          id: string
          liquidation_id: string
          operation_id: string
          preview_id: string
          report: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          book_id: string
          error?: string | null
          id?: string
          liquidation_id: string
          operation_id: string
          preview_id: string
          report?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          book_id?: string
          error?: string | null
          id?: string
          liquidation_id?: string
          operation_id?: string
          preview_id?: string
          report?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "sheet_workbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_jobs_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: true
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_jobs_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: true
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
          {
            foreignKeyName: "sheet_jobs_preview_id_fkey"
            columns: ["preview_id"]
            isOneToOne: false
            referencedRelation: "sheet_previews"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_previews: {
        Row: {
          book_id: string
          config_version: number
          created_at: string
          expires_at: string
          google_token: string
          id: string
          liquidation_id: string
          operation_id: string
          requests: Json
          reviewer_id: string
          revision: number
          sheet_id: number
          sheet_name: string
          summary: Json
        }
        Insert: {
          book_id: string
          config_version: number
          created_at?: string
          expires_at?: string
          google_token: string
          id?: string
          liquidation_id: string
          operation_id: string
          requests: Json
          reviewer_id: string
          revision: number
          sheet_id: number
          sheet_name: string
          summary: Json
        }
        Update: {
          book_id?: string
          config_version?: number
          created_at?: string
          expires_at?: string
          google_token?: string
          id?: string
          liquidation_id?: string
          operation_id?: string
          requests?: Json
          reviewer_id?: string
          revision?: number
          sheet_id?: number
          sheet_name?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sheet_previews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "sheet_workbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_previews_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_previews_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["liquidation_id"]
          },
          {
            foreignKeyName: "sheet_previews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_rollovers: {
        Row: {
          book_id: string | null
          created_at: string
          error: string | null
          id: string
          operation_id: string
          replenishment_id: string
          report: Json | null
          requests: Json | null
          status: string
          target_name: string | null
          target_sheet_id: number | null
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          operation_id: string
          replenishment_id: string
          report?: Json | null
          requests?: Json | null
          status?: string
          target_name?: string | null
          target_sheet_id?: number | null
        }
        Update: {
          book_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          operation_id?: string
          replenishment_id?: string
          report?: Json | null
          requests?: Json | null
          status?: string
          target_name?: string | null
          target_sheet_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sheet_rollovers_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "sheet_workbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_rollovers_replenishment_id_fkey"
            columns: ["replenishment_id"]
            isOneToOne: true
            referencedRelation: "replenishments"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_workbooks: {
        Row: {
          active_sheet_id: number | null
          audit_id: string
          catalog: Json
          config_version: number
          custodian_id: string | null
          enabled: boolean
          fund_id: string | null
          id: string
          last_synced_at: string | null
          name: string
          refresh_token: string | null
          refresh_until: string | null
          spreadsheet_id: string
          sync_error: string | null
        }
        Insert: {
          active_sheet_id?: number | null
          audit_id?: string
          catalog?: Json
          config_version?: number
          custodian_id?: string | null
          enabled?: boolean
          fund_id?: string | null
          id: string
          last_synced_at?: string | null
          name: string
          refresh_token?: string | null
          refresh_until?: string | null
          spreadsheet_id: string
          sync_error?: string | null
        }
        Update: {
          active_sheet_id?: number | null
          audit_id?: string
          catalog?: Json
          config_version?: number
          custodian_id?: string | null
          enabled?: boolean
          fund_id?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          refresh_token?: string | null
          refresh_until?: string | null
          spreadsheet_id?: string
          sync_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sheet_workbooks_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_workbooks_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "sheet_workbooks_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_items: {
        Row: {
          amount: number
          category_id: string
          id: string
          particulars: string
          position: number
          voucher_id: string
        }
        Insert: {
          amount: number
          category_id: string
          id?: string
          particulars: string
          position: number
          voucher_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          id?: string
          particulars?: string
          position?: number
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "replenishment_eligibility_v"
            referencedColumns: ["voucher_id"]
          },
          {
            foreignKeyName: "voucher_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          budget_request_id: string | null
          category_id: string
          created_at: string
          flow_version: number
          fund_id: string
          id: string
          no_receipt_reason: string | null
          number_order: number
          paper_drive_url: string | null
          paper_pcv_number: string | null
          paper_voucher_path: string | null
          particulars: string
          payee: string
          pcv_number: string
          prepared_by: string
          receipt_drive_url: string | null
          receipt_path: string | null
          reject_reason: string | null
          released_at: string | null
          replenishment_id: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          submitted_at: string | null
          updated_at: string
          void_reason: string | null
          voucher_date: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          budget_request_id?: string | null
          category_id: string
          created_at?: string
          flow_version?: number
          fund_id: string
          id?: string
          no_receipt_reason?: string | null
          number_order?: never
          paper_drive_url?: string | null
          paper_pcv_number?: string | null
          paper_voucher_path?: string | null
          particulars: string
          payee: string
          pcv_number: string
          prepared_by: string
          receipt_drive_url?: string | null
          receipt_path?: string | null
          reject_reason?: string | null
          released_at?: string | null
          replenishment_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          submitted_at?: string | null
          updated_at?: string
          void_reason?: string | null
          voucher_date?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          budget_request_id?: string | null
          category_id?: string
          created_at?: string
          flow_version?: number
          fund_id?: string
          id?: string
          no_receipt_reason?: string | null
          number_order?: never
          paper_drive_url?: string | null
          paper_pcv_number?: string | null
          paper_voucher_path?: string | null
          particulars?: string
          payee?: string
          pcv_number?: string
          prepared_by?: string
          receipt_drive_url?: string | null
          receipt_path?: string | null
          reject_reason?: string | null
          released_at?: string | null
          replenishment_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          submitted_at?: string | null
          updated_at?: string
          void_reason?: string | null
          voucher_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_budget_request_id_fkey"
            columns: ["budget_request_id"]
            isOneToOne: true
            referencedRelation: "budget_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_replenishment_id_fkey"
            columns: ["replenishment_id"]
            isOneToOne: false
            referencedRelation: "replenishments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      fund_balance_v: {
        Row: {
          advances_pending_liquidation: number | null
          expected_cash: number | null
          fund_amount: number | null
          fund_id: string | null
          is_low: boolean | null
          name: string | null
          reimbursements_due: number | null
          released_vouchers_total: number | null
          returns_due: number | null
        }
        Relationships: []
      }
      replenishment_eligibility_v: {
        Row: {
          advance_amount: number | null
          eligible: boolean | null
          exclusion_reason: string | null
          fund_id: string | null
          liquidation_id: string | null
          liquidation_status: string | null
          payee: string | null
          pcv_number: string | null
          replenishment_id: string | null
          total_spent: number | null
          voucher_id: string | null
          voucher_status: Database["public"]["Enums"]["voucher_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balance_v"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "vouchers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_replenishment_id_fkey"
            columns: ["replenishment_id"]
            isOneToOne: false
            referencedRelation: "replenishments"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_expense_reporting_v: {
        Row: {
          active_tab: boolean | null
          address: string | null
          amount: number | null
          book_id: string | null
          category: string | null
          company: string | null
          copy_rank: number | null
          custodian_id: string | null
          custodian_name: string | null
          expense_date: string | null
          match_key: string | null
          occurrence: number | null
          particulars: string | null
          person: string | null
          plate: string | null
          receipt_number: string | null
          sheet_id: number | null
          sheet_name: string | null
          source_row: number | null
          spreadsheet_id: string | null
          supplier: string | null
          tab_order: number | null
          tin: string | null
          voucher: string | null
          workbook_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sheet_expenses_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "sheet_workbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_workbooks_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accounting_dashboard: {
        Args: { p_export?: boolean; p_filters: Json }
        Returns: Json
      }
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      approve_liquidation_reimbursement: {
        Args: { p_id: string }
        Returns: undefined
      }
      approve_liquidation_with_sheet: {
        Args: { p_preview: string }
        Returns: string
      }
      approve_liquidation_with_sheet_legacy: {
        Args: { p_preview: string }
        Returns: string
      }
      approve_replenishment: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      approve_voucher: { Args: { p_id: string }; Returns: undefined }
      assign_custodian_funds: {
        Args: { p_fund_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      can_access_fund: { Args: { p_fund_id: string }; Returns: boolean }
      can_edit_liquidation: { Args: { p_id: string }; Returns: boolean }
      can_read_liquidation: { Args: { p_id: string }; Returns: boolean }
      cancel_budget_request: { Args: { p_id: string }; Returns: undefined }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_sheet_refresh: { Args: { p_id: string }; Returns: string }
      clean_paper_pcv: {
        Args: { p_exclude?: string; p_fund_id: string; p_value: string }
        Returns: string
      }
      close_replenishment: { Args: { p_id: string }; Returns: undefined }
      close_replenishment_before_approver: {
        Args: { p_id: string }
        Returns: undefined
      }
      configure_sheet_workbook: {
        Args: {
          p_custodian: string
          p_enabled: boolean
          p_fund: string
          p_id: string
          p_sheet: number
        }
        Returns: undefined
      }
      create_budget_request: {
        Args: {
          p_amount: number
          p_fund_id: string
          p_name: string
          p_purpose: string
        }
        Returns: string
      }
      create_liquidation: { Args: { p_voucher_id: string }; Returns: string }
      create_liquidation_legacy: {
        Args: { p_voucher_id: string }
        Returns: string
      }
      create_replenishment: { Args: { p_fund_id: string }; Returns: string }
      create_voucher: {
        Args: {
          p_amount: number
          p_category_id: string
          p_fund_id: string
          p_no_receipt_reason?: string
          p_particulars: string
          p_payee: string
          p_receipt_path?: string
          p_voucher_date?: string
        }
        Returns: string
      }
      create_voucher_from_request: {
        Args: {
          p_items: Json
          p_no_receipt_reason?: string
          p_request_id: string
          p_voucher_date?: string
        }
        Returns: string
      }
      create_voucher_lines: {
        Args: {
          p_fund_id: string
          p_items: Json
          p_no_receipt_reason?: string
          p_paper_pcv?: string
          p_payee: string
          p_receipt_path?: string
          p_voucher_date?: string
        }
        Returns: string
      }
      execute_data_deletion: {
        Args: { p_confirmation: string; p_id: string }
        Returns: undefined
      }
      liquidation_context: {
        Args: { p_voucher_id: string }
        Returns: {
          amount_received: number
          approval_threshold: number
          employee_name: string
          fund_id: string
          fund_name: string
          liquidation_id: string
          owner_id: string
          pcv_number: string
          per_txn_limit: number
          prepared_by: string
          released_at: string
          voucher_id: string
          voucher_status: Database["public"]["Enums"]["voucher_status"]
        }[]
      }
      list_custodian_tags: { Args: { p_fund: string }; Returns: string[] }
      list_request_funds: {
        Args: never
        Returns: {
          custodian_names: string[]
          id: string
          name: string
        }[]
      }
      next_pcv_number: { Args: { p_fund_id: string }; Returns: string }
      notification_recipients: {
        Args: {
          p_exclude?: string[]
          p_include?: string[]
          p_roles: Database["public"]["Enums"]["user_role"][]
        }
        Returns: {
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      pending_expense_category: { Args: never; Returns: string }
      plan_data_deletion: { Args: { p: Json }; Returns: Json }
      prepare_data_deletion: { Args: { p: Json }; Returns: Json }
      record_cash_count: {
        Args: { p_counted: number; p_fund_id: string; p_note?: string }
        Returns: string
      }
      record_liquidation_settlement: {
        Args: { p_amount: number; p_id: string; p_note?: string }
        Returns: undefined
      }
      reject_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      release_voucher: { Args: { p_id: string }; Returns: undefined }
      replace_sheet_mirror: {
        Args: { p_catalog: Json; p_id: string; p_rows: Json; p_token: string }
        Returns: undefined
      }
      replenishment_fund_options: {
        Args: never
        Returns: {
          fund_id: string
          fund_name: string
          total: number
          voucher_count: number
        }[]
      }
      request_voucher_summary: {
        Args: { p_request_id: string }
        Returns: {
          amount: number
          id: string
          pcv_number: string
          released_at: string
          status: Database["public"]["Enums"]["voucher_status"]
        }[]
      }
      require_fund_access: { Args: { p_fund_id: string }; Returns: undefined }
      require_role: {
        Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      requires_pre_approval: {
        Args: { p_amount: number; p_fund_id: string }
        Returns: boolean
      }
      return_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      review_budget_request: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      review_liquidation: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      review_liquidation_before_sheets: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      review_replenishment: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      save_custodian_receipts: {
        Args: { p_id: string; p_lines: Json; p_revision: number }
        Returns: undefined
      }
      save_liquidation: {
        Args: {
          p_department: string
          p_filing_date: string
          p_id: string
          p_items: Json
          p_unspent_reason?: string
        }
        Returns: undefined
      }
      save_liquidation_before_sheets: {
        Args: {
          p_department: string
          p_filing_date: string
          p_id: string
          p_items: Json
          p_unspent_reason?: string
        }
        Returns: undefined
      }
      save_liquidation_legacy: {
        Args: {
          p_department: string
          p_filing_date: string
          p_id: string
          p_items: Json
          p_unspent_reason?: string
        }
        Returns: undefined
      }
      save_workflow_voucher: {
        Args: {
          p_date: string
          p_fund: string
          p_id: string
          p_items: Json
          p_number: string
          p_number_mode: string
          p_payee: string
          p_request: string
        }
        Returns: string
      }
      set_fund_custodians: {
        Args: { p_custodian_ids: string[]; p_fund_id: string }
        Returns: undefined
      }
      submit_liquidation: { Args: { p_id: string }; Returns: undefined }
      submit_liquidation_legacy: { Args: { p_id: string }; Returns: undefined }
      submit_replenishment: { Args: { p_id: string }; Returns: undefined }
      submit_voucher: { Args: { p_id: string }; Returns: undefined }
      suggest_voucher_number: { Args: { p_fund: string }; Returns: string }
      update_voucher_lines: {
        Args: {
          p_id: string
          p_items: Json
          p_paper_pcv?: string
          p_payee: string
          p_voucher_date?: string
        }
        Returns: undefined
      }
      validate_replenishment: { Args: { p_id: string }; Returns: undefined }
      void_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      replenishment_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "closed"
        | "accounting_approved"
      user_role: "admin" | "custodian" | "approver" | "accounting" | "requester"
      voucher_status:
        | "draft"
        | "submitted"
        | "approved"
        | "released"
        | "closed"
        | "rejected"
        | "void"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      replenishment_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "closed",
        "accounting_approved",
      ],
      user_role: ["admin", "custodian", "approver", "accounting", "requester"],
      voucher_status: [
        "draft",
        "submitted",
        "approved",
        "released",
        "closed",
        "rejected",
        "void",
      ],
    },
  },
} as const
