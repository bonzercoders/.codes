export type ChatRole = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  characterId?: string
  characterName?: string
  characterImageUrl?: string
  isStreaming: boolean
  interrupted: boolean
  createdAt: number
}

export interface AssistantStreamStartPayload {
  messageId: string
  characterId: string
  characterName: string
  characterImageUrl: string
}

export interface AssistantChunkPayload {
  messageId: string
  text: string
}

export interface AssistantStreamStopPayload {
  messageId: string
  text: string
  interrupted: boolean
  characterId: string
  characterName: string
  characterImageUrl: string
}

function createMessageId(prefix: "user" | "assistant"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

export function appendUserMessage(messages: ChatMessage[], text: string): ChatMessage[] {
  const trimmed = text.trim()

  if (!trimmed) {
    return messages
  }

  return [
    ...messages,
    {
      id: createMessageId("user"),
      role: "user",
      text: trimmed,
      isStreaming: false,
      interrupted: false,
      createdAt: Date.now(),
    },
  ]
}

export function startAssistantStream(
  messages: ChatMessage[],
  payload: AssistantStreamStartPayload
): ChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === payload.messageId)

  if (existingIndex >= 0) {
    const next = [...messages]
    const existing = next[existingIndex]

    next[existingIndex] = {
      ...existing,
      role: "assistant",
      characterId: payload.characterId,
      characterName: payload.characterName,
      characterImageUrl: payload.characterImageUrl,
      isStreaming: true,
      interrupted: false,
    }

    return next
  }

  return [
    ...messages,
    {
      id: payload.messageId,
      role: "assistant",
      text: "",
      characterId: payload.characterId,
      characterName: payload.characterName,
      characterImageUrl: payload.characterImageUrl,
      isStreaming: true,
      interrupted: false,
      createdAt: Date.now(),
    },
  ]
}

export function appendAssistantChunk(
  messages: ChatMessage[],
  payload: AssistantChunkPayload
): ChatMessage[] {
  if (!payload.text) {
    return messages
  }

  const targetIndex = messages.findIndex((message) => message.id === payload.messageId)

  if (targetIndex < 0) {
    return messages
  }

  const next = [...messages]
  const target = next[targetIndex]

  next[targetIndex] = {
    ...target,
    role: "assistant",
    text: `${target.text}${payload.text}`,
    isStreaming: true,
  }

  return next
}

export function stopAssistantStream(
  messages: ChatMessage[],
  payload: AssistantStreamStopPayload
): ChatMessage[] {
  const targetIndex = messages.findIndex((message) => message.id === payload.messageId)

  if (targetIndex < 0) {
    return [
      ...messages,
      {
        id: payload.messageId,
        role: "assistant",
        text: payload.text,
        characterId: payload.characterId,
        characterName: payload.characterName,
        characterImageUrl: payload.characterImageUrl,
        isStreaming: false,
        interrupted: payload.interrupted,
        createdAt: Date.now(),
      },
    ]
  }

  const next = [...messages]
  const target = next[targetIndex]

  next[targetIndex] = {
    ...target,
    role: "assistant",
    text: payload.text || target.text,
    characterId: payload.characterId,
    characterName: payload.characterName,
    characterImageUrl: payload.characterImageUrl,
    isStreaming: false,
    interrupted: payload.interrupted,
  }

  return next
}
