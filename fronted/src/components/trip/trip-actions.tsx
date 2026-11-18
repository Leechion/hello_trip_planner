"use client"

import { useEffect, useState } from "react"
import { Save, Share2, FileDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { pythonBackend } from "@/lib/api/python-backend"
import { useTripStore } from "@/lib/store/trip-store"
import { useAuthStore } from "@/lib/store/auth-store"
import type { TripPlan } from "@/lib/types"

export function TripActions({ tripId }: { tripId?: number }) {
  const [saved, setSaved] = useState(false)
  const [shared, setShared] = useState<string | null>(null)
  const itinerary = useTripStore((s) => s.itinerary)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  // 行程内容(含手动编辑)变化后,保存状态失效需重新保存
  useEffect(() => {
    setSaved(false)
  }, [itinerary])

  if (!itinerary || !isLoggedIn) return null

  const handleSave = async () => {
    try {
      if (tripId != null) {
        await pythonBackend.updateTrip(tripId, itinerary)
      } else {
        await pythonBackend.saveTrip(itinerary)
      }
      setSaved(true)
    } catch {
      // ignore
    }
  }

  const handleShare = async () => {
    try {
      const res = await pythonBackend.shareTrip(itinerary)
      if (res.token) {
        const url = `${window.location.origin}/share/${res.token}`
        setShared(url)
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // ignore
    }
  }

  const handleExport = () => {
    const text = generateTextExport(itinerary)
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tripbuddy-${itinerary.city}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={saved ? "secondary" : "outline"} onClick={handleSave} disabled={saved}>
        {saved ? <Check className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
        {saved ? "已保存" : tripId != null ? "保存修改" : "保存到历史"}
      </Button>
      <Button size="sm" variant="outline" onClick={handleShare}>
        <Share2 className="h-4 w-4 mr-1.5" />
        {shared ? "已复制链接" : "分享行程"}
      </Button>
      <Button size="sm" variant="outline" onClick={handleExport}>
        <FileDown className="h-4 w-4 mr-1.5" />
        导出文本
      </Button>
    </div>
  )
}

function generateTextExport(plan: TripPlan): string {
  let text = `========== ${plan.city} 旅行计划 ==========\n\n`
  text += `日期: ${plan.start_date} ~ ${plan.end_date}\n\n`
  for (const day of plan.days || []) {
    text += `--- Day ${day.day_index + 1}: ${day.date} ---\n`
    text += `${day.description}\n\n`
    text += `景点:\n`
    for (const a of day.attractions || []) {
      const ticketPrice = a.ticket_price ?? 0
      text += `  - ${a.name} (${a.visit_duration}分钟) ${ticketPrice > 0 ? "¥" + ticketPrice : "免费"}\n`
    }
    text += `餐饮:\n`
    for (const m of day.meals || []) {
      text += `  ${m.type}: ${m.name} (¥${m.estimated_cost ?? 0})\n`
    }
    if (day.hotel) text += `酒店: ${day.hotel.name} ¥${day.hotel.estimated_cost ?? 0}/晚\n`
    text += "\n"
  }
  text += `${plan.overall_suggestions || ""}\n`
  return text
}
