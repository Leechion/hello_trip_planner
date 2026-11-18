import { create } from "zustand"
import { persist } from "zustand/middleware"
import { pythonBackend } from "@/lib/api/python-backend"
import { useTripStore } from "@/lib/store/trip-store"

interface AuthState {
  token: string | null
  username: string | null
  nickname: string | null
  avatarUrl: string | null
  phone: string | null
  phoneVerified: boolean
  createdAt: string | null
  isLoggedIn: boolean

  login: (token: string, username: string, nickname?: string, avatarUrl?: string) => void
  logout: () => void
  updateProfile: (data: { username?: string; nickname?: string; avatarUrl?: string; phone?: string | null; phoneVerified?: boolean }) => void
  loadFromStorage: () => void
  loadProfileFromBackend: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      nickname: null,
      avatarUrl: null,
      phone: null,
      phoneVerified: false,
      createdAt: null,
      isLoggedIn: false,

      login: (token, username, nickname, avatarUrl) => {
        set({ token, username, nickname: nickname || username, avatarUrl: avatarUrl || null, phone: null, phoneVerified: false, createdAt: null, isLoggedIn: true })
      },

      logout: () => {
        set({ token: null, username: null, nickname: null, avatarUrl: null, phone: null, phoneVerified: false, createdAt: null, isLoggedIn: false })
        // 清空行程数据，避免换账号后看到上一个用户的行程
        useTripStore.getState().reset()
      },

      updateProfile: (data) => {
        set((state) => ({
          ...state,
          username: data.username ?? state.username,
          nickname: data.nickname ?? state.nickname,
          avatarUrl: data.avatarUrl ?? state.avatarUrl,
          // phone 用显式 key 判断:调用方传 null 表示"确实没有手机号",
          // 若用 ?? 会穿透到旧值,导致解绑后仍显示过期手机号
          phone: "phone" in data ? (data.phone ?? null) : state.phone,
          phoneVerified: data.phoneVerified ?? state.phoneVerified,
        }))
      },

      loadFromStorage: () => {
        void useAuthStore.persist.rehydrate()
      },

      loadProfileFromBackend: async () => {
        const res = await pythonBackend.getProfile()
        if (res.success) {
          useAuthStore.getState().updateProfile({
            username: res.username || undefined,
            avatarUrl: res.avatar_url,
            nickname: (res.nickname as string | undefined) || undefined,
            phone: (res.phone as string | null) || null,
            phoneVerified: !!res.phone_verified,
          })
        }
      },
    }),
    {
      name: "trip-auth-storage",
      skipHydration: true,
    }
  )
)
