"use client"

import { IconNfc } from "@tabler/icons-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { uidToCardNumber } from "@/lib/door/cards"
import type { DoorCardView } from "@/lib/door/cards"
import {
  connectCardReader,
  type CardReaderConnection,
} from "@/lib/door/chameleon"

// One row in the "剛剛感應到" list. A card carries its derived number; the two
// warning kinds carry no number because the card cannot be enrolled.
type Tap =
  | { kind: "card"; cardNumber: string }
  | { kind: "random" }
  | { kind: "unsupported" }

type ReaderStatus = "idle" | "connecting" | "connected" | "error"

// How often to ask the reader what is in the field. An empty field makes the
// scan throw or return nothing, which is normal and swallowed below.
const SCAN_INTERVAL_MS = 500

function tapKey(tap: Tap): string {
  return tap.kind === "card" ? `card:${tap.cardNumber}` : tap.kind
}

// Web Serial is Chromium-only and only exposed over HTTPS. This is browser
// state that does not exist on the server, so it is read through an external
// store: null while server-rendering, a boolean once the client takes over.
// That keeps hydration matching without a setState-in-effect.
function subscribeSerial(): () => void {
  return () => {}
}
function getSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator
}
function getSerialSupportedServer(): null {
  return null
}

export function CardReader({
  cards,
  disabled,
  onEnrol,
  children,
}: {
  cards: DoorCardView[]
  disabled: boolean
  onEnrol: (cardNumber: string) => void
  children: ReactNode
}) {
  const supported = useSyncExternalStore(
    subscribeSerial,
    getSerialSupported,
    getSerialSupportedServer
  )
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ReaderStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [taps, setTaps] = useState<Tap[]>([])

  const connectionRef = useRef<CardReaderConnection | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Guards against a second scan starting before the previous one resolves.
  const scanningRef = useRef(false)

  const handleTag = useCallback((uid: Uint8Array) => {
    const result = uidToCardNumber(uid)
    const tap: Tap = result.ok
      ? { kind: "card", cardNumber: result.cardNumber }
      : { kind: result.reason === "random_uid" ? "random" : "unsupported" }
    setTaps((prev) => {
      const key = tapKey(tap)
      if (prev.some((t) => tapKey(t) === key)) return prev
      return [tap, ...prev]
    })
  }, [])

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const disconnect = useCallback(async () => {
    stopPolling()
    const connection = connectionRef.current
    connectionRef.current = null
    setStatus("idle")
    if (connection) {
      try {
        await connection.disconnect()
      } catch {
        // The port may already be gone if the device was unplugged; nothing
        // useful to tell the admin, and idle is the honest state either way.
      }
    }
  }, [stopPolling])

  // A single scan tick, guarded so only one is ever in flight. No tag in the
  // field is not an error here, so every failure is swallowed and the loop
  // simply tries again on the next tick.
  const poll = useCallback(async () => {
    const connection = connectionRef.current
    if (!connection || scanningRef.current) return
    scanningRef.current = true
    try {
      const tags = await connection.scan()
      for (const tag of tags) handleTag(tag.uid)
    } catch {
      // Empty field or a transient read error, both expected while polling.
    } finally {
      scanningRef.current = false
    }
  }, [handleTag])

  // The click handler itself, so navigator.serial.requestPort() runs inside the
  // user gesture the browser requires.
  const handleConnect = useCallback(async () => {
    setError(null)
    setStatus("connecting")
    try {
      const connection = await connectCardReader()
      connectionRef.current = connection
      setStatus("connected")
      intervalRef.current = setInterval(() => {
        void poll()
      }, SCAN_INTERVAL_MS)
    } catch (err) {
      // A cancelled port picker throws too; treat it as "back to idle" rather
      // than a scary error, but surface a real failure so the admin can react.
      const message = err instanceof Error ? err.message : String(err)
      if (/no port selected|cancel/i.test(message)) {
        setStatus("idle")
      } else {
        setStatus("error")
        setError(message)
      }
    }
  }, [poll])

  useEffect(() => {
    return () => {
      stopPolling()
      const connection = connectionRef.current
      connectionRef.current = null
      if (connection) void connection.disconnect().catch(() => {})
    }
  }, [stopPolling])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {supported === false && (
          <p className="mr-auto text-xs text-muted-foreground">
            感應讀卡需要 Chrome 或 Edge 瀏覽器。
          </p>
        )}
        {supported === true && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((prev) => !prev)}
            disabled={disabled}
          >
            <IconNfc className="size-4" />
            感應讀卡
          </Button>
        )}
        {children}
      </div>

      {supported === true && open && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConnectionState status={status} error={error} />
            {status === "connected" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void disconnect()}
              >
                中斷
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void handleConnect()}
                disabled={status === "connecting"}
              >
                {status === "connecting" ? "連線中…" : "連線讀卡機"}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              剛剛感應到
            </p>
            {taps.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {status === "connected"
                  ? "把卡片靠上讀卡機，卡號就會出現在這裡。"
                  : "先連線讀卡機，再感應卡片。"}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {taps.map((tap) => (
                  <TapRow
                    key={tapKey(tap)}
                    tap={tap}
                    cards={cards}
                    disabled={disabled}
                    onEnrol={onEnrol}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectionState({
  status,
  error,
}: {
  status: ReaderStatus
  error: string | null
}) {
  if (status === "error")
    return (
      <span className="text-sm text-destructive">
        錯誤：{error ?? "讀卡機連線失敗"}
      </span>
    )
  const label =
    status === "connected"
      ? "已連線，請感應卡片"
      : status === "connecting"
        ? "連線中…"
        : "未連線"
  return <span className="text-sm text-muted-foreground">{label}</span>
}

function TapRow({
  tap,
  cards,
  disabled,
  onEnrol,
}: {
  tap: Tap
  cards: DoorCardView[]
  disabled: boolean
  onEnrol: (cardNumber: string) => void
}) {
  if (tap.kind === "random")
    return (
      <li className="px-3 py-2 text-sm text-destructive">
        這張卡每次感應號碼都會變（隨機 UID），無法登錄。
      </li>
    )
  if (tap.kind === "unsupported")
    return (
      <li className="px-3 py-2 text-sm text-destructive">
        此卡不是 4-byte UID，無法對應門禁卡號。
      </li>
    )

  const enrolled = cards.find((card) => card.card_id === tap.cardNumber)
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="font-mono text-sm tabular-nums">{tap.cardNumber}</span>
      {enrolled ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {enrolled.holder_name}
          <Badge variant="secondary" className="text-xs">
            已在名單
          </Badge>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onEnrol(tap.cardNumber)}
        >
          登錄
        </Button>
      )}
    </li>
  )
}
