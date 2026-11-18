import { Suspense, lazy } from "react"
import { Outlet } from "react-router-dom"
import { Header } from "@/components/layout/header"
import { useUiStore } from "@/lib/store/ui-store"

const ChatPanel = lazy(() => import("@/components/chat/chat-panel").then(m => ({ default: m.ChatPanel })))

export default function Layout() {
  const chatOpen = useUiStore((s) => s.chatOpen)

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1 min-w-0">
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
        {chatOpen && (
          <aside className="assistant-drawer" aria-label="TripBuddy 旅行助手">
            <Suspense fallback={<div role="status" className="h-full flex items-center justify-center text-sm text-muted-foreground">正在打开旅行助手…</div>}>
              <ChatPanel />
            </Suspense>
          </aside>
        )}
      </div>
    </div>
  )
}
