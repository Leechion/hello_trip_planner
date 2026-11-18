"use client"

import { useState, useEffect } from "react"
import { Plus, Sparkles, Loader2, MapPin, Check, AlertCircle, RotateCw } from "lucide-react"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useTripStore } from "@/lib/store/trip-store"
import type { PoiOption } from "@/lib/types"
import { pythonBackend } from "@/lib/api/python-backend"

type PoiApiItem = {
  name: string
  category?: string
  address?: string
  location?: { longitude: number; latitude: number }
}

export function Step3Pois() {
  const { toCity, preferences, travelDays, poiOptions, selectedPois, setPoiOptions, addPoi, removePoi, addCustomPoi, goToStep } = useTripStore()
  const [customInput, setCustomInput] = useState("")
  const [loading, setLoading] = useState(poiOptions.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (poiOptions.length > 0) return
    let cancelled = false

    pythonBackend
      .searchPois({ city: toCity, preferences, travel_days: travelDays })
      .then((json) => {
        if (cancelled) return
        if (json?.success === false) {
          setError(json.message || "景点推荐失败，请稍后重试")
          return
        }
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const pois: PoiOption[] = (json.data as PoiApiItem[]).map((p) => ({
            id: p.name,
            name: p.name,
            category: p.category || "景点",
            address: p.address || "",
            location: p.location,
          }))
          setPoiOptions(pois)
        }
      })
      .catch(() => {
        if (!cancelled) setError("无法连接到服务器，请检查网络后重试")
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [poiOptions.length, preferences, setPoiOptions, toCity, travelDays, reloadKey])

  const selectedSet = new Set(selectedPois)

  const handleAddCustom = () => {
    const name = customInput.trim()
    if (!name) return
    addCustomPoi(name)
    setCustomInput("")
  }

  // Group POIs by category
  const grouped = poiOptions.reduce<Record<string, PoiOption[]>>((acc, poi) => {
    const cat = poi.category || "其他"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(poi)
    return acc
  }, {})

  const selectedCount = selectedPois.length

  return (
    <Card className="wizard-card">
      <div className="wizard-card-heading">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{toCity} · AI 精选景点</CardTitle>
            <CardDescription>
              已选 <span className="font-semibold text-brand-600">{selectedCount}</span> 个景点 — 点击添加或移除
            </CardDescription>
          </div>
        </div>
      </div>

      <CardContent className="p-6 space-y-5">
        {loading && poiOptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm text-muted-foreground">AI 正在根据你的偏好筛选最合适的景点...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">景点推荐失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); setError(null); setReloadKey((k) => k + 1) }}>
              <RotateCw className="h-4 w-4 mr-1.5" />
              重试
            </Button>
          </div>
        ) : (
          <>
            {/* POI cards by category */}
            {Object.entries(grouped).map(([category, pois]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</span>
                  <Separator className="flex-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pois.map((poi) => {
                    const isSelected = selectedSet.has(poi.name)
                    return (
                      <button
                        key={poi.id}
                        onClick={() => isSelected ? removePoi(poi.name) : addPoi(poi.name)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-brand-200 hover:bg-brand-50/30"
                        }`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          {isSelected ? <Check className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : ""}`}>{poi.name}</p>
                          {poi.address && (
                            <p className="text-[10px] text-muted-foreground truncate">{poi.address}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Custom POI input */}
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="添加想去但未列出的地点..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustom() } }}
                className="h-10 text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleAddCustom} disabled={!customInput.trim()} className="h-10 px-3">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => goToStep(2)} className="flex-1 h-11">返回</Button>
              <Button onClick={() => goToStep(4)} disabled={selectedPois.length === 0} className="flex-1 h-11">
                确认景点，选择酒店
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
