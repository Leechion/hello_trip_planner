import { useEffect, useRef, useState, useCallback } from "react"
import { X, MessageSquare, Compass, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ConversationDrawer } from "@/components/chat/conversation-drawer"
import { pythonBackend } from "@/lib/api/python-backend"
import { useUiStore } from "@/lib/store/ui-store"
import { GenerativeMessage } from "@/components/chat/generative-message"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectRequestRef = useRef(0)
  const setChatOpen = useUiStore((s) => s.setChatOpen)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const handleNewChat = () => {
    setActiveConvId(null)
    setMessages([])
    setInput("")
    setShowDrawer(false)
  }

  const handleSelectConv = async (convId: number) => {
    // 请求序号防护:快速连点会话 A/B 时,旧响应不能覆盖新选择
    const requestId = ++selectRequestRef.current
    try {
      const res = await pythonBackend.getMessages(convId)
      if (requestId !== selectRequestRef.current) return
      if (res.success) {
        setMessages(res.messages.map((m) => ({ role: m.role as "user" | "assistant", text: m.content })))
        setActiveConvId(convId)
      } else {
        // 失败时必须清空,否则会继续显示上一个会话的内容,让人误以为点开了新会话
        setMessages([])
        setActiveConvId(null)
      }
    } catch {
      if (requestId === selectRequestRef.current) {
        setMessages([])
        setActiveConvId(null)
      }
    } finally {
      if (requestId === selectRequestRef.current) setShowDrawer(false)
    }
  }

  const addMessage = useCallback((role: "user" | "assistant", text: string) => {
    setMessages((prev) => [...prev, { role, text }])
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    addMessage("user", text)

    const allMsgs = [
      ...messages.slice(-49).map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: text },
    ]

    setLoading(true)
    try {
      const res = await pythonBackend.sendChat({
        messages: allMsgs,
        conversation_id: activeConvId || undefined,
      })
      // 后端失败时返回 success:false + message,不能把它当成 AI 的正常回复
      if (!res?.success) {
        addMessage("assistant", res?.message || "抱歉，AI 暂时不可用。")
        return
      }
      addMessage("assistant", res.data || "抱歉，AI 暂时不可用。")
      if (res.conversation_id) {
        setActiveConvId(res.conversation_id)
      }
    } catch {
      addMessage("assistant", "网络错误，请稍后重试。")
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, activeConvId, addMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="relative w-full bg-card flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b shrink-0">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <MessageSquare className="h-4 w-4 text-brand-600" />TripBuddy 助手
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setShowDrawer(true)}>
            <Compass className="h-3.5 w-3.5 mr-1" />对话历史
          </Button>
          <Button aria-label="关闭旅行助手" variant="ghost" size="icon" onClick={() => setChatOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Conversation drawer overlay */}
      {showDrawer && (
        <div className="absolute inset-0 top-14 z-50 flex pointer-events-none">
          <div className="w-72 shrink-0 pointer-events-auto animate-in slide-in-from-left duration-200" onClick={() => setShowDrawer(false)}>
            <div className="h-full bg-background/95 backdrop-blur p-4">
              <ConversationDrawer
                onNewChat={handleNewChat}
                onSelectConv={handleSelectConv}
                onClose={() => setShowDrawer(false)}
              />
            </div>
          </div>
          <div className="flex-1" />
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 px-4">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">你好！我是 TripBuddy 助手。</p>
            <p className="text-xs mt-1">用自然语言告诉我你的旅行想法，我会帮你分析。</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-brand-100 text-brand-700"
                }`}
              >
                {msg.role === "user" ? "U" : <Compass className="h-3.5 w-3.5" />}
              </div>
              <div
                className={`rounded-2xl px-3.5 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-md max-w-[80%]"
                    : "bg-muted rounded-tl-md max-w-[90%]"
                }`}
              >
                {msg.role === "assistant" ? <GenerativeMessage text={msg.text} /> : msg.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Compass className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-md px-3.5 py-2 bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的旅行想法..."
          rows={1}
          disabled={loading}
          className="min-h-[40px] max-h-[120px] resize-none rounded-xl text-sm"
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" className="h-10 w-10 shrink-0 rounded-xl">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
