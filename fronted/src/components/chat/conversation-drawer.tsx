import { useEffect, useState } from "react"
import { Loader2, Trash2, Clock, MessageSquare, PlusCircle, List, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { pythonBackend } from "@/lib/api/python-backend"

interface ConvItem {
  id: number
  title: string
  updated_at: string
  message_count: number
}

export function ConversationDrawer({
  onNewChat,
  onSelectConv,
  onClose,
}: {
  onNewChat: () => void
  onSelectConv: (id: number) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    pythonBackend
      .listConversations()
      .then((res) => {
        if (res.success) setItems(res.conversations)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
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
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <List className="h-4 w-4 text-brand-600" />对话历史
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="关闭对话历史">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 py-3 border-b">
          <Button onClick={onNewChat} className="w-full gap-2" size="sm">
            <PlusCircle className="h-4 w-4" />新建会话
          </Button>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3 border-b last:border-b-0">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3 bg-muted rounded-full w-3/4 animate-pulse" />
                    <div className="h-2 bg-muted rounded-full w-1/2 animate-pulse" />
                  </div>
                </div>
              ))
            : items.length > 0 ? (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex items-center gap-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => onSelectConv(item.id)}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleDateString("zh-CN")}</p>
                    </div>
                    <Badge variant="secondary" className="text-[11px] shrink-0">
                      {item.message_count} 条
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(item.id)
                      }}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">还没有对话记录</p>
                </div>
              )}
        </div>
      </CardContent>
    </Card>
  )
}