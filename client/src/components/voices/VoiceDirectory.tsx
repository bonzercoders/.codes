import { Plus, Search, Volume2 } from "lucide-react"
import { useMemo, useState, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Voice } from "@/lib/voices"
import { cn } from "@/lib/utils"

interface VoiceDirectoryProps {
  voices: Voice[]
  selectedId: string | null
  onCreate: () => void
  onPreview: (voiceId: string) => void
  onSelect: (voiceId: string) => void
}

const ALPHABET = ["#", ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))]

function toLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()

  if (!first) {
    return "#"
  }

  return first >= "A" && first <= "Z" ? first : "#"
}

function getLetterAnchor(letter: string): string {
  return letter === "#" ? "misc" : letter.toLowerCase()
}

function getVoicePreview(voice: Voice, limit = 106): string {
  const source = voice.speakerDesc.trim() || voice.scenePrompt.trim()

  if (!source) {
    return ""
  }

  if (source.length <= limit) {
    return source
  }

  return `${source.slice(0, limit)}...`
}

export function VoiceDirectory({ voices, selectedId, onCreate, onPreview, onSelect }: VoiceDirectoryProps) {
  const [query, setQuery] = useState("")

  const filteredVoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return voices
    }

    return voices.filter((voice) => {
      const haystack = `${voice.voiceName} ${voice.method} ${voice.speakerDesc} ${voice.scenePrompt}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [query, voices])

  const groupedVoices = useMemo(() => {
    const groups: Record<string, Voice[]> = {}

    filteredVoices.forEach((voice) => {
      const letter = toLetter(voice.voiceName)
      const group = groups[letter] ?? []
      group.push(voice)
      groups[letter] = group
    })

    Object.keys(groups).forEach((letter) => {
      groups[letter] = groups[letter].slice().sort((left, right) => left.voiceName.localeCompare(right.voiceName))
    })

    return groups
  }, [filteredVoices])

  const lettersWithVoices = useMemo(
    () => ALPHABET.filter((letter) => (groupedVoices[letter] ?? []).length > 0),
    [groupedVoices]
  )

  const jumpToLetter = (letter: string) => {
    const target = document.getElementById(`voice-directory-group-${getLetterAnchor(letter)}`)

    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, voiceId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onSelect(voiceId)
    }
  }

  return (
    <section aria-label="Voice directory" className="voice-directory">
      <header className="voice-directory__toolbar">
        <div className="voice-directory__search-wrap">
          <Search aria-hidden="true" className="voice-directory__search-icon" size={16} />
          <Input
            className="voice-directory__search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search voices..."
            value={query}
          />
        </div>

        <Button
          aria-label="Create voice"
          className="voice-directory__create-button"
          onClick={onCreate}
          size="icon"
          type="button"
          variant="secondary"
        >
          <Plus size={16} />
        </Button>
      </header>

      <div className="voice-directory__body">
        <ScrollArea className="voice-directory__scroll-area">
          <div className="voice-directory__sections">
            {lettersWithVoices.length > 0 ? (
              lettersWithVoices.map((letter) => {
                const entries = groupedVoices[letter] ?? []

                return (
                  <section
                    className="voice-directory__letter-group"
                    id={`voice-directory-group-${getLetterAnchor(letter)}`}
                    key={letter}
                  >
                    <h3 className="voice-directory__letter-heading">{letter}</h3>

                    <div className="voice-directory__letter-items">
                      {entries.map((voice) => {
                        const isSelected = voice.voiceId === selectedId
                        const preview = getVoicePreview(voice)

                        return (
                          <div
                            aria-pressed={isSelected}
                            className={cn("voice-directory__row", isSelected && "is-selected")}
                            key={voice.voiceId}
                            onClick={() => onSelect(voice.voiceId)}
                            onKeyDown={(event) => handleRowKeyDown(event, voice.voiceId)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="voice-directory__content">
                              <p className="voice-directory__name">{voice.voiceName.trim() || "Untitled Voice"}</p>
                              {preview ? (
                                <p className="voice-directory__description">{preview}</p>
                              ) : (
                                <p className="voice-directory__description">No speaker details yet.</p>
                              )}
                            </div>

                            <div className="voice-directory__actions">
                              <span className={cn("voice-directory__method-badge", voice.method === "profile" && "is-profile")}>
                                {voice.method}
                              </span>

                              <Button
                                className="voice-directory__preview-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onPreview(voice.voiceId)
                                }}
                                type="button"
                                variant="secondary"
                              >
                                <Volume2 size={14} />
                                Preview
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })
            ) : (
              <div className="voice-directory__empty-state">
                {voices.length > 0 ? (
                  <>
                    <p>No matching voices.</p>
                    <p>Try a different search query.</p>
                  </>
                ) : (
                  <>
                    <p>No voices yet.</p>
                    <p>Create one to get started.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <aside className="voice-directory__index" aria-label="Voice alphabet index">
          {ALPHABET.map((letter) => {
            const hasItems = (groupedVoices[letter] ?? []).length > 0

            return (
              <button
                className={cn("voice-directory__index-letter", hasItems && "is-enabled")}
                disabled={!hasItems}
                key={letter}
                onClick={() => jumpToLetter(letter)}
                type="button"
              >
                {letter}
              </button>
            )
          })}
        </aside>
      </div>
    </section>
  )
}
