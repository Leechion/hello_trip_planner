"use client"

import { useEffect, useState } from "react"
import { MapPin, Calendar, Sparkles, Compass, Pencil, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { AttractionCard } from "@/components/trip/attraction-card"
import { MapPreview } from "@/components/trip/map-preview"
import { HotelCard } from "@/components/trip/hotel-card"
import { MealEntry } from "@/components/trip/meal-entry"
import { WeatherHeader } from "@/components/trip/weather-header"
import { BudgetBreakdown } from "@/components/trip/budget-breakdown"
import { TripActions } from "@/components/trip/trip-actions"
import { useTripStore } from "@/lib/store/trip-store"
import type { TripPlan } from "@/lib/types"

type TimelineDataShape = {
  result?: { data?: TripPlan } | TripPlan
  data?: TripPlan
}

function extractPlan(data: TimelineDataShape | TripPlan | null | undefined): TripPlan | null {
  if (!data) return null
  if ("days" in data) return data as TripPlan
  if ("result" in data && data.result && typeof data.result === "object" && "data" in data.result) {
    return data.result.data ?? null
  }
  if ("data" in data) {
    return data.data ?? null
  }
  return null
}

// 编辑只改景点(删除/排序),酒店/餐饮/交通保持不变,按生成时的口径重算景点部分预算
function recalcAttractionBudget(plan: TripPlan): void {
  if (!plan.budget) return
  const totalA = plan.days.reduce(
    (sum, day) => sum + day.attractions.reduce((s, a) => s + (a.ticket_price ?? 0), 0),
    0
  )
  plan.budget.total_attractions = totalA
  plan.budget.total = totalA + (plan.budget.total_hotels ?? 0) + (plan.budget.total_meals ?? 0) + (plan.budget.total_transportation ?? 0)
}

export function Timeline({
  data,
  editable = true,
  tripId,
}: {
  data: TimelineDataShape | TripPlan | null | undefined
  editable?: boolean
  tripId?: number
}) {
  const setItinerary = useTripStore((s) => s.setItinerary)
  const [editMode, setEditMode] = useState(false)
  // 编辑结果挂在 base 行程上:换新行程(引用变化)时自动丢弃旧编辑,无需手动重置
  const [editState, setEditState] = useState<{ base: TripPlan; plan: TripPlan } | null>(null)

  const plan = extractPlan(data)
  const edited = editState && editState.base === plan ? editState.plan : null

  useEffect(() => {
    // 用可选链:plan 可能来自 `as TripPlan` 强制断言,字段缺失时
    // 直接访问 plan.days.length 会抛 TypeError(下方守卫在 effect 之后,救不了)
    const current = edited ?? plan
    if (current?.city && current.days?.length) {
      setItinerary(current)
    }
  }, [edited, plan, setItinerary])

  if (!plan || !plan.days) return null

  // 守卫之后 plan 必为 TripPlan,displayPlan 也不再可能是 null
  const displayPlan: TripPlan = edited ?? plan

  const applyEdit = (mutator: (draft: TripPlan) => void) => {
    const next = structuredClone(displayPlan)
    mutator(next)
    setEditState({ base: plan, plan: next })
  }

  const removeAttraction = (dayIdx: number, attrIdx: number) =>
    applyEdit((draft) => {
      draft.days[dayIdx]?.attractions.splice(attrIdx, 1)
      recalcAttractionBudget(draft)
    })

  const moveAttraction = (dayIdx: number, attrIdx: number, dir: -1 | 1) =>
    applyEdit((draft) => {
      const list = draft.days[dayIdx]?.attractions
      const target = attrIdx + dir
      if (!list || target < 0 || target >= list.length) return
      ;[list[attrIdx], list[target]] = [list[target], list[attrIdx]]
    })

  const totalAttractions = displayPlan.days.reduce((sum, d) => sum + d.attractions.length, 0)

  return (
    <div className="space-y-6">
      {/* Hero header card */}
      <Card className="border-border shadow-sm overflow-hidden gap-3 pt-0 rounded-[20px]">
        <div className="bg-primary px-6 sm:px-8 py-7 text-primary-foreground">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[9px] tracking-[0.22em] opacity-60 mb-3">TRAVEL ITINERARY / 目的地手记</p>
              <h3 className="text-4xl font-heading font-medium flex items-center gap-3">
                <Compass className="h-6 w-6" />
                {displayPlan.city}
              </h3>
              <p className="text-sm opacity-90 mt-1.5 flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {displayPlan.start_date} — {displayPlan.end_date}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="text-center border-l border-white/20 px-4 py-1">
                <p className="text-3xl font-heading font-medium">{displayPlan.days.length}</p>
                <p className="text-[10px] opacity-80 uppercase tracking-wider">天数</p>
              </div>
              <div className="text-center border-l border-white/20 px-4 py-1">
                <p className="text-3xl font-heading font-medium">{totalAttractions}</p>
                <p className="text-[10px] opacity-80 uppercase tracking-wider">景点</p>
              </div>
              {displayPlan.budget && (
                <div className="text-center border-l border-white/20 px-4 py-1">
                  <p className="text-3xl font-heading font-medium">¥{displayPlan.budget.total}</p>
                  <p className="text-[10px] opacity-80 uppercase tracking-wider">预算</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {editable && (
            <div className="flex justify-end px-4 pt-3">
              <Button
                size="sm"
                variant={editMode ? "default" : "outline"}
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode ? <Check className="h-4 w-4 mr-1.5" /> : <Pencil className="h-4 w-4 mr-1.5" />}
                {editMode ? "完成编辑" : "编辑行程"}
              </Button>
            </div>
          )}

          {/* Map */}
          <div className="px-4 pt-4">
            <MapPreview days={displayPlan.days} />
          </div>

          {/* Day tabs */}
          <Tabs defaultValue="0" className="w-full min-w-0">
            <div className="px-4 pt-4 pb-3 border-b overflow-x-auto">
              <TabsList className="w-max min-w-full group-data-[orientation=horizontal]/tabs:h-12 bg-muted/60 p-1 gap-1">
                {plan.days.map((day, i) => (
                  <TabsTrigger key={i} value={String(i)} className="flex-1 min-w-24 h-10 px-4 gap-2 rounded-lg data-active:bg-card data-active:text-primary data-active:shadow-sm">
                    <span className="text-sm font-medium">第{i + 1}天</span>
                    <span className="text-xs text-muted-foreground">
                      {day.date.slice(5)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {displayPlan.days.map((day, i) => (
              <TabsContent key={i} value={String(i)} className="w-full min-w-0 px-4 sm:px-6 pt-4 pb-6 space-y-5">
                {/* Weather */}
                <WeatherHeader weather={displayPlan.weather_info?.[i]} />

                {/* Day description */}
                <p className="text-sm leading-8 text-muted-foreground">{day.description}</p>

                {/* Attractions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-brand-600" />
                    景点
                    <Badge variant="secondary" className="text-[10px]">{day.attractions.length}</Badge>
                  </h4>
                  <div className="space-y-2">
                    {day.attractions.map((a, j) => (
                      <AttractionCard
                        key={j}
                        attraction={a}
                        index={j}
                        city={displayPlan.city}
                        editable={editMode}
                        onMoveUp={j > 0 ? () => moveAttraction(i, j, -1) : undefined}
                        onMoveDown={j < day.attractions.length - 1 ? () => moveAttraction(i, j, 1) : undefined}
                        onDelete={() => removeAttraction(i, j)}
                      />
                    ))}
                    {editMode && day.attractions.length === 0 && (
                      <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                        当天暂无景点
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Hotel */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">住宿</h4>
                  <HotelCard hotel={day.hotel} />
                </div>

                <Separator />

                {/* Meals */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">餐饮</h4>
                  <div className="divide-y divide-border/50 rounded-lg border">
                    {day.meals.map((m, j) => (
                      <MealEntry key={j} meal={m} />
                    ))}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Budget */}
      <BudgetBreakdown plan={displayPlan} />

      {/* Overall suggestions */}
      {displayPlan.overall_suggestions && (
        <Card className="border-brand-100 bg-brand-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-500" />
              旅行建议
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-8 text-muted-foreground whitespace-pre-line">
              {displayPlan.overall_suggestions}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <TripActions tripId={tripId} />
    </div>
  )
}
