import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { Compass, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Timeline } from "@/components/generative-ui/timeline"
import { pythonBackend } from "@/lib/api/python-backend"
import type { TripPlan } from "@/lib/types"

export default function Share() {
  const { token } = useParams<{ token: string }>()
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    pythonBackend.getSharedTrip(token!).then((res) => {
      if (res.success && res.trip_data) { setPlan(res.trip_data as unknown as TripPlan) }
      else { setError("该分享链接无效或已过期") }
    }).catch(() => setError("获取分享数据失败")).finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center min-h-[calc(100vh-128px)]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (error || !plan) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <Compass className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      <p className="text-muted-foreground mb-4">{error || "行程未找到"}</p>
      <Link to="/"><Button>返回首页</Button></Link>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-8"><p className="text-sm text-muted-foreground">通过 TripBuddy 分享的旅行计划</p></div>
      <Timeline data={{ data: plan }} editable={false} />
    </div>
  )
}
