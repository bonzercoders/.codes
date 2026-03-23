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
import type { SttState } from "@/lib/chat-contracts"
import { type ConnectionStatus } from "@/lib/websocket"

const MENU_ITEMS = ["File upload", "New chat"]

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
}

const VOICE_STATE_LABEL: Record<SttState, string> = {
  inactive: "Idle",
  listening: "Listening",
  recording: "Recording",
  transcribing: "Transcribing",
}

interface ChatEditorProps {
  status: ConnectionStatus
  sttState: SttState
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onToggleListening: () => void
  isListeningIntent: boolean
}

export function ChatEditor({
  status,
  sttState,
  value,
  onChange,
  onSend,
  onToggleListening,
  isListeningIntent,
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
    onSend()
  }

  const isVoiceDisabled = status !== "connected"
  const voiceStateClass = status === "connected" ? `is-${sttState}` : ""
  const voiceLabelText =
    status === "connected"
      ? isListeningIntent && sttState === "inactive"
        ? "Starting"
        : VOICE_STATE_LABEL[sttState]
      : "Voice Off"

  return (
    <div aria-label="Chat editor" className="chat-editor" role="group">
      <div className="chat-editor__input-wrap">
        <div className="chat-editor__status">
          <span className="chat-editor__status-label">{STATUS_LABEL[status]}</span>
          <span className={`chat-editor__status-dot${status === "connected" ? " is-connected" : ""}`} />
        </div>

        <textarea
          className="chat-editor__input"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          value={value}
        />
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
          <span className={["chat-editor__voice-label", voiceStateClass].filter(Boolean).join(" ")}>{voiceLabelText}</span>
          <button
            aria-label={isListeningIntent ? "Stop voice input" : "Start voice input"}
            aria-pressed={isListeningIntent}
            className={["chat-editor__icon-button", "voice-button", voiceStateClass, isListeningIntent ? "is-active" : ""]
              .filter(Boolean)
              .join(" ")}
            disabled={isVoiceDisabled}
            onClick={onToggleListening}
            type="button"
          >
            <img alt="" aria-hidden="true" className="chat-editor__mic-icon" src={micIcon} />
          </button>
          <Button className="chat-editor__send-button" onClick={onSend} type="button">
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
