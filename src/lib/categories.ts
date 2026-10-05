import {
  Baby,
  Car,
  Coffee,
  Dumbbell,
  Gift,
  GraduationCap,
  Heart,
  House,
  type LucideIcon,
  Plane,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Utensils,
  Zap,
  PawPrint,
} from 'lucide-react'

/** Ikoner man kan vælge til en budgetkategori. Nøglen gemmes i databasen. */
export const categoryIcons: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  utensils: Utensils,
  coffee: Coffee,
  bag: ShoppingBag,
  shirt: Shirt,
  baby: Baby,
  car: Car,
  plane: Plane,
  house: House,
  zap: Zap,
  phone: Smartphone,
  heart: Heart,
  gift: Gift,
  dumbbell: Dumbbell,
  school: GraduationCap,
  paw: PawPrint,
  sparkles: Sparkles,
}

/** Kategorifarver – harmoniske og bevidst uden rød/orange (de er forbeholdt advarsler). */
export const categoryColors = ['#6d5cff', '#1aa59a', '#3b8fd9', '#d65a9c', '#7fa82e', '#b08a5a', '#9a5bd1', '#5f6b7a'] as const

export const defaultCategoryIcon = 'sparkles'
export const defaultCategoryColor = categoryColors[0]

export function categoryIcon(key: string | null | undefined): LucideIcon {
  return (key && categoryIcons[key]) || Sparkles
}

/** Forslag til første opsætning (fra jeres egen liste) */
export const suggestedCategories: Array<{ name: string; icon: string; color: string }> = [
  { name: 'Dagligvarer', icon: 'cart', color: '#1aa59a' },
  { name: 'Restaurant', icon: 'utensils', color: '#d65a9c' },
  { name: 'Shopping', icon: 'bag', color: '#6d5cff' },
  { name: 'Børn', icon: 'baby', color: '#3b8fd9' },
  { name: 'Bil', icon: 'car', color: '#5f6b7a' },
  { name: 'Ferie', icon: 'plane', color: '#7fa82e' },
  { name: 'Diverse', icon: 'sparkles', color: '#b08a5a' },
]
