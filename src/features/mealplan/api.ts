import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { householdQueryKey, useHousehold } from '@/features/household/HouseholdProvider'
import { useAuth } from '@/features/auth/AuthProvider'
import { addDaysIso } from '@/lib/home'
import { mergeIngredients, scaleMilli, type MergedIngredient } from '@/lib/recipes'
import { supabase } from '@/lib/supabase'
import type { IngredientInputJson, RecipeInputJson, Tables } from '@/types/database'
import { isReadOnlyError, READ_ONLY_MESSAGE } from '@/lib/billing'

export type Recipe = Tables<'recipes'>
export type Ingredient = Tables<'recipe_ingredients'>
export type MealEntry = Tables<'meal_plan_entries'>
export type RecipeWithIngredients = Recipe & { ingredients: Ingredient[] }

// Under 'home', så ændringer i Hjemmet (fx indkøbslisten) også opdaterer madplanen
const keys = {
  all: (hid: string) => ['home', hid, 'mealplan'] as const,
  recipes: (hid: string) => ['home', hid, 'mealplan', 'recipes'] as const,
  recipe: (hid: string, id: string) => ['home', hid, 'mealplan', 'recipe', id] as const,
  week: (hid: string, monday: string) => ['home', hid, 'mealplan', 'week', monday] as const,
  history: (hid: string) => ['home', hid, 'mealplan', 'history'] as const,
  weekIngredients: (hid: string, monday: string) => ['home', hid, 'mealplan', 'ingredients', monday] as const,
}

function useInvalidate() {
  const { id: hid } = useHousehold()
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.all(hid) })
}

export function mealErrorMessage(e: unknown): string {
  if (isReadOnlyError(e)) return READ_ONLY_MESSAGE
  const msg = (e as { message?: string } | null)?.message ?? ''
  if (/fetch|network/i.test(msg)) return 'Ingen forbindelse. Prøv igen.'
  if (msg.includes('findes ikke')) return 'Den findes ikke længere. Den kan være ændret på den anden telefon.'
  if (/check|violates/i.test(msg)) return 'Noget i opskriften er ugyldigt. Tjek felterne.'
  return 'Noget gik galt. Prøv igen.'
}

// ---------------------------------------------------------------- opskrifter
export function useRecipes() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.recipes(hid),
    queryFn: async () => {
      const { data, error } = await supabase.from('recipes').select('*').is('archived_at', null).order('name')
      if (error) throw error
      return data
    },
  })
}

export function useRecipe(id: string | undefined) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.recipe(hid, id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<RecipeWithIngredients | null> => {
      const { data, error } = await supabase.from('recipes').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      if (!data) return null
      const ing = await supabase.from('recipe_ingredients').select('*').eq('recipe_id', id!).order('sort_order')
      if (ing.error) throw ing.error
      return { ...data, ingredients: ing.data }
    },
  })
}

export function useSaveRecipe() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, recipe, ingredients }: { id?: string; recipe: RecipeInputJson; ingredients: IngredientInputJson[] }) => {
      const { data, error } = await supabase.rpc('save_recipe', { p_id: id ?? null, p_recipe: recipe, p_ingredients: ingredients })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSetFavorite() {
  const { id: hid } = useHousehold()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from('recipes').update({ is_favorite: value }).eq('id', id)
      if (error) throw error
    },
    // Stjernen skifter med det samme
    onMutate: ({ id, value }) => {
      qc.setQueryData<Recipe[]>(keys.recipes(hid), (list) => list?.map((r) => (r.id === id ? { ...r, is_favorite: value } : r)))
      qc.setQueryData<RecipeWithIngredients | null>(keys.recipe(hid, id), (r) => (r ? { ...r, is_favorite: value } : r))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all(hid) }),
  })
}

