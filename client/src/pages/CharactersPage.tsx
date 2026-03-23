import { useEffect, useMemo, useRef, useState } from "react"

import { CharacterDirectory } from "@/components/characters/CharacterDirectory"
import { CharacterEditor } from "@/components/characters/CharacterEditor"
import {
  type Character,
  type CharacterDraft,
  type CharacterTab,
  createCharacterId,
  createEmptyCharacterDraft,
  toCharacterDraft,
} from "@/lib/characters"
import {
  deleteCharacter,
  fetchCharacters,
  insertCharacter,
  updateCharacter,
} from "@/lib/supabase/characters"
import { cn } from "@/lib/utils"

const EDITOR_TRANSITION_MS = 220
const EDITOR_ENTER_DELAY_MS = 18

type EditorMode = "create" | "edit"
type EditorPhase = "hidden" | "entering" | "entered" | "exiting"

export function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>("create")
  const [activeTab, setActiveTab] = useState<CharacterTab>("profile")
  const [draft, setDraft] = useState<CharacterDraft>(createEmptyCharacterDraft)
  const [editorPhase, setEditorPhase] = useState<EditorPhase>("hidden")

  const enterTimerRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | null>(null)

  const selectedCharacter = useMemo(
    () => (selectedCharacterId ? characters.find((character) => character.id === selectedCharacterId) ?? null : null),
    [characters, selectedCharacterId]
  )

  useEffect(() => {
    fetchCharacters()
      .then(setCharacters)
      .catch((error) => console.error("Failed to load characters:", error))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    return () => {
      if (enterTimerRef.current !== null) {
        window.clearTimeout(enterTimerRef.current)
      }

      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
      }
    }
  }, [])

  const clearAnimationTimers = () => {
    if (enterTimerRef.current !== null) {
      window.clearTimeout(enterTimerRef.current)
      enterTimerRef.current = null
    }

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }

  const mountEditorWithPop = () => {
    clearAnimationTimers()
    setIsEditorOpen(true)
    setEditorPhase("entering")

    enterTimerRef.current = window.setTimeout(() => {
      setEditorPhase("entered")
      enterTimerRef.current = null
    }, EDITOR_ENTER_DELAY_MS)
  }

  const unmountEditorWithPop = (onAfter?: () => void) => {
    if (!isEditorOpen) {
      setEditorPhase("hidden")
      onAfter?.()
      return
    }

    clearAnimationTimers()
    setEditorPhase("exiting")

    exitTimerRef.current = window.setTimeout(() => {
      setIsEditorOpen(false)
      setEditorPhase("hidden")
      exitTimerRef.current = null
      onAfter?.()
    }, EDITOR_TRANSITION_MS)
  }

  const transitionEditor = (applyState: () => void) => {
    if (!isEditorOpen) {
      applyState()
      mountEditorWithPop()
      return
    }

    unmountEditorWithPop(() => {
      applyState()
      mountEditorWithPop()
    })
  }

  const openCreateEditor = () => {
    transitionEditor(() => {
      setEditorMode("create")
      setSelectedCharacterId(null)
      setActiveTab("profile")
      setDraft(createEmptyCharacterDraft())
    })
  }

  const openEditEditor = (characterId: string) => {
    const character = characters.find((entry) => entry.id === characterId)

    if (!character) {
      return
    }

    if (isEditorOpen && editorMode === "edit" && selectedCharacterId === characterId) {
      return
    }

    transitionEditor(() => {
      setEditorMode("edit")
      setSelectedCharacterId(characterId)
      setActiveTab("profile")
      setDraft(toCharacterDraft(character))
    })
  }

  const closeEditor = () => {
    const resetDraft = editorMode === "edit" && selectedCharacter ? toCharacterDraft(selectedCharacter) : createEmptyCharacterDraft()

    unmountEditorWithPop(() => {
      setActiveTab("profile")
      setDraft(resetDraft)
    })
  }

  const handleSave = async () => {
    const normalizedName = draft.name.trim()
    const saveDraft = { ...draft, name: normalizedName || "Untitled" }

    try {
      if (editorMode === "create") {
        const id = createCharacterId()
        const created = await insertCharacter(saveDraft, id)

        setCharacters((prev) => [created, ...prev])
        setSelectedCharacterId(created.id)
        setEditorMode("edit")
        setDraft(toCharacterDraft(created))
        return
      }

      if (!selectedCharacterId) {
        return
      }

      const updated = await updateCharacter(selectedCharacterId, saveDraft)

      setCharacters((prev) =>
        prev.map((character) => (character.id === selectedCharacterId ? updated : character))
      )

      setDraft(toCharacterDraft(updated))
    } catch (error) {
      console.error("Failed to save character:", error)
    }
  }

  const handleDelete = async () => {
    if (editorMode !== "edit" || !selectedCharacterId) {
      return
    }

    try {
      await deleteCharacter(selectedCharacterId)

      setCharacters((prev) =>
        prev.filter((character) => character.id !== selectedCharacterId)
      )

      unmountEditorWithPop(() => {
        setSelectedCharacterId(null)
        setEditorMode("create")
        setActiveTab("profile")
        setDraft(createEmptyCharacterDraft())
      })
    } catch (error) {
      console.error("Failed to delete character:", error)
    }
  }

  const handleDirectoryChat = (characterId: string) => {
    // Placeholder action by design.
    void characterId
  }

  const handleImageUpload = (file: File) => {
    const fileReader = new FileReader()

    fileReader.onload = () => {
      const imageUrl = typeof fileReader.result === "string" ? fileReader.result : ""

      if (!imageUrl) {
        return
      }

      setDraft((previousDraft) => ({
        ...previousDraft,
        imageUrl,
      }))
    }

    fileReader.readAsDataURL(file)
  }

  const editorShellClassName = cn(
    "characters-page__editor-shell",
    editorPhase === "entering" && "is-entering",
    editorPhase === "entered" && "is-entered",
    editorPhase === "exiting" && "is-exiting"
  )

  if (isLoading) {
    return (
      <div className="page-canvas characters-page">
        <div className="characters-page__loading">Loading characters...</div>
      </div>
    )
  }

  return (
    <div className="page-canvas characters-page">
      <div className="characters-page__split-shell">
        <CharacterDirectory
          characters={characters}
          onChat={handleDirectoryChat}
          onCreate={openCreateEditor}
          onSelect={openEditEditor}
          selectedId={selectedCharacterId}
        />

        {isEditorOpen ? (
          <div className={editorShellClassName}>
            <CharacterEditor
              activeTab={activeTab}
              draft={draft}
              mode={editorMode}
              onChange={(changes) => setDraft((previousDraft) => ({ ...previousDraft, ...changes }))}
              onChat={() => setActiveTab("chats")}
              onClose={closeEditor}
              onDelete={handleDelete}
              onImageUpload={handleImageUpload}
              onSave={handleSave}
              onTabChange={setActiveTab}
            />
          </div>
        ) : (
          <section className="characters-page__editor-empty" aria-label="Character editor placeholder">
            <h2 className="characters-page__editor-empty-title">Character Editor</h2>
            <p className="characters-page__editor-empty-copy">
              Select a character from the directory or create a new one to begin editing.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
