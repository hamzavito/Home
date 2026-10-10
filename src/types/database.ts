// Databasetyper i supabase-js-format.
// Skrevet i hånden ud fra supabase/migrations, så projektet kan bygges uden
// et live Supabase-projekt. Når projektet er oprettet, kan filen erstattes med:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** 'member' er den gamle betegnelse for voksen */
export type HouseholdRole = 'owner' | 'adult' | 'child' | 'member'
export type PaidByKind = 'member' | 'shared'
export type TransactionSource = 'manual' | 'receipt' | 'upcoming' | 'bank'
export type BudgetSource = 'override' | 'default' | 'none'
export type BudgetMode = 'amount' | 'percent'
export type CategoryKind = 'spending' | 'reserve'
export type FixedKind = 'income' | 'expense'
export type Frequency = 'monthly' | 'quarterly' | 'yearly'
export type UpcomingStatus = 'upcoming' | 'paid' | 'cancelled'
export type MovementKind = 'deposit' | 'withdrawal'
export type DefaultRetention = '30d' | '3m' | '6m' | '1y' | 'permanent'
export type DefaultPaidBy = 'me' | 'shared'
export type TaskStatus = 'open' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high'
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export type EventType = 'family' | 'work' | 'doctor' | 'vacation' | 'kids' | 'other'
export type ReceiptStatus = 'pending' | 'approved'
export type ReceiptRetention = '30d' | '3m' | '6m' | '1y' | 'custom' | 'permanent'
export type MealType = 'breakfast' | 'lunch' | 'dinner'
export type ShoppingSource = 'manual' | 'meal_plan'
export type RewardStatus = 'none' | 'awaiting_completion' | 'awaiting_approval' | 'paid' | 'rejected'
export type AllowanceFrequency = 'weekly' | 'monthly'
export type WalletKind = 'allowance' | 'deposit' | 'deduction' | 'purchase' | 'to_goal' | 'from_goal'
export type RecipeInputJson = {
  name: string
  description: string | null
  servings: number
  prep_minutes: number | null
  steps: string | null
  category: string | null
  tags: string[]
  is_favorite: boolean
  note: string | null
}
export type IngredientInputJson = { name: string; amount_milli: number | null; unit: string | null; note: string | null }

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; default_receipt_retention: DefaultRetention; grocery_category_id: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; created_at?: string; updated_at?: string }
        Update: { name?: string; default_receipt_retention?: DefaultRetention; grocery_category_id?: string | null }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string
          color: string | null
          default_paid_by: DefaultPaidBy
          notify_calendar: boolean
          notify_shopping: boolean
          created_at: string
          updated_at: string
        }
        Insert: { id: string; display_name: string; color?: string | null }
        Update: { display_name?: string; color?: string | null; default_paid_by?: DefaultPaidBy; notify_calendar?: boolean; notify_shopping?: boolean }
        Relationships: []
      }
      household_members: {
        Row: { household_id: string; user_id: string; role: HouseholdRole; created_at: string; child_username: string | null; disabled_at: string | null; left_at: string | null; no_login: boolean; wallet_enabled: boolean }
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
            isOneToOne: false
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
      income_entries: {
        Row: {
          id: string
          household_id: string
          amount_ore: number
          received_on: string
          description: string
          note: string | null
          received_by_kind: PaidByKind
          received_by_user_id: string | null
          source: 'manual' | 'bank'
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          amount_ore: number
          received_on: string
          description: string
          note?: string | null
          received_by_kind?: PaidByKind
          received_by_user_id?: string | null
        }
        Update: {
          amount_ore?: number
          received_on?: string
          description?: string
          note?: string | null
          received_by_kind?: PaidByKind
          received_by_user_id?: string | null
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          id: string
          household_id: string
          user_id: string
          account_id: string
          external_id: string
          booked_on: string
          amount_ore: number
          description: string
          counterparty: string | null
          state: 'new' | 'imported' | 'ignored' | 'transfer' | 'fixed'
          fixed_item_id: string | null
          suggested_category_id: string | null
          possible_duplicate_id: string | null
          transaction_id: string | null
          income_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
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
      upcoming_expenses: {
        Row: {
          id: string
          household_id: string
          title: string
          amount_ore: number
          due_on: string
          category_id: string
          note: string | null
          status: UpcomingStatus
          paid_at: string | null
          transaction_id: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; title: string; amount_ore: number; due_on: string; category_id: string; note?: string | null }
        Update: { title?: string; amount_ore?: number; due_on?: string; category_id?: string; note?: string | null }
        Relationships: []
      }
      savings_goals: {
        Row: {
          id: string
          household_id: string
          name: string
          target_ore: number
          target_date: string | null
          note: string | null
          color: string
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; name: string; target_ore: number; target_date?: string | null; note?: string | null; color?: string }
        Update: { name?: string; target_ore?: number; target_date?: string | null; note?: string | null; color?: string; archived_at?: string | null }
        Relationships: []
      }
      savings_movements: {
        Row: {
          id: string
          household_id: string
          goal_id: string
          kind: MovementKind
          amount_ore: number
          occurred_on: string
          note: string | null
          created_by: string
          created_at: string
        }
        Insert: { household_id: string; goal_id: string; kind: MovementKind; amount_ore: number; occurred_on?: string; note?: string | null }
        Update: { kind?: MovementKind; amount_ore?: number; occurred_on?: string; note?: string | null }
        Relationships: []
      }
      shopping_lists: {
        Row: { id: string; household_id: string; name: string; sort_order: number; archived_at: string | null; created_at: string; updated_at: string }
        Insert: { household_id: string; name: string; sort_order?: number }
        Update: { name?: string; sort_order?: number; archived_at?: string | null }
        Relationships: []
      }
      shopping_items: {
        Row: {
          id: string
          household_id: string
          list_id: string
          name: string
          quantity: string | null
          note: string | null
          is_checked: boolean
          checked_by: string | null
          checked_at: string | null
          added_by: string
          sort_order: number
          /** 'meal_plan' = sendt fra ugeplanen */
          source: ShoppingSource
          source_key: string | null
          meal_week: string | null
          created_at: string
          updated_at: string
        }
        Insert: { household_id: string; list_id: string; name: string; quantity?: string | null; note?: string | null; is_checked?: boolean; sort_order?: number }
        Update: { name?: string; quantity?: string | null; note?: string | null; is_checked?: boolean; sort_order?: number }
        Relationships: []
      }
      recipes: {
        Row: {
          id: string
          household_id: string
          name: string
          description: string | null
          servings: number
          prep_minutes: number | null
          steps: string | null
          category: string | null
          tags: string[]
          is_favorite: boolean
          note: string | null
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { is_favorite?: boolean; archived_at?: string | null }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          id: string
          household_id: string
          recipe_id: string
          sort_order: number
          name: string
          /** Mængde ×1000 (0,5 → 500) */
          amount_milli: number | null
          unit: string | null
          note: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      meal_plan_entries: {
        Row: {
          id: string
          household_id: string
          plan_date: string
          meal: MealType
          recipe_id: string | null
          title: string
          servings: number | null
          note: string | null
          sort_order: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          plan_date: string
          meal?: MealType
          recipe_id?: string | null
          title: string
          servings?: number | null
          note?: string | null
          sort_order?: number
        }
        Update: { plan_date?: string; meal?: MealType; recipe_id?: string | null; title?: string; servings?: number | null; note?: string | null; sort_order?: number }
        Relationships: []
      }
      ingredient_prices: {
        Row: {
          id: string
          household_id: string
          name: string
          price_ore: number
          amount_milli: number | null
          unit: string | null
          store: string | null
          observed_on: string
          receipt_id: string | null
          created_by: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      household_tasks: {
        Row: {
          id: string
          household_id: string
          title: string
          description: string | null
          assignee_id: string | null
          due_on: string | null
          priority: TaskPriority
          status: TaskStatus
          recurrence: Recurrence
          recurrence_interval: number
          series_id: string
          previous_task_id: string | null
          completed_at: string | null
          completed_by: string | null
          archived_at: string | null
          /** Frivillig belønning (øre) til et barn – udbetales når en forælder godkender */
          reward_ore: number | null
          /** Styres af databasen */
          reward_status: RewardStatus
          reward_decided_at: string | null
          reward_decided_by: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          title: string
          description?: string | null
          assignee_id?: string | null
          reward_ore?: number | null
          due_on?: string | null
          priority?: TaskPriority
          recurrence?: Recurrence
          recurrence_interval?: number
        }
        Update: {
          title?: string
          description?: string | null
          assignee_id?: string | null
          reward_ore?: number | null
          due_on?: string | null
          priority?: TaskPriority
          recurrence?: Recurrence
          recurrence_interval?: number
          archived_at?: string | null
        }
        Relationships: []
      }
      child_savings_goals: {
        Row: {
          id: string
          household_id: string
          child_id: string
          name: string
          target_ore: number
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      child_allowance_schedules: {
        Row: {
          id: string
          household_id: string
          child_id: string
          amount_ore: number
          frequency: AllowanceFrequency
          /** ISO-ugedag 1 = mandag … 7 = søndag */
          weekday: number | null
          /** 1–31, 0 = sidste dag i måneden */
          month_day: number | null
          start_on: string
          end_on: string | null
          pay_from: string
          paused_at: string | null
          stopped_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      child_allowance_payouts: {
        Row: { schedule_id: string; household_id: string; period_key: string; due_on: string; amount_ore: number; tx_id: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      child_wallet_transactions: {
        Row: {
          id: string
          household_id: string
          child_id: string
          kind: WalletKind
          amount_ore: number
          note: string | null
          goal_id: string | null
          task_id: string | null
          occurred_on: string
          voided_at: string | null
          voided_by: string | null
          created_by: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      calendar_events: {
        Row: {
          id: string
          household_id: string
          title: string
          event_date: string
          end_date: string | null
          start_time: string | null
          end_time: string | null
          all_day: boolean
          description: string | null
          type: EventType
          for_user_id: string | null
          /** Hvem aftalen gælder for. Tom = hele familien */
          participant_ids: string[]
          /** Minutter før start (heldag: fra midnat). NULL = ingen påmindelse */
          reminder_minutes: number | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          household_id: string
          title: string
          event_date: string
          end_date?: string | null
          start_time?: string | null
          end_time?: string | null
          all_day?: boolean
          description?: string | null
          type?: EventType
          for_user_id?: string | null
          participant_ids?: string[]
          reminder_minutes?: number | null
        }
        Update: {
          title?: string
          event_date?: string
          end_date?: string | null
          start_time?: string | null
          end_time?: string | null
          all_day?: boolean
          description?: string | null
          type?: EventType
          for_user_id?: string | null
          participant_ids?: string[]
          reminder_minutes?: number | null
        }
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
      set_upcoming_status: {
        Args: {
          p_id: string
          p_status: UpcomingStatus
          p_register?: boolean
          p_amount_ore?: number | null
          p_paid_on?: string | null
          p_paid_by_kind?: PaidByKind
          p_paid_by_user_id?: string | null
        }
        Returns: string | null
      }
      undo_upcoming_payment: { Args: { p_id: string }; Returns: undefined }
      ensure_shopping_list: { Args: Record<PropertyKey, never>; Returns: string }
      export_household_data: { Args: Record<PropertyKey, never>; Returns: Record<string, unknown> }
      set_task_status: { Args: { p_task_id: string; p_status: TaskStatus }; Returns: string | null }
      child_wallet_add: {
        Args: { p_child: string; p_kind: WalletKind; p_amount_ore: number; p_note?: string | null; p_goal?: string | null; p_occurred_on?: string | null }
        Returns: string
      }
      child_wallet_void: { Args: { p_tx: string }; Returns: undefined }
      child_goal_create: { Args: { p_child: string; p_name: string; p_target_ore: number }; Returns: string }
      child_goal_update: { Args: { p_goal: string; p_name: string | null; p_target_ore: number | null; p_archive?: boolean }; Returns: undefined }
      set_member_role: { Args: { p_user: string; p_role: 'owner' | 'adult' | 'child' }; Returns: undefined }
      household_login_code: { Args: Record<string, never>; Returns: string }
      child_set_pin: { Args: { p_child: string; p_pin: string; p_pin_length: number }; Returns: undefined }
      child_set_username: { Args: { p_child: string; p_username: string }; Returns: undefined }
      child_pin: { Args: { p_child: string }; Returns: string | null }
      child_reward_decide: { Args: { p_task: string; p_approve: boolean }; Returns: string | null }
      child_allowance_create: {
        Args: { p_child: string; p_amount_ore: number; p_frequency: AllowanceFrequency; p_weekday: number | null; p_month_day: number | null; p_start_on: string; p_end_on?: string | null }
        Returns: string
      }
      child_allowance_update: { Args: { p_schedule: string; p_amount_ore: number | null; p_end_on?: string | null; p_clear_end?: boolean }; Returns: undefined }
      child_allowance_set_state: { Args: { p_schedule: string; p_action: 'pause' | 'resume' | 'stop' }; Returns: undefined }
      child_allowance_next: { Args: { p_schedule: string }; Returns: string | null }
      save_recipe: { Args: { p_id: string | null; p_recipe: RecipeInputJson; p_ingredients: IngredientInputJson[] }; Returns: string }
      copy_meal_week: { Args: { p_from: string; p_to: string }; Returns: number }
      add_meal_ingredients_to_shopping: { Args: { p_week: string; p_items: Array<{ key: string; name: string; quantity: string }> }; Returns: number }
      push_public_key: { Args: Record<PropertyKey, never>; Returns: string | null }
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string }; Returns: undefined }
      disable_push_subscription: { Args: { p_endpoint: string }; Returns: undefined }
      send_test_notification: { Args: Record<PropertyKey, never>; Returns: boolean }
      savings_goal_progress: {
        Args: Record<PropertyKey, never>
        Returns: Array<{ goal_id: string; current_ore: number; movement_count: number; last_movement_on: string | null }>
      }
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
      attach_receipt: { Args: { p_receipt_id: string; p_transaction_id: string; p_retention: ReceiptRetention; p_custom_date?: string | null }; Returns: string | null }
      remove_receipt_image: { Args: { p_receipt_id: string }; Returns: string | null }
      household_create: { Args: { p_name: string; p_display_name?: string | null }; Returns: string }
      invite_create: { Args: Record<string, never>; Returns: Array<{ invite_id: string; code: string; expires_at: string }> }
      invite_list: { Args: Record<string, never>; Returns: Array<{ invite_id: string; created_by: string; created_at: string; expires_at: string }> }
      invite_revoke: { Args: { p_invite_id: string }; Returns: undefined }
      invite_preview: { Args: { p_code: string }; Returns: Array<{ household_name: string; invited_by: string; expires_at: string }> }
      invite_accept: { Args: { p_code: string; p_display_name?: string | null }; Returns: string | null }
      household_leave: { Args: Record<string, never>; Returns: undefined }
      household_remove_member: { Args: { p_user: string }; Returns: undefined }
      subscription_info: { Args: Record<string, never>; Returns: Json }
      bank_connection_list: {
        Args: Record<string, never>
        Returns: Array<{ id: string; aspsp_name: string; status: 'active' | 'expired'; valid_until: string | null; last_synced_at: string | null; last_error: string | null; accounts: string[] }>
      }
      child_set_wallet: { Args: { p_child: string; p_enabled: boolean }; Returns: undefined }
      bank_pending_list: {
        Args: Record<string, never>
        Returns: Array<{ account_name: string; booked_on: string; amount_ore: number; description: string; counterparty: string | null }>
      }
      bank_import: { Args: { p_id: string; p_category_id?: string | null; p_description?: string | null }; Returns: string }
      bank_link_existing: { Args: { p_id: string; p_transaction_id: string }; Returns: undefined }
      bank_set_ignored: { Args: { p_id: string; p_ignored: boolean }; Returns: undefined }
      bank_ignore_all: { Args: Record<string, never>; Returns: number }
      bank_import_suggested: { Args: Record<string, never>; Returns: number }
      bank_rules_list: { Args: Record<string, never>; Returns: Array<{ id: string; label: string; category_id: string; updated_at: string }> }
      bank_rule_disable: { Args: { p_id: string }; Returns: undefined }
      bank_rules: {
        Args: Record<string, never>
        Returns: Array<{ id: string; label: string; kind: 'category' | 'fixed'; category_id: string | null; fixed_item_id: string | null; updated_at: string }>
      }
      bank_mark_fixed: { Args: { p_id: string; p_item_id?: string | null; p_name?: string | null; p_group_id?: string | null; p_frequency?: Frequency }; Returns: string }
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
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
