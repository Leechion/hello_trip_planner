import { useState, useEffect } from "react"
import { Clock, Ticket, MapPin, ImageOff, ChevronUp, ChevronDown, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDuration, formatCurrency } from "@/lib/utils/formatters"
import { getAuthToken } from "@/lib/api/python-backend"
import type { Attraction } from "@/lib/types"

function AttractionImage({ name, city }: { name: string; city?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_PYTHON_BACKEND_URL || ""
    const token = getAuthToken()
    const params = new URLSearchParams({ name })
    if (city) params.set("city", city)
    fetch(`${backendUrl}/api/poi/photo?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.data?.photo_url) setUrl(json.data.photo_url)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [name, city])

  if (loading) return <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl shrink-0" />
  if (!url) return (
    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-muted flex items-center justify-center shrink-0">
      <ImageOff className="h-6 w-6 text-muted-foreground/30" />
    </div>
  )

  return (
    <img src={url} alt={name} className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl shrink-0" loading="lazy" />
  )
}

export function AttractionCard({
  attraction,
  index,
  city,
  editable,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  attraction: Attraction
  index: number
  city?: string
  editable?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete?: () => void
}) {
  return (
    <Card className="border-border hover:border-brand-200 transition-all hover:shadow-sm overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Image thumbnail */}
          <AttractionImage name={attraction.name} city={city} />

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                {index + 1}
              </div>
              <h4 className="font-semibold text-sm">{attraction.name}</h4>
              {attraction.category && (
                <Badge variant="secondary" className="text-[10px]">{attraction.category}</Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground line-clamp-2">{attraction.description}</p>

            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(attraction.visit_duration)}
              </span>
              {attraction.ticket_price != null && (
                <span className="flex items-center gap-1">
                  <Ticket className="h-3.5 w-3.5" />
                  {attraction.ticket_price > 0 ? formatCurrency(attraction.ticket_price) : "免费"}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {attraction.address}
              </span>
            </div>
          </div>

          {editable && (
            <div className="flex flex-col gap-1 shrink-0 self-center">
              {onMoveUp && (
                <button
                  type="button"
                  aria-label="上移"
                  onClick={onMoveUp}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  aria-label="下移"
                  onClick={onMoveDown}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  aria-label="删除"
                  onClick={onDelete}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
