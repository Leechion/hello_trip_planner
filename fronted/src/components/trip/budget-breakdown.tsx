import { Ticket, Building2, UtensilsCrossed, Bus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatCurrency } from "@/lib/utils/formatters"
import type { TripPlan } from "@/lib/types"

interface LineItem {
  label: string
  detail?: string
  cost: number
}

function extractLineItems(plan: TripPlan) {
  const attractions: LineItem[] = []
  const hotels: LineItem[] = []
  const meals: LineItem[] = []
  const transport: LineItem[] = []

  const seenHotels = new Set<string>()

  for (const day of plan.days) {
    // Attractions
    for (const attr of day.attractions) {
      attractions.push({
        label: attr.name,
        detail: attr.ticket_price != null && attr.ticket_price > 0 ? `门票 ¥${attr.ticket_price}` : "免费",
        cost: attr.ticket_price ?? 0,
      })
    }

    // Hotels (deduplicate by name, show once with night count)
    if (day.hotel && !seenHotels.has(day.hotel.name)) {
      seenHotels.add(day.hotel.name)
      const nightlyRate = day.hotel.estimated_cost ?? 0
      hotels.push({
        label: day.hotel.name,
        detail: `¥${nightlyRate}/晚`,
        cost: nightlyRate,
      })
    }

    // Meals
    for (const meal of day.meals) {
      const typeLabels: Record<string, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "小吃" }
      meals.push({
        label: meal.name,
        detail: typeLabels[meal.type] || meal.type,
        cost: meal.estimated_cost ?? 0,
      })
    }
  }

  // Transport (lump sum from budget if available)
  if (plan.budget?.total_transportation) {
    transport.push({
      label: "市内交通",
      detail: `${plan.days.length}天公共交通`,
      cost: plan.budget.total_transportation,
    })
  }

  return { attractions, hotels, meals, transport }
}

export function BudgetBreakdown({ plan }: { plan?: TripPlan }) {
  if (!plan) return null

  const budget = plan.budget
  const items = extractLineItems(plan)

  const total =
    items.attractions.reduce((s, i) => s + i.cost, 0) +
    items.hotels.reduce((s, i) => s + i.cost, 0) * plan.days.length +
    items.meals.reduce((s, i) => s + i.cost, 0) +
    items.transport.reduce((s, i) => s + i.cost, 0)

  const displayTotal = budget?.total ?? total

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>费用明细</span>
          <span className="text-2xl font-bold text-brand-600">
            {formatCurrency(displayTotal)}
          </span>
        </CardTitle>
      </CardHeader>
      <Separator />

      <CardContent className="pt-4 space-y-5">
        {/* 景点门票 */}
        {items.attractions.length > 0 && (
          <Section
            icon={Ticket}
            label="景点门票"
            items={items.attractions}
            color="bg-rose-500"
          />
        )}

        {/* 酒店住宿 */}
        {items.hotels.length > 0 && (
          <Section
            icon={Building2}
            label="酒店住宿"
            items={items.hotels}
            nights={plan.days.length}
            color="bg-blue-500"
          />
        )}

        {/* 餐饮美食 */}
        {items.meals.length > 0 && (
          <Section
            icon={UtensilsCrossed}
            label="餐饮美食"
            items={items.meals}
            color="bg-amber-500"
          />
        )}

        {/* 市内交通 */}
        {items.transport.length > 0 && (
          <Section
            icon={Bus}
            label="市内交通"
            items={items.transport}
            color="bg-emerald-500"
          />
        )}
      </CardContent>
    </Card>
  )
}

function Section({
  icon: Icon,
  label,
  items,
  nights,
  color,
}: {
  icon: typeof Ticket
  label: string
  items: LineItem[]
  nights?: number
  color: string
}) {
  const subtotal = items.reduce((s, i) => s + i.cost, 0)
  const displayTotal = nights ? subtotal * nights : subtotal

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </span>
        <span className="text-sm font-bold">{formatCurrency(displayTotal)}</span>
      </div>

      {/* Line items */}
      <div className="space-y-1 pl-6">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate mr-2">{item.label}</span>
            <span className="shrink-0 flex items-center gap-2">
              {item.detail && (
                <span className="text-[10px] opacity-60">{item.detail}</span>
              )}
              <span className="tabular-nums">
                {nights ? formatCurrency(item.cost * nights) : formatCurrency(item.cost)}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  )
}
