const PYTHON_BACKEND_URL = import.meta.env.VITE_PYTHON_BACKEND_URL || ""

// Read token directly from zustand persist storage — no module variable needed
export function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem("trip-auth-storage")
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.state?.token ?? null
    }
  } catch {
    return null
  }
  return null
}

type RequestOptions = RequestInit & {
  /** 登录/注册等本身就会出现 401 的请求：不要当作"会话过期"处理 */
  skipAuthRedirect?: boolean
}

/** 从 FastAPI 错误体中取出可读文案（detail 可能是字符串或校验错误数组） */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === "string" && detail) return detail
    if (Array.isArray(detail)) {
      const first = detail.find((d) => d && typeof d === "object" && "msg" in d)
      if (first) return String((first as { msg: unknown }).msg)
    }
  }
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return `HTTP ${status}`
}

export function budgetLevelToPriceCeiling(level: string): string {
  switch (level) {
    case "budget":
      return "300"
    case "luxury":
      return "1200"
    case "comfort":
    default:
      return "500"
  }
}

export function budgetLevelToAccommodation(level: string): string {
  switch (level) {
    case "budget":
      return "经济型酒店"
    case "luxury":
      return "豪华酒店"
    case "comfort":
    default:
      return "舒适型酒店"
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthRedirect = false, ...fetchOptions } = options
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string> || {}),
  }

  const token = getAuthToken()
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)

    // 401 有两种含义：会话过期，或"用户名/密码错误"。
    // 后者由登录/注册自己处理（传 skipAuthRedirect），不能触发登出跳转。
    if (res.status === 401 && !skipAuthRedirect) {
      // 走 store 的 logout，它会同时清理行程 store；
      // 只 removeItem auth key 会残留 trip-planner-storage 造成换账号串号。
      const { useAuthStore } = await import("@/lib/store/auth-store")
      useAuthStore.getState().logout()
      window.location.href = "/login"
      throw new Error("登录已过期，请重新登录")
    }

    throw new Error(extractErrorMessage(body, res.status))
  }

  return res.json()
}

export const pythonBackend = {
  // Auth
  getProfile: () =>
    request<{ success: boolean; username?: string; nickname?: string; phone?: string; phone_verified?: boolean; avatar_url?: string; message?: string }>("/api/auth/profile"),

  login: (username: string, password: string) =>
    request<{ success: boolean; token?: string; username?: string; nickname?: string; avatar_url?: string; message: string }>(
      "/api/auth/login",
      // 密码错误时后端返回 401，这是业务错误而非会话过期，不能触发登出跳转
      { method: "POST", body: JSON.stringify({ username, password }), skipAuthRedirect: true }
    ),

  register: (username: string, password: string) =>
    request<{ success: boolean; token?: string; username?: string; message: string }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }), skipAuthRedirect: true }
    ),

  updateProfile: (data: { username: string; nickname?: string; avatar_url?: string | null }) =>
    request<{ success: boolean; token?: string; message: string }>(
      "/api/auth/profile",
      { method: "PUT", body: JSON.stringify(data) }
    ),

  changePassword: (data: { new_password: string }) =>
    request<{ success: boolean; message: string }>(
      "/api/auth/change-password",
      { method: "POST", body: JSON.stringify(data) }
    ),

  sendCode: (phone: string) =>
    request<{ success: boolean; message?: string; phone?: string }>(
      "/api/auth/send-code",
      { method: "POST", body: JSON.stringify({ phone }) }
    ),

  bindPhone: (phone: string, code: string) =>
    request<{ success: boolean; message?: string; phone?: string }>(
      "/api/auth/bind-phone",
      { method: "POST", body: JSON.stringify({ phone, code }) }
    ),

  // Trip
  planTrip: (intent: Record<string, unknown>) =>
    request<{ success: boolean; data?: Record<string, unknown>; message?: string }>(
      "/api/mcp/trip/plan",
      { method: "POST", body: JSON.stringify(intent) }
    ),

  searchTransportation: (params: Record<string, unknown>) =>
    request<{ success: boolean; data?: unknown; message?: string }>(
      "/api/mcp/transportation",
      { method: "POST", body: JSON.stringify(params) }
    ),

  searchPois: (params: Record<string, unknown>) =>
    request<{ success: boolean; data?: unknown; message?: string }>(
      "/api/mcp/recommend-attractions",
      { method: "POST", body: JSON.stringify(params) }
    ),

  recommendHotels: (params: Record<string, unknown>) =>
    request<{ success: boolean; data?: unknown; message?: string }>(
      "/api/mcp/recommend-hotels",
      { method: "POST", body: JSON.stringify(params) }
    ),

  // History
  getHistory: () =>
    request<{ success: boolean; total: number; items: unknown[] }>("/api/history"),

  deleteTrip: (tripId: number) =>
    request<{ success: boolean; message: string }>(
      `/api/history/${tripId}`,
      { method: "DELETE" }
    ),

  saveTrip: (tripData: unknown) =>
    request<{ success: boolean; message: string }>(
      "/api/trip/select",
      { method: "POST", body: JSON.stringify({ trip_data: tripData }) }
    ),

  updateTrip: (tripId: number, tripData: unknown) =>
    request<{ success: boolean; message: string }>(
      `/api/history/${tripId}`,
      { method: "PUT", body: JSON.stringify({ trip_data: tripData }) }
    ),

  // Share
  shareTrip: (tripData: unknown) =>
    request<{ success: boolean; token?: string; url?: string; share_url?: string }>(
      "/api/share",
      { method: "POST", body: JSON.stringify({ trip_data: tripData }) }
    ),

  getSharedTrip: (token: string) =>
    request<{ success: boolean; data?: Record<string, unknown>; trip_data?: Record<string, unknown> }>(`/api/share/${token}`),

  sendChat: (data: { messages: { role: "user" | "assistant"; content: string }[]; conversation_id?: number }) =>
    request<{ success: boolean; data?: string; conversation_id?: number; message?: string }>(
      "/api/mcp/chat",
      { method: "POST", body: JSON.stringify(data) }
    ),

  listConversations: () =>
    request<{ success: boolean; conversations: { id: number; title: string; created_at: string; updated_at: string; message_count: number }[] }>("/api/mcp/conversations"),

  getMessages: (conversationId: number) =>
    request<{ success: boolean; messages: { role: string; content: string; created_at: string }[] }>(`/api/mcp/conversations/${conversationId}/messages`),

  deleteConversation: (conversationId: number) =>
    request<{ success: boolean; message: string }>(`/api/mcp/conversations/${conversationId}`, { method: "DELETE" }),
}
