import { useState, Suspense } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, User, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/lib/store/auth-store"
import { pythonBackend } from "@/lib/api/python-backend"
import journeyLandscape from "@/assets/journey-landscape.svg"

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
})
const registerSchema = z.object({
  username: z.string().min(2, "用户名至少2个字符").max(64),
  password: z.string().min(6, "密码至少6个字符").max(128),
})

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "操作失败"
}

function LoginFormContent() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get("tab") || "login")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const authLogin = useAuthStore((s) => s.login)
  const loadProfile = useAuthStore((s) => s.loadProfileFromBackend)

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const handleLogin = async (data: LoginForm) => {
    setError(""); setLoading(true)
    try {
      const res = await pythonBackend.login(data.username, data.password)
      if (res.success && res.token) {
        authLogin(res.token, res.username || data.username, res.nickname, res.avatar_url)
        loadProfile().catch(() => {})
        navigate("/")
      }
      else { setError(res.message || "登录失败") }
    } catch (error: unknown) { setError(getErrorMessage(error)) }
    finally { setLoading(false) }
  }

  const handleRegister = async (data: RegisterForm) => {
    setError(""); setLoading(true)
    try {
      const res = await pythonBackend.register(data.username, data.password)
      if (res.success && res.token) { authLogin(res.token, res.username || data.username); navigate("/") }
      else { setError(res.message || "注册失败") }
    } catch (error: unknown) { setError(getErrorMessage(error)) }
    finally { setLoading(false) }
  }

  const isLogin = tab === "login"

  return (
    <div className="auth-shell">
      <div className="auth-art">
        <div><span className="editorial-label">Your next chapter begins here</span><h2>总有一段风景，<br />值得为它出发。</h2><p className="text-sm text-muted-foreground leading-7 mt-4">把旅行的期待，留给远方。<br />把规划的细节，交给 TripBuddy。</p></div>
        <img src={journeyLandscape} alt="山峦、古塔和旅途的风景插画" />
        <span className="editorial-label mt-5">TripBuddy / 旅行手记</span>
      </div>
      <div className="auth-form">
        {/* Header */}
        <div className="mb-8">
          <p className="editorial-label mb-4">{isLogin ? "Welcome back, traveler" : "A new journey awaits"}</p>
          <h1 className="text-[32px] font-heading font-medium tracking-[-0.02em] text-foreground mb-2">
            {isLogin ? "欢迎回来" : "创建账户"}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {isLogin ? "登录你的 TripBuddy 账户" : "开始用 AI 规划你的下一次旅行"}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex p-1 mb-6 rounded-xl bg-muted/60">
          <button
            onClick={() => { setTab("login"); setError("") }}
            className={`flex-1 py-2.5 rounded-[10px] text-[15px] font-semibold transition-all duration-200 ${
              isLogin ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            登录
          </button>
          <button
            onClick={() => { setTab("register"); setError("") }}
            className={`flex-1 py-2.5 rounded-[10px] text-[15px] font-semibold transition-all duration-200 ${
              !isLogin ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            注册
          </button>
        </div>

        {/* Form */}
        <div className="pt-2">
          {isLogin ? (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="h-11 pl-10 pr-4 text-[15px] rounded-xl" placeholder="用户名" {...loginForm.register("username")} />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="h-11 pl-10 pr-4 text-[15px] rounded-xl" type="password" placeholder="密码" {...loginForm.register("password")} />
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
              <Button type="submit" className="w-full h-11 text-[15px] rounded-xl" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                登录
              </Button>
            </form>
          ) : (
            <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="h-11 pl-10 pr-4 text-[15px] rounded-xl" placeholder="用户名（2-64个字符）" {...registerForm.register("username")} />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="h-11 pl-10 pr-4 text-[15px] rounded-xl" type="password" placeholder="密码（至少6个字符）" {...registerForm.register("password")} />
              </div>
              {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
              <Button type="submit" className="w-full h-11 text-[15px] rounded-xl" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                注册
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  )
}
