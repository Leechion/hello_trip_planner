import { Coffee, Sun, Moon, Cookie } from "lucide-react"
import { formatCurrency } from "@/lib/utils/formatters"
import type { Meal } from "@/lib/types"

const MEAL_ICONS: Record<string, typeof Coffee> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "小吃",
}

export function MealEntry({ meal }: { meal: Meal }) {
  const Icon = MEAL_ICONS[meal.type] || Coffee
  const label = MEAL_LABELS[meal.type] || meal.type

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-medium">{meal.name}</span>
        </div>
        {meal.description && (
          <p className="text-xs text-muted-foreground truncate">{meal.description}</p>
        )}
      </div>
      {meal.estimated_cost != null && (
        <span className="text-sm font-semibold text-brand-700 shrink-0">
          {formatCurrency(meal.estimated_cost)}
        </span>
      )}
    </div>
  )
}
