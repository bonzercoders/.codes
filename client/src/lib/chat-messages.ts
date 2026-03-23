import type {
  ChatMessage,
  ChatMessageAudioState,
  ChatRuntimeState,
  PlaybackState,
  ServerEvent,
} from "@/lib/chat-contracts"
import type { ConnectionStatus } from "@/lib/websocket"

export type ChatRuntimeAction =
  | { type: "connection_status"; status: ConnectionStatus }
  | { type: "append_user_message"; text: string }
  | { type: "server_event"; event: ServerEvent }
  | { type: "playback_state"; state: PlaybackState; messageId: string | null }

export function createInitialChatRuntimeState(): ChatRuntimeState {
  return {
    connectionStatus: "disconnected",
    sttState: "inactive",
    sttPreviewText: "",
    messages: [],
    activeAudioMessageId: null,
    activeSpeakerId: null,
  }
}

export function reduceChatRuntimeState(state: ChatRuntimeState, action: ChatRuntimeAction): ChatRuntimeState {
  switch (action.type) {
    case "connection_status": {
      if (action.status === state.connectionStatus) {
        return state
      }

      const isDisconnected = action.status !== "connected"
      return {
        ...state,
        connectionStatus: action.status,
        sttState: isDisconnected ? "inactive" : state.sttState,
        sttPreviewText: isDisconnected ? "" : state.sttPreviewText,
        activeAudioMessageId: isDisconnected ? null : state.activeAudioMessageId,
        activeSpeakerId: isDisconnected ? null : state.activeSpeakerId,
        messages: isDisconnected ? clearActiveAudioState(state.messages) : state.messages,
      }
    }

    case "append_user_message": {
      const text = action.text.trim()
      if (!text) {
        return state
      }

      const nextOrder = getNextOrder(state.messages)
      const message = createUserMessage(`local-user-${Date.now()}-${nextOrder}`, text, nextOrder)

      return {
        ...state,
        messages: [...state.messages, message],
      }
    }

    case "server_event":
      return reduceServerEvent(state, action.event)

    case "playback_state":
      return reducePlaybackState(state, action.state, action.messageId)

    default:
      return state
  }
}

function reduceServerEvent(state: ChatRuntimeState, event: ServerEvent): ChatRuntimeState {
  switch (event.type) {
    case "pong":
      return state

    case "stt_state":
      return {
        ...state,
        sttState: event.data.state,
      }

    case "stt_update":
    case "stt_stabilized":
      return {
        ...state,
        sttPreviewText: event.text,
      }

    case "stt_final": {
      const finalizedText = event.text.trim()
      if (!finalizedText) {
        return {
          ...state,
          sttPreviewText: "",
        }
      }

      const nextOrder = getNextOrder(state.messages)
      const nextMessage = createUserMessage(`stt-user-${Date.now()}-${nextOrder}`, finalizedText, nextOrder)

      return {
        ...state,
        sttPreviewText: "",
        messages: [...state.messages, nextMessage],
      }
    }

    case "text_stream_start": {
      const existing = findMessageById(state.messages, event.data.message_id)
      if (existing) {
        return {
          ...state,
          messages: updateMessageById(state.messages, event.data.message_id, (message) => ({
            ...message,
            role: "character",
            speakerId: event.data.character_id,
            speakerName: event.data.character_name,
            speakerImageUrl: event.data.character_image_url,
            status: "streaming",
          })),
        }
      }

      const nextOrder = getNextOrder(state.messages)
      const nextMessage: ChatMessage = {
        id: event.data.message_id,
        role: "character",
        speakerId: event.data.character_id,
        speakerName: event.data.character_name,
        speakerImageUrl: event.data.character_image_url,
        text: "",
        status: "streaming",
        order: nextOrder,
        audio: {
          streamState: "idle",
          isActiveSpeaker: false,
        },
      }

      return {
        ...state,
        messages: [...state.messages, nextMessage],
      }
    }

    case "text_chunk": {
      if (!findMessageById(state.messages, event.data.message_id)) {
        return state
      }

      return {
        ...state,
        messages: updateMessageById(state.messages, event.data.message_id, (message) => ({
          ...message,
          role: "character",
          speakerId: event.data.character_id,
          speakerName: event.data.character_name,
          speakerImageUrl: event.data.character_image_url,
          text: `${message.text}${event.data.text}`,
          status: "streaming",
        })),
      }
    }

    case "text_stream_stop": {
      if (!findMessageById(state.messages, event.data.message_id)) {
        return state
      }

      return {
        ...state,
        messages: updateMessageById(state.messages, event.data.message_id, (message) => ({
          ...message,
          role: "character",
          speakerId: event.data.character_id,
          speakerName: event.data.character_name,
          speakerImageUrl: event.data.character_image_url,
          text: event.data.text.trim() ? event.data.text : message.text,
          status: "final",
        })),
      }
    }

    case "audio_stream_start": {
      if (!findMessageById(state.messages, event.data.message_id)) {
        return state
      }

      return setActiveAudioState(
        {
          ...state,
          activeAudioMessageId: event.data.message_id,
          activeSpeakerId: event.data.character_id,
        },
        event.data.message_id,
        "starting"
      )
    }

    case "audio_stream_stop": {
      if (!findMessageById(state.messages, event.data.message_id)) {
        return state
      }

      if (state.activeAudioMessageId !== event.data.message_id) {
        return state
      }

      return setActiveAudioState(state, event.data.message_id, "playing")
    }

    default:
      return state
  }
}

