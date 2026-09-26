import {
  BookOpen,
  Building2,
  Cross,
  GraduationCap,
  Landmark,
  ShoppingBasket,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import type { PoiCategory } from '@/types/geography'
import type { RGB } from '@/utils/constants'

export interface CategoryMeta {
  category: PoiCategory
  label: string
  icon: LucideIcon
  rgb: RGB
}

export const SERVICE_CATEGORIES: CategoryMeta[] = [
  { category: 'hospital', label: 'Hospitals', icon: Cross, rgb: [255, 107, 129] },
  { category: 'clinic', label: 'Clinics', icon: Stethoscope, rgb: [244, 143, 177] },
  { category: 'school', label: 'Schools', icon: GraduationCap, rgb: [250, 204, 21] },
  { category: 'government', label: 'Government', icon: Landmark, rgb: [125, 180, 255] },
  { category: 'university', label: 'Universities', icon: Building2, rgb: [192, 160, 255] },
  { category: 'grocery', label: 'Groceries', icon: ShoppingBasket, rgb: [74, 222, 128] },
  { category: 'library', label: 'Libraries', icon: BookOpen, rgb: [94, 234, 212] },
]

const FALLBACK: RGB = [160, 170, 185]
const byCategory = new Map(SERVICE_CATEGORIES.map((meta) => [meta.category, meta]))

export function categorySingular(category: PoiCategory) {
  const label = byCategory.get(category)?.label ?? category
  if (category === 'grocery') return 'Grocery'
  return label.replace(/ies$/, 'y').replace(/s$/, '')
}

export function categoryMeta(category: PoiCategory): CategoryMeta | undefined {
  return byCategory.get(category)
}

export function categoryRgb(category: PoiCategory): RGB {
  return byCategory.get(category)?.rgb ?? FALLBACK
}
