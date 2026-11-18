import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Timeline } from "@/components/generative-ui/timeline"
import { pythonBackend } from "@/lib/api/python-backend"
import { useTripStore } from "@/lib/store/trip-store"
import type { TripPlan } from "@/lib/types"

export default function HistoryDetail() {
  const { id } = useParams<{ id: string }>()
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const setItinerary = useTripStore((s) => s.setItinerary)

  useEffect(() => {
    pythonBackend.getHistory().then((res) => {
      if (res.success) {
        const item = (res.items as any[])?.find((i: any) => String(i.id) === id)
        if (item?.trip_data) { setPlan(item.trip_data as TripPlan); setItinerary(item.trip_data as TripPlan) }
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center min-h-[calc(100vh-128px)]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (!plan) return <div className="max-w-3xl mx-auto px-4 py-12 text-center"><p className="text-muted-foreground">行程未找到</p><Link to="/history"><Button className="mt-4">返回历史</Button></Link></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/history"><Button variant="ghost" size="sm" className="mb-6"><ArrowLeft className="h-4 w-4 mr-1.5" />返回历史</Button></Link>
      <Timeline data={{ data: plan }} tripId={Number(id)} />
    </div>
  )
}
