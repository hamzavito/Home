// Databasetyper i supabase-js-format.
// Skrevet i hånden ud fra supabase/migrations, så projektet kan bygges uden
// et live Supabase-projekt. Når projektet er oprettet, kan filen erstattes med:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type HouseholdRole = 'owner' | 'member'
export type PaidByKind = 'member' | 'shared'
export type TransactionSource = 'manual' | 'receipt' | 'upcoming'
export type BudgetSource = 'override' | 'default' | 'none'
export type BudgetMode = 'amount' | 'percent'
export type CategoryKind = 'spending' | 'reserve'
export type FixedKind = 'income' | 'expense'
export type Frequency = 'monthly' | 'quarterly' | 'yearly'
export type ReceiptStatus = 'pending' | 'approved'
export type ReceiptRetention = '30d' | '3m' | '6m' | '1y' | 'custom' | 'permanent'

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; created_at?: string; updated_at?: string }
        Update: { name?: string }
        Relationships: []
      }
      profiles: {
        Row: { id: string; display_name: string; color: string | null; created_at: string; updated_at: string }
        Insert: { id: string; display_name: string; color?: string | null }
        Update: { display_name?: string; color?: string | null }
        Relationships: []
      }
      household_members: {
        Row: { household_id: string; user_id: string; role: HouseholdRole; created_at: string }
        Insert: { household_id: string; user_id: string; role?: HouseholdRole }
        Update: { role?: HouseholdRole }
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      budget_categories: {
        Row: {
          id: string
          household_id: string
          name: string
          icon: string
          color: string
          sort_order: number
          kind: CategoryKind
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; name: string; icon?: string; color?: string; sort_order?: number }
        Update: { name?: string; icon?: string; color?: string; sort_order?: number; archived_at?: string | null; kind?: CategoryKind }
        Relationships: []
      }
      budget_category_defaults: {
        Row: {
          id: string
          household_id: string
          category_id: string
          valid_from: string
          mode: BudgetMode
          amount_ore: number | null
          percent_bp: number | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; category_id: string; valid_from: string; amount_ore?: number | null; mode?: BudgetMode; percent_bp?: number | null }
        Update: { amount_ore?: number | null; mode?: BudgetMode; percent_bp?: number | null }
        Relationships: []
      }
      monthly_budgets: {
        Row: {
          id: string
          household_id: string
          category_id: string
          month: string
          amount_ore: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; category_id: string; month: string; amount_ore: number }
        Update: { amount_ore?: number }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          household_id: string
          category_id: string
          amount_ore: number
          occurred_on: string
          description: string
          note: string | null
          paid_by_kind: PaidByKind
          paid_by_user_id: string | null
          source: TransactionSource
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          category_id: string
          amount_ore: number
          occurred_on: string
          description: string
          note?: string | null
          paid_by_kind?: PaidByKind
          paid_by_user_id?: string | null
          source?: TransactionSource
        }
        Update: {
          category_id?: string
          amount_ore?: number
          occurred_on?: string
          description?: string
          note?: string | null
          paid_by_kind?: PaidByKind
          paid_by_user_id?: string | null
        }
        Relationships: []
      }
      fixed_groups: {
        Row: {
          id: string
          household_id: string
          name: string
          sort_order: number
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; name: string; sort_order?: number }
        Update: { name?: string; sort_order?: number; archived_at?: string | null }
        Relationships: []
      }
      fixed_items: {
        Row: {
          id: string
          household_id: string
          kind: FixedKind
          name: string
          group_id: string | null
          owner_kind: PaidByKind | null
          owner_user_id: string | null
          payment_day: number | null
          note: string | null
          sort_order: number
          start_month: string
          end_month: string | null
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          name?: string
          group_id?: string | null
          owner_kind?: PaidByKind | null
          owner_user_id?: string | null
          payment_day?: number | null
          note?: string | null
          sort_order?: number
          end_month?: string | null
          archived_at?: string | null
        }
        Relationships: []
      }
      fixed_item_versions: {
        Row: {
          id: string
          household_id: string
          item_id: string
          valid_from: string
          amount_ore: number
          frequency: Frequency
          due_month: number | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      receipts: {
        Row: {
          id: string
          household_id: string
          status: ReceiptStatus
          storage_path: string | null
          transaction_id: string | null
          retention: ReceiptRetention | null
          delete_at: string | null
          image_deleted_at: string | null
          uploaded_by: string
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      current_household_id: { Args: Record<PropertyKey, never>; Returns: string | null }
      create_budget_category: {
        Args: {
          p_name: string
          p_icon: string
          p_color: string
          p_default_amount_ore?: number | null
          p_valid_from?: string | null
          p_kind?: CategoryKind
          p_mode?: BudgetMode
          p_percent_bp?: number | null
        }
        Returns: string
      }
      set_category_default: {
        Args: { p_category_id: string; p_valid_from: string; p_amount_ore: number | null; p_mode?: BudgetMode; p_percent_bp?: number | null }
        Returns: undefined
      }
      create_fixed_item: {
        Args: {
          p_kind: FixedKind
          p_name: string
          p_amount_ore: number
          p_frequency?: Frequency
          p_due_month?: number | null
          p_group_id?: string | null
          p_owner_kind?: PaidByKind | null
          p_owner_user_id?: string | null
          p_payment_day?: number | null
          p_note?: string | null
          p_start_month?: string | null
        }
        Returns: string
      }
      set_fixed_item_amount: {
        Args: { p_item_id: string; p_valid_from: string; p_amount_ore: number; p_frequency?: Frequency; p_due_month?: number | null }
        Returns: undefined
      }
      create_default_fixed_groups: { Args: Record<PropertyKey, never>; Returns: undefined }
      fixed_items_month: {
        Args: { p_month: string }
        Returns: Array<{
          item_id: string
          kind: FixedKind
          name: string
          group_id: string | null
          owner_kind: PaidByKind | null
          owner_user_id: string | null
          payment_day: number | null
          frequency: Frequency
          due_month: number | null
          amount_ore: number
          monthly_ore: number
          due_this_month: boolean
          version_from: string
        }>
      }
      month_plan: {
        Args: { p_month: string }
        Returns: Array<{
          income_ore: number
          fixed_expenses_ore: number
          available_ore: number
          fixed_allocations_ore: number
          distributable_ore: number
          percent_total_bp: number
          allocated_ore: number
          unallocated_ore: number
        }>
      }
      set_monthly_budget: { Args: { p_category_id: string; p_month: string; p_amount_ore: number | null }; Returns: undefined }
      create_pending_receipt: { Args: Record<PropertyKey, never>; Returns: Array<{ receipt_id: string; storage_path: string }> }
      approve_receipt: {
        Args: {
          p_receipt_id: string
          p_category_id: string
          p_amount_ore: number
          p_occurred_on: string
          p_description: string
          p_note: string | null
          p_paid_by_kind: PaidByKind
          p_paid_by_user_id: string | null
          p_retention: ReceiptRetention
          p_custom_date?: string | null
        }
        Returns: string
      }
      set_receipt_retention: { Args: { p_receipt_id: string; p_retention: ReceiptRetention; p_custom_date?: string | null }; Returns: string | null }
      delete_transaction: { Args: { p_transaction_id: string }; Returns: string | null }
      suggest_category: { Args: { p_merchant: string }; Returns: string | null }
      budget_month_summary: {
        Args: { p_month: string }
        Returns: Array<{
          category_id: string
          name: string
          icon: string
          color: string
          sort_order: number
          archived: boolean
          kind: CategoryKind
          budget_ore: number
          budget_source: BudgetSource
          budget_mode: BudgetMode | 'none'
          percent_bp: number | null
          default_ore: number
          spent_ore: number
          transaction_count: number
        }>
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
