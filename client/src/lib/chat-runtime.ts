import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { createAudioCaptureController } from "@/lib/audio-capture"
import { createAudioPlayerController } from "@/lib/audio-player"
import type {
  AudioStreamStartEventData,
  ChatRuntimeState,
  ChatRuntimeViewModel,
  RuntimeError,
  ServerEvent,
  SttState,
  TextStreamEventData,
  UseChatRuntimeOptions,
} from "@/lib/chat-contracts"
import { createInitialChatRuntimeState, reduceChatRuntimeState } from "@/lib/chat-messages"
import type { ConnectionStatus } from "@/lib/websocket"
import { useVoiceSocket } from "@/lib/websocket"

const DEFAULT_SETTINGS_SYNC_DEBOUNCE_MS = 160

const STT_STATE_VALUES = new Set<SttState>(["inactive", "listening", "recording", "transcribing"])

function toSocketPayload(payload: object): Record<string, unknown> {
  return payload as Record<string, unknown>
}

function normalizeServerEvent(value: Record<string, unknown>): ServerEvent | null {
  const eventType = readString(value, "type")
  if (!eventType) {
    return null
  }

  switch (eventType) {
    case "pong":
      return { type: "pong" }

    case "stt_state": {
      const data = readRecord(value, "data")
      const state = data ? readString(data, "state") : null
      if (!state || !STT_STATE_VALUES.has(state as SttState)) {
        return null
      }
      return { type: "stt_state", data: { state: state as SttState } }
    }

    case "stt_update": {
      const text = readString(value, "text")
      return text === null ? null : { type: "stt_update", text }
    }

    case "stt_stabilized": {
      const text = readString(value, "text")
      return text === null ? null : { type: "stt_stabilized", text }
    }

    case "stt_final": {
      const text = readString(value, "text")
      return text === null ? null : { type: "stt_final", text }
    }

    case "text_stream_start": {
      const data = parseTextStreamBaseData(value)
      return data ? { type: "text_stream_start", data } : null
    }

    case "text_chunk": {
      const data = parseTextStreamChunkData(value)
      return data ? { type: "text_chunk", data } : null
    }

    case "text_stream_stop": {
      const data = parseTextStreamChunkData(value)
      return data ? { type: "text_stream_stop", data } : null
    }

    case "audio_stream_start": {
      const data = parseAudioStreamStartData(value)
      return data ? { type: "audio_stream_start", data } : null
    }

    case "audio_stream_stop": {
      const data = parseAudioStreamStopData(value)
      return data ? { type: "audio_stream_stop", data } : null
    }

    default:
      return null
  }
}

function parseTextStreamBaseData(root: Record<string, unknown>): TextStreamEventData | null {
  const data = readRecord(root, "data")
  if (!data) {
    return null
  }

  const messageId = readString(data, "message_id")
  const characterId = readString(data, "character_id")
  const characterName = readString(data, "character_name")
  const characterImageUrl = readString(data, "character_image_url")

  if (!messageId || !characterId || !characterName || characterImageUrl === null) {
    return null
  }

  return {
    message_id: messageId,
    character_id: characterId,
    character_name: characterName,
    character_image_url: characterImageUrl,
  }
}

function parseTextStreamChunkData(root: Record<string, unknown>): (TextStreamEventData & { text: string }) | null {
  const base = parseTextStreamBaseData(root)
  if (!base) {
    return null
  }

  const data = readRecord(root, "data")
  if (!data) {
    return null
  }

  const text = readString(data, "text")
  if (text === null) {
    return null
  }

  return {
    ...base,
    text,
  }
}

function parseAudioStreamStartData(root: Record<string, unknown>): AudioStreamStartEventData | null {
  const data = readRecord(root, "data")
  if (!data) {
    return null
  }

  const messageId = readString(data, "message_id")
  const characterId = readString(data, "character_id")
  const characterName = readString(data, "character_name")
  const sampleRate = readNumber(data, "sample_rate")

  if (!messageId || !characterId || !characterName || sampleRate === null) {
    return null
  }

  return {
    message_id: messageId,
    character_id: characterId,
    character_name: characterName,
    sample_rate: sampleRate,
  }
}

