import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { HomeInfoDrawer } from "@/components/drawer/HomeInfoDrawer"
import { ChatEditor } from "@/components/editor/ChatEditor"
import { ChatMessageList } from "@/components/editor/ChatMessageList"
import {
  appendAssistantChunk,
  appendUserMessage,
  startAssistantStream,
  stopAssistantStream,
  type ChatMessage,
} from "@/lib/chat-messages"
import { type LlmSettings, loadSettings, sanitizeSettings, saveSettings } from "@/lib/model-settings"
import { useVoiceSocket } from "@/lib/websocket"

const MODEL_SETTINGS_DEBOUNCE_MS = 160

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function readBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false
}

export function HomePage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draftText, setDraftText] = useState("")

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSocketText = useCallback((payload: Record<string, unknown>) => {
    const eventType = readString(payload.type)

    if (eventType === "text_stream_start") {
      const data = readRecord(payload.data)
      if (!data) {
        return
      }

      const messageId = readString(data.message_id)
      if (!messageId) {
        return
      }

      setMessages((previous) =>
        startAssistantStream(previous, {
          messageId,
          characterId: readString(data.character_id),
          characterName: readString(data.character_name),
          characterImageUrl: readString(data.character_image_url),
        })
      )

      return
    }

    if (eventType === "text_chunk") {
      const data = readRecord(payload.data)
      if (!data) {
        return
      }

      const messageId = readString(data.message_id)
      if (!messageId) {
        return
      }

      setMessages((previous) =>
        appendAssistantChunk(previous, {
          messageId,
          text: readString(data.text),
        })
      )

      return
    }

    if (eventType === "text_stream_stop") {
      const data = readRecord(payload.data)
      if (!data) {
        return
      }

      const messageId = readString(data.message_id)
      if (!messageId) {
        return
      }

      setMessages((previous) =>
        stopAssistantStream(previous, {
          messageId,
          text: readString(data.text),
          interrupted: readBoolean(data.interrupted),
          characterId: readString(data.character_id),
          characterName: readString(data.character_name),
          characterImageUrl: readString(data.character_image_url),
        })
      )
    }
  }, [])

  const { status, socket } = useVoiceSocket({ onText: handleSocketText })

  const handleSettingsChange = useCallback((partial: Partial<LlmSettings>) => {
    setSettings((previous) => {
      const next = sanitizeSettings({ ...previous, ...partial })
      saveSettings(next)
      return next
    })
  }, [])

  const canSend = useMemo(() => {
    return status === "connected" && draftText.trim().length > 0
  }, [draftText, status])

  const handleSendMessage = useCallback(() => {
    const text = draftText.trim()
    if (!text || status !== "connected") {
      return
    }

    setMessages((previous) => appendUserMessage(previous, text))

    socket.current?.sendText({
      type: "user_message",
      text,
      model_settings: settings,
    })

    setDraftText("")
  }, [draftText, settings, socket, status])

  useEffect(() => {
    if (status !== "connected") {
      return
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }

    syncTimerRef.current = setTimeout(() => {
      socket.current?.sendText({
        type: "model_settings",
        ...settings,
      })
    }, MODEL_SETTINGS_DEBOUNCE_MS)

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
    }
  }, [settings, socket, status])

  return (
    <div className="page-canvas home-page">
      <div className="home-page__columns">
        <div className="home-page__column home-page__column--left">
          <HomeInfoDrawer
            isOpen={isDrawerOpen}
            onSettingsChange={handleSettingsChange}
            onToggle={() => setIsDrawerOpen((previous) => !previous)}
            settings={settings}
          />
        </div>

        <div className="home-page__column home-page__column--right">
          <div className="home-page__editor-shell">
            <ChatMessageList messages={messages} />
            <ChatEditor
              canSend={canSend}
              onChange={setDraftText}
              onSend={handleSendMessage}
              status={status}
              value={draftText}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
