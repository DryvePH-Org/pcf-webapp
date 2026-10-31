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
      funds: {
        Row: {
          amount: number
          created_at: string
          custodian_id: string | null
          id: string
          is_active: boolean
          low_balance_pct: number
          name: string
          per_txn_limit: number
        }
        Insert: {
          amount: number
          created_at?: string
          custodian_id?: string | null
          id?: string
          is_active?: boolean
          low_balance_pct?: number
          name: string
          per_txn_limit: number
        }
        Update: {
          amount?: number
          created_at?: string
          custodian_id?: string | null
          id?: string
          is_active?: boolean
          low_balance_pct?: number
          name?: string
          per_txn_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "funds_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      vouchers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_id: string
          created_at: string
          fund_id: string
          id: string
          no_receipt_reason: string | null
          particulars: string
          payee: string
          pcv_number: string
          prepared_by: string
          receipt_path: string | null
          reject_reason: string | null
          released_at: string | null
          replenishment_id: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          updated_at: string
          void_reason: string | null
          voucher_date: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category_id: string
          created_at?: string
          fund_id: string
          id?: string
          no_receipt_reason?: string | null
          particulars: string
          payee: string
          pcv_number: string
          prepared_by: string
          receipt_path?: string | null
          reject_reason?: string | null
          released_at?: string | null
          replenishment_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          void_reason?: string | null
          voucher_date?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string
          created_at?: string
          fund_id?: string
          id?: string
          no_receipt_reason?: string | null
          particulars?: string
          payee?: string
          pcv_number?: string
          prepared_by?: string
          receipt_path?: string | null
          reject_reason?: string | null
          released_at?: string | null
          replenishment_id?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
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
          expected_cash: number | null
          fund_amount: number | null
          fund_id: string | null
          is_low: boolean | null
          name: string | null
          released_vouchers_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      approve_voucher: { Args: { p_id: string }; Returns: undefined }
      close_replenishment: { Args: { p_id: string }; Returns: undefined }
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
      next_pcv_number: { Args: { p_fund_id: string }; Returns: string }
      record_cash_count: {
        Args: { p_counted: number; p_fund_id: string; p_note?: string }
        Returns: string
      }
      reject_voucher: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      release_voucher: { Args: { p_id: string }; Returns: undefined }
      require_role: {
        Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      review_replenishment: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      submit_replenishment: { Args: { p_id: string }; Returns: undefined }
      submit_voucher: { Args: { p_id: string }; Returns: undefined }
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
      user_role: "admin" | "custodian" | "approver" | "accounting"
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
      user_role: ["admin", "custodian", "approver", "accounting"],
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
