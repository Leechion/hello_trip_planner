import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { MapPin, Calendar, ArrowRight, Compass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useTripStore } from "@/lib/store/trip-store"

const PREFERENCE_TAGS = ["历史文化", "自然风光", "美食", "购物", "艺术", "休闲"]

interface TripStartCardProps {
  city: string
  message?: string
}

export function TripStartCard({ city, message }: TripStartCardProps) {
  const navigate = useNavigate()
  const { setStep1, reset } = useTripStore()

  const [fromCity, setFromCity] = useState("")
  const [departDate, setDepartDate] = useState(new Date().toISOString().split("T")[0])
  const [travelDays, setTravelDays] = useState(3)
  const [prefs, setPrefs] = useState<string[]>([])

  const togglePref = (tag: string) => {
    setPrefs((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleSubmit = () => {
    if (!fromCity.trim()) return
    const returnDate = new Date(new Date(departDate).getTime() + (travelDays - 1) * 86400000)
      .toISOString().split("T")[0]
    reset()
    setStep1({
      fromCity: fromCity.trim(),
      toCity: city,
      departDate,
      returnDate,
      travelDays,
      budgetLevel: "comfort",
      preferences: prefs,
    })
    navigate("/")
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-brand-50 to-background p-4 space-y-3 mt-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
          <Compass className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">开始规划{city}之旅</p>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
      </div>

      {/* From city */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">出发城市</label>
        <div className="relative">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="你从哪里出发？"
            value={fromCity}
            onChange={(e) => setFromCity(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Date + Days */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">出发日期</label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              value={departDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setDepartDate(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">天数</label>
          <div className="flex items-center gap-1.5 h-9">
            <Input
              type="number"
              min={1}
              max={30}
              value={travelDays}
              onChange={(e) => setTravelDays(parseInt(e.target.value) || 1)}
              className="w-16 h-9 text-sm"
            />
            <span className="text-xs text-muted-foreground">天</span>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">偏好（可选）</label>
        <div className="flex flex-wrap gap-1.5">
          {PREFERENCE_TAGS.map((tag) => (
            <Badge
              key={tag}
              variant={prefs.includes(tag) ? "default" : "outline"}
              className="cursor-pointer text-xs py-0.5 px-2"
              onClick={() => togglePref(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!fromCity.trim()}
        className="w-full h-9 text-sm"
        size="sm"
      >
        开始规划
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </div>
  )
}
