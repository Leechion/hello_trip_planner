import { useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { Compass, History, LogOut, User, ChevronDown, MessageSquare, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/lib/store/auth-store"
import { useTripStore } from "@/lib/store/trip-store"
import { useUiStore } from "@/lib/store/ui-store"

export function Header() {
  const navigate = useNavigate()
  const { isLoggedIn, username, nickname, avatarUrl, logout } = useAuthStore()
  const backendUrl = import.meta.env.VITE_PYTHON_BACKEND_URL || ""
  const avatarSrc = avatarUrl?.startsWith("/") ? `${backendUrl}${avatarUrl}` : avatarUrl
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const resetTrip = useTripStore((s) => s.reset)
  const { chatOpen, toggleChat, setChatOpen } = useUiStore()

  const handleLogout = () => {
    logout()          // 内部已重置行程 store
    setChatOpen(false) // 关闭助手抽屉,否则下个账号会看到上一个账号的对话内容
    navigate("/login")
  }

  return (
    <header className="site-header sticky top-0 z-30 border-b backdrop-blur-xl">
      <div className="site-header-inner flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight" onClick={resetTrip}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/25 text-primary">
            <Compass className="h-5 w-5" />
          </div>
          <span className="brand-wordmark">TripBuddy<span className="hidden md:inline text-[10px] font-sans font-normal tracking-[0.12em] text-muted-foreground ml-3">旅行手记</span></span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          {isLoggedIn ? (
            <>
              <NavLink to="/" end className="nav-link hidden sm:inline-flex">规划旅程</NavLink>
              <NavLink to="/history" className="nav-link hidden sm:inline-flex">旅行记录</NavLink>
              <Button aria-label="打开或关闭旅行助手" variant={chatOpen ? "secondary" : "outline"} size="sm" className="rounded-full h-9 px-3" onClick={toggleChat}>
                <MessageSquare className="h-4 w-4 mr-1.5" /><span className="hidden sm:inline">助手</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium gap-1.5 h-9 hover:bg-muted transition-colors">
                  {avatarSrc && avatarSrc !== failedAvatar ? (
                    <img
                      src={avatarSrc}
                      alt={`${nickname || username || "用户"}的头像`}
                      className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                      onError={() => setFailedAvatar(avatarSrc)}
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                      {(nickname || username || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline text-sm">{nickname || username}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2"><p className="text-sm font-medium">{nickname || username}</p><p className="text-xs text-muted-foreground">@{username}</p></div>
                  <DropdownMenuSeparator />
                  <Link to="/history" className="cursor-pointer w-full"><DropdownMenuItem><History className="h-4 w-4 mr-2" />旅行历史</DropdownMenuItem></Link>
                  <DropdownMenuItem onClick={() => { navigate("/profile") }}><Settings className="h-4 w-4 mr-2" />个人中心</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive"><LogOut className="h-4 w-4 mr-2" />退出登录</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link to="/login"><Button variant="ghost" size="sm"><User className="h-4 w-4 mr-1.5" />登录</Button></Link>
              <Link to="/login?tab=register"><Button size="sm">注册</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
