import { useState, useEffect } from "react"
import { Camera, Loader2, X, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/lib/store/auth-store"
import { pythonBackend } from "@/lib/api/python-backend"

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { username, nickname, avatarUrl: rawAvatar, token, updateProfile, phone, phoneVerified } = useAuthStore()
  const backendUrl = import.meta.env.VITE_PYTHON_BACKEND_URL || ""
  const avatarUrl = rawAvatar?.startsWith("/") ? `${backendUrl}${rawAvatar}` : rawAvatar

  const [editUsername, setEditUsername] = useState(username || "")
  const [editNickname, setEditNickname] = useState(nickname || "")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const fileRef = { current: null as HTMLInputElement | null }
  const [phoneInput, setPhoneInput] = useState("")
  const [codeInput, setCodeInput] = useState("")
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)
  const [sendCodeTimer, setSendCodeTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwdLoading, setPwdLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setEditUsername(username || "")
      setEditNickname(nickname || "")
      setPhoneInput("")
      setCodeInput("")
      setNewPassword("")
      setConfirmPassword("")
      setMsg(null)
    }
    return () => {
      if (sendCodeTimer) clearTimeout(sendCodeTimer)
    }
  }, [open])

  useEffect(() => {
    if (codeCountdown <= 0) return
    const t = setTimeout(() => setCodeCountdown(p => p - 1), 1000)
    return () => clearTimeout(t)
  }, [codeCountdown])

  const show = (type: "ok" | "err", text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000) }

  const handleSaveProfile = async () => {
    if (!editUsername || editUsername.length < 2) { show("err", "用户名至少2个字符"); return }
    setLoading(true)
    try {
      const res = await pythonBackend.updateProfile({
        username: editUsername,
        nickname: editNickname,
        avatar_url: rawAvatar,
      })
      if (res.success) {
        updateProfile({ username: editUsername, nickname: editNickname })
        show("ok", "资料已保存")
      } else { show("err", res.message || "保存失败") }
    } catch { show("err", "保存失败") }
    finally { setLoading(false) }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !token) return
    setLoading(true)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch(`${backendUrl}/api/auth/avatar`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (!res.ok) { show("err", `上传失败 (${res.status})`); return }
      const json = await res.json()
      if (json.success) { updateProfile({ avatarUrl: json.avatar_url }); show("ok", "头像已更新"); e.target.value = "" }
      else { show("err", json.detail || "上传失败") }
    } catch { show("err", "网络错误") }
    finally { setLoading(false) }
  }

  const handleSendCode = async () => {
    if (!/^1\d{10}$/.test(phoneInput)) { show("err", "请输入正确的11位手机号"); return }
    try {
      const res = await pythonBackend.sendCode(phoneInput)
      if (res.success) {
        show("ok", "验证码已发送")
        setCodeCountdown(60)
        setSendCodeTimer(setTimeout(() => setCodeCountdown(0), 60000))
      } else { show("err", res.message || "发送失败") }
    } catch { show("err", "网络错误") }
  }

  const handleBindPhone = async () => {
    if (!/^1\d{10}$/.test(phoneInput)) { show("err", "请输入正确的11位手机号"); return }
    if (!codeInput) { show("err", "请输入验证码"); return }
    setPhoneLoading(true)
    try {
      const res = await pythonBackend.bindPhone(phoneInput, codeInput)
      if (res.success) {
        updateProfile({ phone: phoneInput, phoneVerified: true })
        show("ok", "手机号绑定成功")
        setPhoneInput("")
        setCodeInput("")
      } else { show("err", res.message || "绑定失败") }
    } catch { show("err", "网络错误") }
    finally { setPhoneLoading(false) }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { show("err", "密码至少6个字符"); return }
    if (newPassword !== confirmPassword) { show("err", "两次密码不一致"); return }
    setPwdLoading(true)
    try {
      const res = await pythonBackend.changePassword({ new_password: newPassword })
      if (res.success) { setNewPassword(""); setConfirmPassword(""); show("ok", "密码已修改") }
      else { show("err", res.message || "修改失败") }
    } catch { show("err", "修改失败") }
    finally { setPwdLoading(false) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[380px] bg-background rounded-2xl shadow-2xl border overflow-hidden max-h-[90vh] flex flex-col">

          <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
            <h2 className="font-bold">个人中心</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col items-center mb-5">
              <div className="relative group cursor-pointer mb-2" onClick={() => fileRef.current?.click()}>
                {avatarUrl ? (
                  <img src={avatarUrl} className="h-20 w-20 rounded-full object-cover border-2 border-background shadow-md" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-3xl font-bold border-2 border-background shadow-md">
                    {(nickname || username || "U")[0].toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </div>
              <input ref={fileRef as { current: HTMLInputElement | null }} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
              <p className="font-semibold">{nickname || username}</p>
              <p className="text-xs text-muted-foreground">@{username}</p>
            </div>

            <div className="space-y-3 mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">编辑资料</p>
              <Input className="h-9 rounded-lg text-sm" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="用户名" />
              <Input className="h-9 rounded-lg text-sm" value={editNickname} onChange={(e) => setEditNickname(e.target.value)} placeholder="昵称（选填）" />
              <Button className="w-full h-9 text-sm rounded-lg" onClick={handleSaveProfile} disabled={loading}>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}保存资料
              </Button>
            </div>

            <div className="w-full border-t mb-5" />

            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">手机号</p>
                <span className={`text-xs ${phoneVerified ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {phoneVerified ? "已绑定" : "未绑定"}
                </span>
              </div>
              {phoneVerified ? (
                <div className="flex items-center gap-2">
                  <Input value={`1${(phone || "").slice(-4) || "0000"}`} readOnly className="h-9 rounded-lg text-sm bg-muted/30" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Input className="h-9 rounded-lg text-sm pr-20" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="11位手机号" />
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-[28px] text-xs rounded-md px-2"
                      onClick={handleSendCode}
                      disabled={codeCountdown > 0 || phoneLoading}
                    >
                      {codeCountdown > 0 ? `${codeCountdown}s` : "验证码"}
                    </Button>
                  </div>
                  <Input className="h-9 rounded-lg text-sm" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="短信验证码" />
                  <Button className="w-full h-9 text-sm rounded-lg" onClick={handleBindPhone} disabled={phoneLoading}>
                    {phoneLoading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}绑定手机号
                  </Button>
                </div>
              )}
            </div>

            <div className="w-full border-t mb-5" />

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">修改密码</p>
              {phoneVerified ? (
                <>
                  <div className="relative">
                    <Input className="h-9 rounded-lg text-sm pr-10" type={showNewPwd ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码（至少6位）" />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPwd(!showNewPwd)}>
                      {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="relative">
                    <Input className="h-9 rounded-lg text-sm pr-10" type={showConfirmPwd ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认新密码" />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirmPwd(!showConfirmPwd)}>
                      {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button className="w-full h-9 text-sm rounded-lg" variant="outline" onClick={handleChangePassword} disabled={pwdLoading}>
                    {pwdLoading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}修改密码
                  </Button>
                </>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  绑定手机号后方可修改密码
                </div>
              )}
            </div>
          </div>

          {msg && (
            <div className={`p-3 border-t ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              <p className="text-xs text-center">{msg.text}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}