function reducePlaybackState(
  state: ChatRuntimeState,
  playbackState: PlaybackState,
  messageId: string | null
): ChatRuntimeState {
  switch (playbackState) {
    case "starting":
      return messageId ? setActiveAudioState(state, messageId, "starting") : state

    case "playing":
    case "draining":
      return messageId ? setActiveAudioState(state, messageId, "playing") : state

    case "idle":
      return finalizeActiveAudioState(state, messageId)

    case "error":
      return {
        ...state,
        activeAudioMessageId: null,
        activeSpeakerId: null,
        messages: clearActiveAudioState(state.messages),
      }

    default:
      return state
  }
}

function setActiveAudioState(
  state: ChatRuntimeState,
  messageId: string,
  streamState: Extract<ChatMessageAudioState, "starting" | "playing">
): ChatRuntimeState {
  const targetMessage = findMessageById(state.messages, messageId)
  if (!targetMessage) {
    return state
  }

  return {
    ...state,
    activeAudioMessageId: messageId,
    activeSpeakerId: targetMessage.speakerId,
    messages: state.messages.map((message) => {
      if (message.id === messageId) {
        return {
          ...message,
          audio: {
            streamState,
            isActiveSpeaker: true,
          },
        }
      }

      return {
        ...message,
        audio: {
          streamState: normalizeInactiveAudioState(message.audio.streamState),
          isActiveSpeaker: false,
        },
      }
    }),
  }
}

function finalizeActiveAudioState(state: ChatRuntimeState, messageId: string | null): ChatRuntimeState {
  const resolvedMessageId = messageId ?? state.activeAudioMessageId
  if (!resolvedMessageId) {
    return {
      ...state,
      activeAudioMessageId: null,
      activeSpeakerId: null,
      messages: clearActiveAudioState(state.messages),
    }
  }

  return {
    ...state,
    activeAudioMessageId: null,
    activeSpeakerId: null,
    messages: state.messages.map((message) => {
      if (message.id === resolvedMessageId) {
        return {
          ...message,
          audio: {
            streamState: "stopped",
            isActiveSpeaker: false,
          },
        }
      }

      return {
        ...message,
        audio: {
          streamState: normalizeInactiveAudioState(message.audio.streamState),
          isActiveSpeaker: false,
        },
      }
    }),
  }
}

function getNextOrder(messages: ChatMessage[]): number {
  if (messages.length === 0) {
    return 0
  }

  return messages.reduce((max, message) => Math.max(max, message.order), -1) + 1
}

function createUserMessage(id: string, text: string, order: number): ChatMessage {
  return {
    id,
    role: "user",
    speakerId: "user",
    speakerName: "You",
    text,
    status: "final",
    order,
    audio: {
      streamState: "idle",
      isActiveSpeaker: false,
    },
  }
}

function findMessageById(messages: ChatMessage[], messageId: string): ChatMessage | undefined {
  return messages.find((message) => message.id === messageId)
}

function updateMessageById(
  messages: ChatMessage[],
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage
): ChatMessage[] {
  return messages.map((message) => (message.id === messageId ? updater(message) : message))
}

function clearActiveAudioState(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    audio: {
      streamState: normalizeInactiveAudioState(message.audio.streamState),
      isActiveSpeaker: false,
    },
  }))
}

function normalizeInactiveAudioState(streamState: ChatMessageAudioState): ChatMessageAudioState {
  if (streamState === "starting" || streamState === "playing") {
    return "stopped"
  }

  return streamState
}
