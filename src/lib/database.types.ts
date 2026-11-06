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
          fund_id: string
          fund_name: string
          id: string
          owner_id: string
          pcv_number: string
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
          fund_id: string
          fund_name: string
          id?: string
          owner_id: string
          pcv_number: string
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
          fund_id?: string
          fund_name?: string
          id?: string
          owner_id?: string
          pcv_number?: string
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
          created_at: string
          fund_id: string
          id: string
          request_no: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["replenishment_status"]
          total: number
        }
        Insert: {
          created_at?: string
          fund_id: string
          id?: string
          request_no: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["replenishment_status"]
          total?: number
        }
        Update: {
          created_at?: string
          fund_id?: string
          id?: string
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
          fund_id: string
          id: string
          no_receipt_reason: string | null
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
          fund_id: string
          id?: string
          no_receipt_reason?: string | null
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
          fund_id?: string
          id?: string
          no_receipt_reason?: string | null
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
    }
    Functions: {
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      approve_liquidation_reimbursement: {
        Args: { p_id: string }
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
      clean_paper_pcv: {
        Args: { p_exclude?: string; p_fund_id: string; p_value: string }
        Returns: string
      }
      close_replenishment: { Args: { p_id: string }; Returns: undefined }
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
      review_replenishment: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
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
      set_fund_custodians: {
        Args: { p_custodian_ids: string[]; p_fund_id: string }
        Returns: undefined
      }
      submit_liquidation: { Args: { p_id: string }; Returns: undefined }
      submit_replenishment: { Args: { p_id: string }; Returns: undefined }
      submit_voucher: { Args: { p_id: string }; Returns: undefined }
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
