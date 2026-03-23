import type { ChatMessage, ChatRuntimeState, SttState } from "@/lib/chat-contracts"

interface ChatTimelineProps {
  messages: ChatMessage[]
  sttPreviewText: string
  sttState: SttState
  connectionStatus: ChatRuntimeState["connectionStatus"]
  activeSpeakerId: string | null
  activeAudioMessageId: string | null
}

const CONNECTION_LABEL: Record<ChatRuntimeState["connectionStatus"], string> = {
  connected: "Live",
  connecting: "Reconnecting",
  disconnected: "Offline",
}

export function ChatTimeline({
  messages,
  sttPreviewText,
  sttState,
  connectionStatus,
  activeSpeakerId,
  activeAudioMessageId,
}: ChatTimelineProps) {
  const orderedMessages = [...messages].sort((left, right) => left.order - right.order)

  return (
    <section aria-label="Conversation timeline" className="chat-timeline">
      <header className="chat-timeline__header">
        <p className="chat-timeline__title">Conversation</p>
        <div className={`chat-timeline__connection is-${connectionStatus}`}>
          <span className="chat-timeline__connection-dot" />
          <span>{CONNECTION_LABEL[connectionStatus]}</span>
        </div>
      </header>

      <div className="chat-timeline__body">
        {orderedMessages.length === 0 ? (
          <p className="chat-timeline__empty">Waiting for messages. Send text or start voice input.</p>
        ) : (
          <ol className="chat-timeline__list">
            {orderedMessages.map((message) => {
              const isStreaming = message.status === "streaming"
              const isAudioStarting = message.audio.streamState === "starting"
              const isAudioPlaying = message.audio.streamState === "playing"
              const isSpeaking =
                message.audio.isActiveSpeaker || message.id === activeAudioMessageId || isAudioStarting || isAudioPlaying

              return (
                <li
                  className={[
                    "chat-timeline__item",
                    `is-${message.role}`,
                    isStreaming ? "is-streaming" : "",
                    isSpeaking ? "is-speaking" : "",
                    `is-audio-${message.audio.streamState}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={message.id}
                >
                  <div className="chat-timeline__meta">
                    <p className="chat-timeline__speaker">{message.speakerName}</p>
                    <p className="chat-timeline__status">
                      {toMessageStatusLabel(message, isStreaming, activeSpeakerId, activeAudioMessageId)}
                    </p>
                  </div>
                  <p className="chat-timeline__text">{message.text || "..."}</p>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {sttPreviewText ? (
        <p className="chat-timeline__stt-preview">
          <span className="chat-timeline__stt-label">{sttState}</span>
          <span className="chat-timeline__stt-text">{sttPreviewText}</span>
        </p>
      ) : null}
    </section>
  )
}

function toMessageStatusLabel(
  message: ChatMessage,
  isStreaming: boolean,
  activeSpeakerId: string | null,
  activeAudioMessageId: string | null
): string {
  if (message.audio.streamState === "starting") {
    return "Buffering"
  }

  if (message.audio.streamState === "playing") {
    return "Speaking"
  }

  if (message.audio.streamState === "stopped" && message.role === "character") {
    return "Spoken"
  }

  if (isStreaming) {
    return "Streaming"
  }

  if (message.speakerId === activeSpeakerId && message.id !== activeAudioMessageId) {
    return "Queued"
  }

  return "Final"
}