function parseAudioStreamStopData(root: Record<string, unknown>) {
  const data = readRecord(root, "data")
  if (!data) {
    return null
  }

  const messageId = readString(data, "message_id")
  const characterId = readString(data, "character_id")
  const characterName = readString(data, "character_name")

  if (!messageId || !characterId || !characterName) {
    return null
  }

  return {
    message_id: messageId,
    character_id: characterId,
    character_name: characterName,
  }
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" ? value : null
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toViewState(state: ChatRuntimeState, status: ConnectionStatus): ChatRuntimeState {
  if (status === "connected") {
    return {
      ...state,
      connectionStatus: status,
    }
  }

  return {
    ...state,
    connectionStatus: status,
    sttState: "inactive",
    sttPreviewText: "",
    activeAudioMessageId: null,
    activeSpeakerId: null,
    messages: state.messages.map((message) => ({
      ...message,
      audio: {
        streamState:
          message.audio.streamState === "playing" || message.audio.streamState === "starting"
            ? "stopped"
            : message.audio.streamState,
        isActiveSpeaker: false,
      },
    })),
  }
}

export function useChatRuntime(options: UseChatRuntimeOptions): ChatRuntimeViewModel {
  const { modelSettings, settingsSyncDebounceMs = DEFAULT_SETTINGS_SYNC_DEBOUNCE_MS } = options

  const [state, setState] = useState(createInitialChatRuntimeState)
  const [draftText, setDraftText] = useState("")
  const [isListeningIntent, setIsListeningIntent] = useState(false)
  const [lastError, setLastError] = useState<RuntimeError | null>(null)

  const modelSettingsRef = useRef(modelSettings)
  const statusRef = useRef<ConnectionStatus>("disconnected")
  const activeAudioMessageIdRef = useRef<string | null>(null)

  const capture = useMemo(() => createAudioCaptureController(), [])
  const player = useMemo(
    () =>
      createAudioPlayerController({
        onStateChange: (playbackState) => {
          setState((previous) => {
            const messageId = previous.activeAudioMessageId
            return reduceChatRuntimeState(previous, { type: "playback_state", state: playbackState, messageId })
          })
        },
        onError: (error) => {
          setLastError({
            code: error.code,
            message: error.message,
          })
        },
      }),
    []
  )

  const { status, socket } = useVoiceSocket({
    onText: (payload) => {
      const event = normalizeServerEvent(payload)
      if (!event) {
        setLastError({
          code: "PROTOCOL_ERROR",
          message: "Received an unrecognized websocket payload.",
        })
        return
      }

      if (event.type === "audio_stream_start") {
        activeAudioMessageIdRef.current = event.data.message_id
        player.startStream({
          messageId: event.data.message_id,
          characterId: event.data.character_id,
          characterName: event.data.character_name,
          sampleRate: event.data.sample_rate,
        })
      }

      if (event.type === "audio_stream_stop") {
        if (!activeAudioMessageIdRef.current) {
          setLastError({
            code: "AUDIO_STREAM_CONTEXT_MISSING",
            message: "Received audio stop event without an active audio stream.",
          })
        }

        player.stopStream(event.data.message_id)
      }

      setState((previous) => reduceChatRuntimeState(previous, { type: "server_event", event }))
    },
    onBinary: (chunk) => {
      if (!activeAudioMessageIdRef.current) {
        setLastError({
          code: "AUDIO_STREAM_CONTEXT_MISSING",
          message: "Received audio bytes without an active audio stream.",
        })
        return
      }

      player.pushChunk(chunk)
    },
  })


  useEffect(() => {
    modelSettingsRef.current = modelSettings
  }, [modelSettings])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    activeAudioMessageIdRef.current = state.activeAudioMessageId
  }, [state.activeAudioMessageId])

  useEffect(() => {
    if (status !== "connected") {
      void capture.stop()
      player.flush()
      activeAudioMessageIdRef.current = null
    }
  }, [capture, player, status])

  useEffect(() => {
    if (status !== "connected") {
      return
    }

    const timer = setTimeout(() => {
      socket.current?.sendText(
        toSocketPayload({
          type: "model_settings",
          ...modelSettingsRef.current,
        })
      )
    }, settingsSyncDebounceMs)

    return () => {
      clearTimeout(timer)
    }
  }, [modelSettings, settingsSyncDebounceMs, socket, status])

  useEffect(() => {
    return () => {
      void capture.destroy()
      player.destroy()
    }
  }, [capture, player])

  const sendMessage = useCallback(() => {
    const text = draftText.trim()
    if (!text || status !== "connected") {
      return
    }

    socket.current?.sendText(
      toSocketPayload({
        type: "user_message",
        text,
        model_settings: modelSettingsRef.current,
      })
    )

    setState((previous) => reduceChatRuntimeState(previous, { type: "append_user_message", text }))
    setDraftText("")
  }, [draftText, socket, status])

  const listeningIntentActive = status === "connected" && isListeningIntent

  const toggleListening = useCallback(() => {
    const captureState = capture.getState()

    if (status !== "connected") {
      setLastError({
        code: "CAPTURE_START_FAILED",
        message: "Connect to the server before starting voice capture.",
      })
      return
    }

    const shouldStop =
      listeningIntentActive ||
      captureState === "capturing" ||
      captureState === "requesting_permission" ||
      captureState === "stopping"

    if (shouldStop) {
      socket.current?.sendText({ type: "stop_listening" })
      void capture.stop()
      return
    }

    socket.current?.sendText({ type: "start_listening" })
    setIsListeningIntent(true)
    setLastError(null)

    void capture.start({
      targetSampleRate: 16000,
      onChunk: (chunk) => {
        if (statusRef.current !== "connected") {
          return
        }

        socket.current?.sendBinary(chunk)
      },
      onStateChange: (nextState) => {
        if (nextState === "idle" || nextState === "error") {
          setIsListeningIntent(false)
        }
      },
      onError: (error) => {
        setLastError({
          code: error.code,
          message: error.message,
        })

        if (statusRef.current === "connected") {
          socket.current?.sendText({ type: "stop_listening" })
        }
      },
    })
  }, [capture, listeningIntentActive, socket, status])

  const viewState = useMemo(() => toViewState(state, status), [state, status])

  return {
    state: viewState,
    draftText,
    setDraftText,
    sendMessage,
    toggleListening,
    isListeningIntent: listeningIntentActive,
    lastError,
  }
}





