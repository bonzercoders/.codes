import { useEffect, useRef } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { ChatMessage } from "@/lib/chat-messages"
import { cn } from "@/lib/utils"

export interface LiveUserTranscription {
  stableText: string
  unstableText: string
}

interface ChatMessageListProps {
  messages: ChatMessage[]
  liveUserTranscription?: LiveUserTranscription | null
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return "AI"
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

export function ChatMessageList({ messages, liveUserTranscription }: ChatMessageListProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!listRef.current) {
      return
    }

    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, liveUserTranscription])

  const hasLiveTranscript =
    !!liveUserTranscription &&
    (liveUserTranscription.stableText.length > 0 || liveUserTranscription.unstableText.length > 0)

  return (
    <section aria-label="Chat messages" className="chat-message-list" ref={listRef}>
      {messages.map((message) => {
        const isUser = message.role === "user"

        if (isUser) {
          return (
            <article className="chat-message chat-message--user" key={message.id}>
              <div className="chat-message__bubble chat-message__bubble--user">
                <p className="chat-message__text">{message.text}</p>
              </div>
            </article>
          )
        }

        const characterName = message.characterName?.trim() || "Character"

        return (
          <article className="chat-message chat-message--assistant" key={message.id}>
            <Avatar className="chat-message__avatar" size="sm">
              {message.characterImageUrl ? (
                <AvatarImage alt={characterName} src={message.characterImageUrl} />
              ) : null}
              <AvatarFallback>{getInitials(characterName)}</AvatarFallback>
            </Avatar>

            <div className="chat-message__assistant-wrap">
              <p className="chat-message__name">{characterName}</p>
              <div
                className={cn(
                  "chat-message__bubble chat-message__bubble--assistant",
                  message.interrupted && "is-interrupted"
                )}
              >
                <p className="chat-message__text">
                  {message.text}
                  {message.isStreaming ? <span className="chat-message__cursor" /> : null}
                </p>
              </div>
            </div>
          </article>
        )
      })}

      {hasLiveTranscript ? (
        <article className="chat-message chat-message--user chat-message--live">
          <div className="chat-message__bubble chat-message__bubble--user">
            <p className="chat-message__text">
              <span>{liveUserTranscription.stableText}</span>
              <span className="chat-message__text-unstable">{liveUserTranscription.unstableText}</span>
              <span className="chat-message__cursor" />
            </p>
          </div>
        </article>
      ) : null}
    </section>
  )
}
