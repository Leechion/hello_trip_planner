import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { pythonBackend } from "@/lib/api/python-backend"
import { useAuthStore } from "@/lib/store/auth-store"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

export default function ChatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const convId = Number(id)
  // /chat/abc 会得到 NaN，直接请求会变成 /conversations/NaN 触发 422 并显示空白页
  if (!id || !Number.isFinite(convId)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="font-medium">对话地址无效</p>
        <Button variant="outline" size="sm" onClick={() => window.location.assign("/conversations")}>
          返回对话列表
        </Button>
      </div>
    )
  }
  return <ChatDetail key={id} convId={convId} />
}

function ChatDetail({ convId }: { convId: number }) {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoggedIn) { navigate("/login"); return }
    let cancelled = false
    pythonBackend.getMessages(convId).then((res) => {
      if (cancelled) return
      if (res.success) {
        setMessages(res.messages.map((m) => ({ role: m.role as "user" | "assistant", text: m.content })))
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [convId, isLoggedIn, navigate])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput("")
    setMessages((prev) => [...prev, { role: "user", text }])
    setSending(true)

    const allMsgs = [
      ...messages.slice(-49).map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: text },
    ]

    try {
      const res = await pythonBackend.sendChat({
        messages: allMsgs,
        conversation_id: convId,
      })
      // 后端失败时返回 success:false + message,不能把它当成 AI 的正常回复
      if (!res?.success) {
        setMessages((prev) => [...prev, { role: "assistant", text: res?.message || "抱歉，AI 暂时不可用。" }])
        return
      }
      setMessages((prev) => [...prev, { role: "assistant", text: res.data || "抱歉，AI 暂时不可用。" }])
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "网络错误，请稍后重试。" }])
    } finally {
      setSending(false)
    }
  }, [input, sending, messages, convId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-4 flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      <div className="px-4 pb-3 flex items-center gap-2 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-sm">对话详情</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-brand-100 text-brand-700"}`}>
              {msg.role === "user" ? "U" : ""}
            </div>
            <div className={`rounded-2xl px-3.5 py-2 text-sm max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-md" : "bg-muted rounded-tl-md"}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="回复..."
          rows={1}
          disabled={sending}
          className="min-h-[40px] max-h-[120px] resize-none rounded-xl text-sm"
        />
        <Button onClick={sendMessage} disabled={sending || !input.trim()} size="icon" className="h-10 w-10 shrink-0 rounded-xl">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}