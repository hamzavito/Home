// Databasetyper i supabase-js-format.
// Skrevet i hånden ud fra supabase/migrations, så projektet kan bygges uden
// et live Supabase-projekt. Når projektet er oprettet, kan filen erstattes med:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type HouseholdRole = 'owner' | 'member'
export type PaidByKind = 'member' | 'shared'
export type TransactionSource = 'manual' | 'receipt' | 'upcoming'
export type BudgetSource = 'override' | 'default' | 'none'

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
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; name: string; icon?: string; color?: string; sort_order?: number }
        Update: { name?: string; icon?: string; color?: string; sort_order?: number; archived_at?: string | null }
        Relationships: []
      }
      budget_category_defaults: {
        Row: {
          id: string
          household_id: string
          category_id: string
          valid_from: string
          amount_ore: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; category_id: string; valid_from: string; amount_ore: number }
        Update: { amount_ore?: number }
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
    }
    Views: { [_ in never]: never }
    Functions: {
      current_household_id: { Args: Record<PropertyKey, never>; Returns: string | null }
      create_budget_category: {
        Args: { p_name: string; p_icon: string; p_color: string; p_default_amount_ore?: number | null; p_valid_from?: string | null }
        Returns: string
      }
      set_category_default: { Args: { p_category_id: string; p_valid_from: string; p_amount_ore: number }; Returns: undefined }
      set_monthly_budget: { Args: { p_category_id: string; p_month: string; p_amount_ore: number | null }; Returns: undefined }
      budget_month_summary: {
        Args: { p_month: string }
        Returns: Array<{
          category_id: string
          name: string
          icon: string
          color: string
          sort_order: number
          archived: boolean
          budget_ore: number
          budget_source: BudgetSource
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
