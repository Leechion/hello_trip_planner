"use client"

import { useEffect, useState, type ReactNode } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAuthStore } from "@/lib/store/auth-store"
import { useTripStore } from "@/lib/store/trip-store"

export function Providers({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    void Promise.all([
      useAuthStore.persist.rehydrate(),
      useTripStore.persist.rehydrate(),
    ]).finally(() => setHydrated(true))
  }, [])

  // Token is now always read from localStorage by python-backend.ts
  // No need to sync it here

  if (!hydrated) return null

  return <TooltipProvider>{children}</TooltipProvider>
}
