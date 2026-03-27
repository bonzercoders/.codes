import { MessageCircle, Plus, Search, UserRound } from "lucide-react"
import { useMemo, useState, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Character } from "@/lib/characters"
import { cn } from "@/lib/utils"

interface CharacterDirectoryProps {
  characters: Character[]
  selectedId: string | null
  onSelect: (characterId: string) => void
  onCreate: () => void
  onChat: (characterId: string) => void
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

function getPromptPreview(character: Character, limit = 106): string {
  const promptSource =
    character.systemPrompt.trim() || character.globalRoleplay.trim()

  if (!promptSource) {
    return ""
  }

  if (promptSource.length <= limit) {
    return promptSource
  }

  return `${promptSource.slice(0, limit)}...`
}

function getInitials(name: string): string {
  const segments = name.trim().split(/\s+/).filter(Boolean)

  if (!segments.length) {
    return "CH"
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("")
}

export function CharacterDirectory({ characters, selectedId, onSelect, onCreate, onChat }: CharacterDirectoryProps) {
  const [query, setQuery] = useState("")

  const filteredCharacters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return characters
    }

    return characters.filter((character) => {
      const haystack = `${character.name} ${character.systemPrompt}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [characters, query])

  const groupedCharacters = useMemo(() => {
    const groups: Record<string, Character[]> = {}

    filteredCharacters.forEach((character) => {
      const letter = toLetter(character.name)
      const targetGroup = groups[letter] ?? []
      targetGroup.push(character)
      groups[letter] = targetGroup
    })

    Object.keys(groups).forEach((letter) => {
      groups[letter] = groups[letter].slice().sort((left, right) => left.name.localeCompare(right.name))
    })

    return groups
  }, [filteredCharacters])

  const lettersWithCharacters = useMemo(
    () => ALPHABET.filter((letter) => (groupedCharacters[letter] ?? []).length > 0),
    [groupedCharacters]
  )

  const jumpToLetter = (letter: string) => {
    const target = document.getElementById(`character-directory-group-${getLetterAnchor(letter)}`)

    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, characterId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onSelect(characterId)
    }
  }

  return (
    <section aria-label="Character directory" className="character-directory">
      <header className="character-directory__toolbar">
        <div className="character-directory__search-wrap">
          <Search aria-hidden="true" className="character-directory__search-icon" size={16} />
          <Input
            className="character-directory__search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search characters..."
            value={query}
          />
        </div>

        <Button
          aria-label="Create character"
          className="character-directory__create-button"
          onClick={onCreate}
          size="icon"
          type="button"
          variant="secondary"
        >
          <Plus size={16} />
        </Button>
      </header>

      <div className="character-directory__body">
        <ScrollArea className="character-directory__scroll-area">
          <div className="character-directory__sections">
            {lettersWithCharacters.length > 0 ? (
              lettersWithCharacters.map((letter) => {
                const entries = groupedCharacters[letter] ?? []

                return (
                  <section
                    className="character-directory__letter-group"
                    id={`character-directory-group-${getLetterAnchor(letter)}`}
                    key={letter}
                  >
                    <h3 className="character-directory__letter-heading">{letter}</h3>

                    <div className="character-directory__letter-items">
                      {entries.map((character) => {
                        const isSelected = character.id === selectedId
                        const isChatActive = character.isActive
                        const promptPreview = getPromptPreview(character)

                        return (
                          <div
                            aria-pressed={isSelected}
                            className={cn(
                              "character-directory__row",
                              isSelected && "is-selected"
                            )}
                            key={character.id}
                            onClick={() => onSelect(character.id)}
                            onKeyDown={(event) => handleRowKeyDown(event, character.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="character-directory__media" aria-hidden="true">
                              {character.imageUrl ? (
                                <img alt={character.name.trim() || "Character"} src={character.imageUrl} />
                              ) : (
                                <span className="character-directory__media-fallback">
                                  <UserRound size={14} />
                                  {getInitials(character.name)}
                                </span>
                              )}
                            </div>

                            <div className="character-directory__content">
                              <p className="character-directory__name">{character.name.trim() || "Untitled"}</p>
                              {promptPreview ? (
                                <p className="character-directory__description">{promptPreview}</p>
                              ) : (
                                <p className="character-directory__description">No character summary yet.</p>
                              )}
                            </div>

                            <div className="character-directory__actions">
                              <Button
                                className={cn(
                                  "character-directory__chat-button",
                                  isChatActive && "is-active"
                                )}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onChat(character.id)
                                }}
                                type="button"
                                variant="secondary"
                              >
                                <MessageCircle size={14} />
                                Chat
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
              <div className="character-directory__empty-state">
                {characters.length > 0 ? (
                  <>
                    <p>No matching characters.</p>
                    <p>Try a different search query.</p>
                  </>
                ) : (
                  <>
                    <p>No characters yet.</p>
                    <p>Create one to get started.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <aside className="character-directory__index" aria-label="Character alphabet index">
          {ALPHABET.map((letter) => {
            const hasItems = (groupedCharacters[letter] ?? []).length > 0

            return (
              <button
                className={cn("character-directory__index-letter", hasItems && "is-enabled")}
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
