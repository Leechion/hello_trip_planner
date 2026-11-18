import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Loader2, Trash2, Clock, AlertCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { pythonBackend } from "@/lib/api/python-backend"

interface ConvItem {
  id: number
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export default function ConversationHistory() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    pythonBackend.listConversations().then((res) => {
      if (res.success) setItems(res.conversations)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定删除这段对话？")) return
    setDeletingId(id)
    try {
      await pythonBackend.deleteConversation(id)
      setItems((prev) => prev.filter((c) => c.id !== id))
    } catch {
      alert("删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {loading
        ? [1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </CardContent>
            </Card>
          ))
        : items.length > 0 ? (
            items.map((item) => (
              <Card
                key={item.id}
                className="hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer group"
                onClick={() => navigate(`/chat/${item.id}`)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleDateString("zh-CN")}</p>
                  </div>
                  <Badge variant="secondary" className="text-[11px] h-4 rounded-full">
                    {item.message_count} 条
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">还没有对话记录</p>
              <p className="text-xs mt-1">打开助手开始聊天</p>
            </div>
          )}
    </div>
  )
}