import { useEffect, useState, lazy, Suspense } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Compass, Calendar, MapPin, Clock, Pencil,
  ArrowLeft, Loader2, Settings, Trash2,
  Star, Eye, ExternalLink, ChevronRight, MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { pythonBackend } from "@/lib/api/python-backend"
import { useAuthStore } from "@/lib/store/auth-store"
import type { TripHistoryItem, ConversationItem } from "@/lib/types"

const ProfileDialog = lazy(() => import("@/components/layout/profile-dialog").then((m) => ({ default: m.ProfileDialog })))

const backendUrl = import.meta.env.VITE_PYTHON_BACKEND_URL || ""
const avatarUrl = (url?: string | null) => url?.startsWith("/") ? `${backendUrl}${url}` : url

export default function Profile() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const avatarRaw = useAuthStore((s) => s.avatarUrl)
  const username = useAuthStore((s) => s.username)
  const phoneVerified = useAuthStore((s) => s.phoneVerified)
  const loadProfile = useAuthStore((s) => s.loadProfileFromBackend)

  const [profile, setProfile] = useState({ nickname: "", phone: "", phoneVerified: false })
  const [history, setHistory] = useState<TripHistoryItem[]>([])
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (!isLoggedIn) { navigate("/login"); return }
    Promise.all([
      loadProfile().then(() => {
        setProfile({
          nickname: useAuthStore.getState().nickname || "",
          phone: useAuthStore.getState().phone || "",
          phoneVerified: useAuthStore.getState().phoneVerified,
        })
      }).catch(() => {}),
      pythonBackend.getHistory().then((res) => {
        if (res.success) setHistory(res.items as TripHistoryItem[])
      }).catch(() => {}),
      pythonBackend.listConversations().then((res) => {
        if (res.success) setConversations(res.conversations)
      }).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [isLoggedIn])

  const stats = history.length > 0 ? {
    totalTrips: history.length,
    cities: new Set(history.map(h => h.city)).size,
    totalDays: history.reduce((sum, h) => sum + h.travel_days, 0),
  } : { totalTrips: 0, cities: 0, totalDays: 0 }

  const handleDeleteTrip = async (id: number) => {
    if (!window.confirm("确定要删除这条旅行记录吗？")) return
    setDeletingId(id)
    try {
      await pythonBackend.deleteTrip(id)
      setHistory(prev => prev.filter(h => h.id !== id))
    } catch { alert("删除失败") }
    finally { setDeletingId(null) }
  }

  return (
    <>
      <div className="travel-workspace max-w-3xl space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-heading font-medium tracking-tight">个人中心</h1>
            <p className="text-sm text-muted-foreground">管理你的账户和旅行记录</p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-brand-400 to-brand-600" />
          <CardContent className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-8">
              <div className="relative group shrink-0">
                {avatarRaw ? (
                  <img src={avatarUrl(avatarRaw) ?? undefined} className="h-20 w-20 rounded-full object-cover border-4 border-background shadow-md" alt="avatar" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center text-3xl font-bold border-4 border-background shadow-md">
                    {(profile.nickname || username || "U")[0].toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => setProfileOpen(true)}
                  className="absolute -bottom-1 -right-1 h-7 w-7 bg-background rounded-full shadow-md flex items-center justify-center hover:bg-muted transition-colors border"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1 pb-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold truncate">{profile.nickname || username}</h2>
                  {phoneVerified && <Badge variant="secondary" className="text-[11px] h-4 rounded-full">已验证</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">@{username}</p>
              </div>
            </div>
          </CardContent>
          <div className="px-6 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>手机: {profile.phone || "未绑定"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-3.5 w-3.5 shrink-0" />
                <span className={phoneVerified ? "text-emerald-600 font-medium" : ""}>
                  {phoneVerified ? "已绑定手机号" : "可绑定手机号"}
                </span>
              </div>
            </div>
          </div>
          <div className="px-6 pb-5 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setProfileOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />编辑资料
            </Button>
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Compass, value: stats.totalTrips, label: "旅行次数" },
            { icon: MapPin, value: stats.cities, label: "去过城市" },
            { icon: Clock, value: stats.totalDays, label: "旅行天数" },
          ].map(({ icon: Icon, value, label }) => (
            <Card key={label} className="text-center py-4">
              <CardContent className="p-0">
                <div className="mx-auto h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mb-1.5">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">最近行程</h3>
            <Link to="/history">
              <Button variant="ghost" size="sm" className="text-xs h-7">查看全部 <ExternalLink className="h-3 w-3 ml-1" /></Button>
            </Link>
          </div>

          {loading ? (
            [1, 2].map(i => (
              <Card key={i}>
                <CardContent className="p-4 flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : history.length > 0 ? (
            history.slice(0, 5).map((item) => (
              <Card key={item.id} className="hover:border-brand-200 hover:shadow-sm transition-all group">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{item.city}</h4>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <Calendar className="h-3 w-3" />{item.start_date} ~ {item.end_date}
                      <span className="mx-0.5">·</span>
                      <Clock className="h-3 w-3" />{item.travel_days}天
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link to={`/history/${item.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTrip(item.id)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm">还没有旅行记录</p>
                <Link to="/" className="inline-block mt-3">
                  <Button size="sm" className="rounded-full text-sm">开始规划</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">最近对话</h3>
            <Link to="/conversations">
              <Button variant="ghost" size="sm" className="text-xs h-7">查看全部 <ExternalLink className="h-3 w-3 ml-1" /></Button>
            </Link>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ) : conversations.length > 0 ? (
            conversations.slice(0, 3).map((conv) => (
              <Link key={conv.id} to={`/chat/${conv.id}`}>
                <Card className="hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer group">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{conv.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(conv.updated_at).toLocaleDateString("zh-CN")}</p>
                    </div>
                    <Badge variant="secondary" className="text-[11px] rounded-full">
                      {conv.message_count} 条
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm">还没有对话记录</p>
                <Link to="/" className="inline-block mt-3">
                  <Button size="sm" className="rounded-full text-sm">开始聊天</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="divide-y">
          {[
            { icon: Settings, label: "偏好设置", desc: "旅行偏好与个性化推荐" },
            { icon: MapPin, label: "我的收藏", desc: "收藏的景点和目的地" },
            { icon: Compass, label: "离线地图", desc: "下载地图供离线使用" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </Card>

        <p className="text-center text-xs text-muted-foreground py-4">TripBuddy v1.0</p>
      </div>

      {profileOpen && (
        <Suspense fallback={null}>
          <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
        </Suspense>
      )}
    </>
  )
}