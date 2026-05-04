"use client"

import { useEffect } from "react"

import { NEXT_STORAGE_KEY } from "@/components/sign-in-button"

export function AuthFinish() {
  useEffect(() => {
    if (typeof window === "undefined") return
    let next = "/"
    try {
      const stashed = sessionStorage.getItem(NEXT_STORAGE_KEY)
      if (stashed && stashed.startsWith("/")) next = stashed
      sessionStorage.removeItem(NEXT_STORAGE_KEY)
    } catch {
      /* private mode — just go home */
    }
    window.location.replace(next)
  }, [])

  return null
}
