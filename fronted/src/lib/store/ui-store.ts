import { create } from "zustand"

interface UiState {
  chatOpen: boolean
  toggleChat: () => void
  setChatOpen: (v: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  chatOpen: false,
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatOpen: (v) => set({ chatOpen: v }),
}))
