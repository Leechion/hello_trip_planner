import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Calendar, MapPin, Clock, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { pythonBackend } from "@/lib/api/python-backend"
import { useAuthStore } from "@/lib/store/auth-store"
import type { TripHistoryItem } from "@/lib/types"

export default function History() {
  const [items, setItems] = useState<TripHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  useEffect(() => {
    if (!isLoggedIn) return
    pythonBackend.getHistory().then((res) => {
      if (res.success) setItems(res.items as TripHistoryItem[])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [isLoggedIn])

  if (!isLoggedIn) return <div className="flex items-center justify-center min-h-[calc(100vh-128px)]"><p className="text-muted-foreground">请先登录</p></div>

  if (loading) {
    return (
      <div className="travel-workspace space-y-4">
        {[1,2,3].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-32 mb-2" /><Skeleton className="h-4 w-64" /></CardContent></Card>)}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>还没有旅行记录</p>
        <Link to="/"><Button className="mt-4">开始规划</Button></Link>
      </div>
    )
  }

  return (
    <div className="travel-workspace">
      <div className="workspace-hero-compact"><div><span className="editorial-label">The places we keep</span><h1>走过的路，值得珍藏。</h1><p className="text-sm text-muted-foreground mt-3">你的每一段旅行，都在这里。</p></div></div>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((item) => (
          <Link key={item.id} to={`/history/${item.id}`}>
            <Card className="hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><MapPin className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-semibold">{item.city}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />{item.start_date} ~ {item.end_date}
                      <span className="mx-1">·</span><Clock className="h-3.5 w-3.5" />{item.travel_days}天
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
