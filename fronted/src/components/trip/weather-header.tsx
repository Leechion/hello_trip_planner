import { Sun, Cloud, CloudRain, Wind } from "lucide-react"
import type { WeatherInfo } from "@/lib/types"

const WEATHER_ICONS: Record<string, typeof Sun> = {
  "晴": Sun,
  "多云": Cloud,
  "阴": Cloud,
  "小雨": CloudRain,
  "中雨": CloudRain,
  "大雨": CloudRain,
  "雷阵雨": CloudRain,
  "雪": CloudRain,
}

export function WeatherHeader({ weather }: { weather?: WeatherInfo }) {
  if (!weather) return null

  const Icon = WEATHER_ICONS[weather.day_weather] || Cloud

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-brand-50 border">
      <Icon className="h-8 w-8 text-brand-600" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{weather.day_weather}</span>
          <span className="text-sm text-muted-foreground">
            {weather.day_temp}°C / {weather.night_temp}°C
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Wind className="h-3 w-3" />
            {weather.wind_direction} {weather.wind_power}
          </span>
        </div>
      </div>
    </div>
  )
}
