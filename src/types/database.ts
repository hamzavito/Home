// Databasetyper i supabase-js-format.
// Skrevet i hånden ud fra supabase/migrations, så projektet kan bygges uden
// et live Supabase-projekt. Når projektet er oprettet, kan filen erstattes med:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type HouseholdRole = 'owner' | 'member'

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
    }
    Views: { [_ in never]: never }
    Functions: {
      current_household_id: { Args: Record<PropertyKey, never>; Returns: string | null }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