/** "Slet" = arkivér, så tidligere ugeplaner bevarer retten */
export function useArchiveRecipe() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').update({ archived_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------- ugeplan
export function useWeek(monday: string) {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.week(hid, monday),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('*')
        .gte('plan_date', monday)
        .lte('plan_date', addDaysIso(monday, 6))
        .eq('meal', 'dinner')
        .order('plan_date')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

/** Tidligere retter (til "nyligt brugt" og tidligere uger) */
export function useMealHistory() {
  const { id: hid } = useHousehold()
  return useQuery({
    queryKey: keys.history(hid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('*')
        .eq('meal', 'dinner')
        .order('plan_date', { ascending: false })
        .limit(300)
      if (error) throw error
      return data
    },
  })
}

export type EntryInput = { planDate: string; recipeId: string | null; title: string; servings: number | null }

export function useSaveEntry() {
  const { id: hid } = useHousehold()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: EntryInput }) => {
      const values = { plan_date: input.planDate, recipe_id: input.recipeId, title: input.title.trim(), servings: input.servings }
      if (id) {
        const { error } = await supabase.from('meal_plan_entries').update(values).eq('id', id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('meal_plan_entries').insert({ ...values, household_id: hid, meal: 'dinner' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEntry() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCopyWeek() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data, error } = await supabase.rpc('copy_meal_week', { p_from: from, p_to: to })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------- indkøb
/** Ugens ingredienser – skaleret til hver rets portioner og lagt sammen */
export function useWeekIngredients(monday: string, entries: MealEntry[] | undefined) {
  const { id: hid } = useHousehold()
  const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id).filter((x): x is string => Boolean(x)))].sort()
  return useQuery({
    queryKey: [...keys.weekIngredients(hid, monday), recipeIds.join(','), (entries ?? []).map((e) => `${e.recipe_id}:${e.servings}`).join(',')],
    enabled: Boolean(entries),
    queryFn: async (): Promise<MergedIngredient[]> => {
      if (recipeIds.length === 0) return []
      const [recipes, ingredients] = await Promise.all([
        supabase.from('recipes').select('id, name, servings').in('id', recipeIds),
        supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds).order('sort_order'),
      ])
      if (recipes.error) throw recipes.error
      if (ingredients.error) throw ingredients.error
      const byId = new Map(recipes.data.map((r) => [r.id, r]))
      const list = (entries ?? []).flatMap((e) => {
        const r = e.recipe_id ? byId.get(e.recipe_id) : undefined
        if (!r) return []
        const servings = e.servings ?? r.servings
        return ingredients.data
          .filter((i) => i.recipe_id === r.id)
          .map((i) => ({
            name: i.name,
            unit: i.unit,
            amount_milli: i.amount_milli === null ? null : scaleMilli(i.amount_milli, r.servings, servings),
            from: r.name,
          }))
      })
      return mergeIngredients(list)
    },
  })
}

export function useAddToShopping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ monday, items }: { monday: string; items: MergedIngredient[] }) => {
      const { data, error } = await supabase.rpc('add_meal_ingredients_to_shopping', {
        p_week: monday,
        p_items: items.map((i) => ({ key: i.key, name: i.name, quantity: i.quantity })),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['home'] }),
  })
}

// ---------------------------------------------------------------- madbudget
export function useSetGroceryCategory() {
  const { id: hid } = useHousehold()
  const { session } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('households').update({ grocery_category_id: categoryId }).eq('id', hid)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: householdQueryKey(session?.user.id) }),
  })
}

// ---------------------------------------------------------------- opskrift fra link
export type ImportedRecipe = {
  name: string
  description: string | null
  servings: number | null
  prepMinutes: number | null
  ingredients: string[]
  steps: string | null
}

type ImportResult = { ok: true; recipe: ImportedRecipe; source: string } | { ok: false; error: 'invalid_url' | 'no_recipe' | 'fetch_failed' | 'unauthorized' }

export function importErrorMessage(code: string): string {
  if (code === 'invalid_url') return 'Det ligner ikke et gyldigt link. Kopiér adressen fra opskriftssiden og prøv igen.'
  if (code === 'no_recipe') return 'Vi kunne ikke finde en opskrift på siden. Nogle sider viser ikke opskriften i et format, appen kan læse – så må den skrives ind.'
  if (code === 'unauthorized') return 'Du er ikke logget ind. Log ind igen og prøv igen.'
  return 'Siden kunne ikke hentes lige nu. Tjek linket eller prøv igen om lidt.'
}

/** Hent en opskrift fra et link (via Edge Functionen import-recipe) */
export function useImportRecipe() {
  return useMutation({
    mutationFn: async (url: string): Promise<{ recipe: ImportedRecipe; source: string }> => {
      const { data, error } = await supabase.functions.invoke<ImportResult>('import-recipe', { body: { url } })
      if (error || !data) throw new Error((error as { context?: { status?: number } } | null)?.context?.status === 401 ? 'unauthorized' : 'fetch_failed')
      if (!data.ok) throw new Error(data.error)
      return { recipe: data.recipe, source: data.source }
    },
  })
}
