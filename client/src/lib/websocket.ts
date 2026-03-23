import { useEffect, useRef, useState } from "react"

export type ConnectionStatus = "connecting" | "connected" | "disconnected"

export type TextMessageHandler = (data: Record<string, unknown>) => void
export type BinaryMessageHandler = (data: ArrayBuffer) => void
export type StatusChangeHandler = (status: ConnectionStatus) => void

interface VoiceSocketOptions {
  url: string
  onText: TextMessageHandler
  onBinary: BinaryMessageHandler
  onStatusChange: StatusChangeHandler
}

const RECONNECT_DELAY = 2000

export class VoiceSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private onText: TextMessageHandler
  private onBinary: BinaryMessageHandler
  private onStatusChange: StatusChangeHandler

  constructor(options: VoiceSocketOptions) {
    this.url = options.url
    this.onText = options.onText
    this.onBinary = options.onBinary
    this.onStatusChange = options.onStatusChange
    this.connect()
  }

  connect(): void {
    this.clearReconnectTimer()
    this.onStatusChange("connecting")

    const ws = new WebSocket(this.url)
    ws.binaryType = "arraybuffer"

    ws.onopen = () => {
      this.onStatusChange("connected")
    }

    ws.onclose = () => {
      this.onStatusChange("disconnected")
      this.ws = null
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    }

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const parsed = JSON.parse(event.data)
          this.onText(parsed)
        } catch {
          // Ignore malformed JSON
        }
      } else {
        this.onBinary(event.data as ArrayBuffer)
      }
    }

    this.ws = ws
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.clearReconnectTimer()
    this.ws?.close()
    this.ws = null
  }

  sendText(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  sendBinary(data: ArrayBuffer | Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

/** Build a WebSocket URL pointing at the server. */
export function getWebSocketUrl(path = "/ws"): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.hostname}:8000${path}`
}

interface UseVoiceSocketOptions {
  onText?: (data: Record<string, unknown>) => void
  onBinary?: (data: ArrayBuffer) => void
}

export function useVoiceSocket(options: UseVoiceSocketOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")
  const socketRef = useRef<VoiceSocket | null>(null)
  const handlersRef = useRef(options)
  handlersRef.current = options

  useEffect(() => {
    const socket = new VoiceSocket({
      url: getWebSocketUrl(),
      onText: (data) => handlersRef.current.onText?.(data),
      onBinary: (data) => handlersRef.current.onBinary?.(data),
      onStatusChange: setStatus,
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  return { status, socket: socketRef }
}
