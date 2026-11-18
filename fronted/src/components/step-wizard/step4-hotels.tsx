"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, MapPin, Star, Banknote, Loader2, Check, Sparkles, Navigation, AlertCircle, RotateCw } from "lucide-react"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useTripStore } from "@/lib/store/trip-store"
import { budgetLevelToAccommodation, budgetLevelToPriceCeiling, request } from "@/lib/api/python-backend"
import { formatCurrency } from "@/lib/utils/formatters"
import type { Hotel, TripPlan } from "@/lib/types"

function HotelCard({ hotel, selected, onSelect }: { hotel: Hotel; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
        selected ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-brand-200 hover:bg-brand-50/30"
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
        selected ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
      }`}>
        {selected ? <Check className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm">{hotel.name}</span>
          <Badge variant="secondary" className="text-[10px]">{hotel.type}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{hotel.address}</span>
          <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500 fill-amber-500" />{hotel.rating}</span>
          <span className="flex items-center gap-1"><Banknote className="h-3 w-3" />{hotel.price_range}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Navigation className="h-3 w-3" />
          {hotel.distance}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xl font-bold text-primary">{formatCurrency(hotel.estimated_cost || 0)}</p>
        <p className="text-[10px] text-muted-foreground">/晚</p>
      </div>
    </div>
  )
}

export function Step4Hotels() {
  const store = useTripStore()
  const { toCity, budgetLevel, selectedPois, selectHotel, goToStep, setItinerary } = store
  const [options, setOptions] = useState<Hotel[]>([])
  const [selectedId, setSelectedId] = useState<number>(-1)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 把"重置 + 请求"放进 useCallback，effect 与重试按钮共用。
  // setState 放在 effect 体内会触发 react-hooks/set-state-in-effect(级联渲染)，
  // 这里改为事件/回调驱动。
  const loadHotels = useCallback(() => {
    let cancelled = false

    request<{ success: boolean; data?: unknown[]; message?: string }>("/api/mcp/recommend-hotels", {
      method: "POST",
      body: JSON.stringify({
        city: toCity,
        attractions: selectedPois.slice(0, 3),
        budget: budgetLevelToPriceCeiling(budgetLevel),
      }),
    })
      .then((json) => {
        if (cancelled) return
        // 后端失败时返回 success:false + message，必须如实展示，不能拿假酒店冒充结果
        if (json?.success === false) {
          setError(json.message || "酒店查询失败，请稍后重试")
          return
        }
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          setOptions(json.data as Hotel[])
        }
        // 查询成功但没有结果：界面会提示调整预算
      })
      .catch(() => {
        if (!cancelled) setError("无法连接到服务器，请检查网络后重试")
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [budgetLevel, selectedPois, toCity])

  useEffect(() => loadHotels(), [loadHotels, reloadKey])

  const selected = options[selectedId]

  const handleGenerate = async () => {
    if (!selected) return
    selectHotel(selected)
    setGenerating(true)
    setGenerateError(null)

    const selectedAttractions = store.selectedPois.map((name) => {
      const poi = store.poiOptions.find((p) => p.name === name)
      return {
        name,
        address: poi?.address || "",
        category: poi?.category || "景点",
        location: poi?.location || { longitude: 0, latitude: 0 },
      }
    })

    const selectedHotelData = {
      name: selected.name,
      address: selected.address || "",
      location: selected.location || { longitude: 0, latitude: 0 },
      type: selected.type || "酒店",
      // 不要用 400/4.5 之类的默认值冒充真实房价与评分：
      // 缺失就传 0/空串，由后端按默认值处理，避免行程里出现用户从未见过的数字。
      estimated_cost: selected.estimated_cost ?? 0,
      price_range: selected.price_range || "",
      rating: selected.rating || "",
      distance: selected.distance || "",
    }

    try {
      const json = await request<{ success: boolean; data?: unknown; message?: string }>("/api/mcp/trip/plan", {
        method: "POST",
        body: JSON.stringify({
          city: store.toCity,
          start_date: store.departDate,
          end_date: new Date(new Date(store.departDate).getTime() + (store.travelDays - 1) * 86400000).toISOString().split("T")[0],
          travel_days: store.travelDays,
          transportation: store.selectedTransport?.selected_item?.type || "公共交通",
          accommodation: budgetLevelToAccommodation(store.budgetLevel),
          preferences: store.preferences,
          free_text_input: `出发城市: ${store.fromCity}`,
          selected_attractions: selectedAttractions,
          selected_hotel: selectedHotelData,
        }),
      })

      if (json?.success === false || !json?.data) {
        // 行程生成失败必须告知用户，而不是塞一份编造的行程让他当成真实规划
        setGenerateError(json?.message || "行程生成失败，请稍后重试")
        return
      }

      setItinerary(json.data as TripPlan)
      goToStep(5)
      return
    } catch {
      setGenerateError("行程生成失败，请检查网络后重试")
      return
    } finally {
      setGenerating(false)
    }
  }

  const accommodationLabel = budgetLevelToAccommodation(budgetLevel)

  return (
    <Card className="wizard-card">
      <div className="wizard-card-heading">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{toCity} · 选择住宿</CardTitle>
            <CardDescription>{accommodationLabel} · 根据你的景点位置智能推荐</CardDescription>
          </div>
        </div>
      </div>

      <CardContent className="p-6 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm text-muted-foreground">正在搜索你选择的景点附近酒店...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">酒店信息查询失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">{error}</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => {
                  setLoading(true); setError(null); setOptions([]); setSelectedId(-1)
                  setReloadKey((k) => k + 1)
                }}>
                <RotateCw className="h-4 w-4 mr-1.5" />
                重试
              </Button>
              <Button variant="outline" size="sm" onClick={() => goToStep(3)}>返回修改</Button>
            </div>
          </div>
        ) : options.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            未找到预算范围内的酒店，请返回调整预算
          </div>
        ) : (
          <>
            {options.map((hotel, i) => (
              <HotelCard
                key={i}
                hotel={hotel}
                selected={selectedId === i}
                onSelect={() => setSelectedId(i)}
              />
            ))}

            <Separator className="my-2" />

            {generateError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{generateError}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => goToStep(3)} className="flex-1 h-11">返回修改</Button>
              <Button onClick={handleGenerate} disabled={selectedId === -1 || generating} className="flex-1 h-11" size="lg">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    生成完整行程
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
