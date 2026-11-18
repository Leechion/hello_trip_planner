"use client"

import { useState } from "react"
import { MapPin, Calendar, Search, ArrowRight, Sparkles, Wallet, Heart } from "lucide-react"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripStore } from "@/lib/store/trip-store"

const PREFERENCE_TAGS = ["历史文化", "自然风光", "美食", "购物", "艺术", "休闲"]
const BUDGET_LEVELS = [
  { value: "budget", label: "经济型", desc: "精打细算", icon: Wallet },
  { value: "comfort", label: "舒适型", desc: "性价比高", icon: Sparkles },
  { value: "luxury", label: "豪华型", desc: "品质享受", icon: Sparkles },
]

export function Step1IntentForm() {
  const { fromCity, toCity, departDate, travelDays, budgetLevel, preferences, setStep1 } = useTripStore()

  const [form, setForm] = useState({
    fromCity: fromCity || "",
    toCity: toCity || "",
    departDate: departDate || new Date().toISOString().split("T")[0],
    travelDays: travelDays || 3,
  })
  const [budget, setBudget] = useState(budgetLevel || "comfort")
  const [prefs, setPrefs] = useState<string[]>(preferences || [])

  const togglePref = (tag: string) => {
    setPrefs((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleSubmit = () => {
    const departDateObj = new Date(form.departDate)
    const returnDateObj = new Date(departDateObj.getTime() + (form.travelDays - 1) * 86400000)
    setStep1({
      fromCity: form.fromCity,
      toCity: form.toCity,
      departDate: form.departDate,
      returnDate: returnDateObj.toISOString().split("T")[0],
      travelDays: form.travelDays,
      budgetLevel: budget,
      preferences: prefs,
    })
  }

  const isValid = form.fromCity.trim() && form.toCity.trim() && form.departDate

  return (
    <Card className="wizard-card">
      {/* Hero header */}
      <div className="wizard-card-heading">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">从这里，开始出发</CardTitle>
            <CardDescription>四个简单的信息，勾勒一段属于你的旅程</CardDescription>
          </div>
        </div>
      </div>

      <CardContent className="p-6 space-y-6">
        {/* Cities - two cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="from-city" className="text-xs font-medium text-foreground">出发城市</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="from-city" placeholder="从哪座城市出发？"
                value={form.fromCity}
                onChange={(e) => setForm({ ...form, fromCity: e.target.value })}
                className="pl-9 h-11 text-base font-medium"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="to-city" className="text-xs font-medium text-foreground">目的地城市</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500" />
              <Input
                id="to-city" placeholder="想去哪里走走？"
                value={form.toCity}
                onChange={(e) => setForm({ ...form, toCity: e.target.value })}
                className="pl-9 h-11 text-base font-medium border-brand-200 focus-visible:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Date + Days */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="depart-date" className="text-xs font-medium text-foreground">出发日期</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="depart-date" type="date"
                value={form.departDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setForm({ ...form, departDate: e.target.value })}
                className="pl-9 h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="travel-days" className="text-xs font-medium text-foreground">旅行天数</label>
            <div className="flex items-center gap-3">
              <Input
                id="travel-days" type="number"
                min={1}
                max={30}
                value={form.travelDays}
                onChange={(e) => setForm({ ...form, travelDays: parseInt(e.target.value) || 1 })}
                className="w-16 h-11 text-center text-base font-semibold"
              />
              <span className="text-sm text-muted-foreground">天</span>
              {form.travelDays > 0 && (
                <span className="text-xs text-muted-foreground ml-auto bg-muted px-2.5 py-1 rounded-full">
                  返回：{new Date(new Date(form.departDate).getTime() + (form.travelDays - 1) * 86400000).toISOString().split("T")[0]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Budget - card-style selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            预算等级
          </label>
          <div className="grid grid-cols-3 gap-2">
            {BUDGET_LEVELS.map((b) => {
              const active = budget === b.value
              return (
                <button
                  key={b.value}
                  aria-pressed={active}
                  onClick={() => setBudget(b.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-brand-200 hover:bg-brand-50/50"
                  }`}
                >
                  <span className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>{b.label}</span>
                  <span className="text-[10px] text-muted-foreground">{b.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5" />
            旅行偏好 <span className="font-normal normal-case text-muted-foreground/60">（可选多选）</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PREFERENCE_TAGS.map((tag) => {
              const active = prefs.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  className={`rounded-full border cursor-pointer text-xs py-2 px-3.5 transition-all ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-brand-300 hover:bg-brand-50/50"
                  }`}
                  onClick={() => togglePref(tag)}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>

        {/* Submit */}
        <Button onClick={handleSubmit} disabled={!isValid} className="w-full h-12 text-sm rounded-xl" size="lg">
          <Search className="h-5 w-5 mr-2" />
          寻找我的出发车次
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </CardContent>
    </Card>
  )
}
