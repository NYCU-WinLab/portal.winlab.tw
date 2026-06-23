"use client"

import { useEffect } from "react"

// global-error replaces the root layout when the layout itself throws, so it
// must ship its own <html>/<body> and can't rely on globals.css or PortalShell.
// Keep it minimal and inline-styled.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[portal] global error", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#1a1d24",
          background: "#fff",
        }}
      >
        <h1 style={{ fontWeight: 500, fontSize: "1.1rem", margin: 0 }}>
          出了點問題
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#5c636e", margin: 0 }}>
          Portal 載入失敗，請重試。
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#1a1d24",
            color: "#fff",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          重試
        </button>
      </body>
    </html>
  )
}
