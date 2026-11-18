import { Building2, Star, MapPin, Banknote } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { Hotel } from "@/lib/types"

export function HotelCard({ hotel }: { hotel?: Hotel }) {
  if (!hotel) return null

  return (
    <Card className="border-brand-200 bg-brand-50/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              {hotel.name}
              <span className="text-xs font-normal text-muted-foreground">· {hotel.type}</span>
            </h4>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {hotel.address}
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                {hotel.rating}
              </span>
              <span className="flex items-center gap-1">
                <Banknote className="h-3.5 w-3.5" />
                {hotel.price_range}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{hotel.distance}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
