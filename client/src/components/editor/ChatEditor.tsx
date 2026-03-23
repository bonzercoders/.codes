import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { Plus } from "lucide-react"

import micIcon from "@/assets/mic.png"
import { Button } from "@/components/ui/button"
import { type ConnectionStatus } from "@/lib/websocket"

const MENU_ITEMS = ["File upload", "New chat"]

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
}

const STT_LABEL: Record<SttState, string> = {
  inactive: "Voice off",
  listening: "Listening",
  recording: "Recording",
  transcribing: "Transcribing",
}

type SttState = "inactive" | "listening" | "recording" | "transcribing"

interface ChatEditorProps {
  status: ConnectionStatus
  value: string
  onChange: (value: string) => void
  onSend: () => void
  canSend: boolean
  onVoiceToggle: () => void
  isVoiceEnabled: boolean
  isVoiceBusy: boolean
  sttState: SttState
  voiceError: string | null
}

export function ChatEditor({
  status,
  value,
  onChange,
  onSend,
  canSend,
  onVoiceToggle,
  isVoiceEnabled,
  isVoiceBusy,
  sttState,
  voiceError,
}: ChatEditorProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsMenuOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [isMenuOpen])

  const handleMenuToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setIsMenuOpen((previous) => !previous)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return
    }

    event.preventDefault()

    if (canSend) {
      onSend()
    }
  }

  const isVoiceButtonDisabled = status !== "connected" || isVoiceBusy

  return (
    <div aria-label="Chat editor" className="chat-editor" role="group">
      <div className="chat-editor__input-wrap">
        <div className="chat-editor__status">
          <span className="chat-editor__status-label">{STATUS_LABEL[status]}</span>
          <span
            className={`chat-editor__status-dot${status === "connected" ? " is-connected" : ""}`}
          />
        </div>

        <textarea
          className="chat-editor__input"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          value={value}
        />

        {voiceError ? (
          <p aria-live="polite" className="chat-editor__voice-error" role="status">
            {voiceError}
          </p>
        ) : null}
      </div>

      <div className="chat-editor__toolbar">
        <div className="chat-editor__menu" ref={menuRef}>
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label="Open add menu"
            className="chat-editor__icon-button chat-editor__icon-button--add"
            onClick={handleMenuToggle}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
          </button>

          {isMenuOpen ? (
            <div aria-label="Editor add menu" className="chat-editor__dropdown" role="menu">
              {MENU_ITEMS.map((item) => (
                <button
                  className="chat-editor__dropdown-item"
                  disabled
                  key={item}
                  role="menuitem"
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="chat-editor__actions">
          <span className={`chat-editor__voice-label is-${sttState}`}>{STT_LABEL[sttState]}</span>

          <button
            aria-label={isVoiceEnabled ? "Stop voice input" : "Start voice input"}
            aria-pressed={isVoiceEnabled}
            className={`chat-editor__icon-button voice-button ${
              isVoiceEnabled ? "is-active" : ""
            } is-${sttState}`}
            disabled={isVoiceButtonDisabled}
            onClick={onVoiceToggle}
            type="button"
          >
            <img alt="" aria-hidden="true" className="chat-editor__mic-icon" src={micIcon} />
          </button>

          <Button className="chat-editor__send-button" disabled={!canSend} onClick={onSend} type="button">
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
