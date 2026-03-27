import { useEffect, useMemo, useRef, useState } from "react"

import { CharacterDirectory } from "@/components/characters/CharacterDirectory"
import { CharacterEditor } from "@/components/characters/CharacterEditor"
import {
  type Character,
  type CharacterDraft,
  type CharacterTab,
  type CharacterVoiceOption,
  createCharacterId,
  createEmptyCharacterDraft,
  toCharacterDraft,
} from "@/lib/characters"
import {
  deleteCharacter,
  fetchCharacters,
  insertCharacter,
  setCharacterActiveState,
  updateCharacter,
} from "@/lib/supabase/characters"
import { fetchVoices } from "@/lib/supabase/voices"
import { cn } from "@/lib/utils"

const EDITOR_TRANSITION_MS = 220
const EDITOR_ENTER_DELAY_MS = 18

type EditorMode = "create" | "edit"
type EditorPhase = "hidden" | "entering" | "entered" | "exiting"

function toVoiceOptions(voices: Awaited<ReturnType<typeof fetchVoices>>): CharacterVoiceOption[] {
  return voices
    .map((voice) => ({
      value: voice.voiceId,
      label: voice.voiceName.trim() || voice.voiceId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [voiceOptions, setVoiceOptions] = useState<CharacterVoiceOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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

  const voiceOptionValues = useMemo(
    () => new Set(voiceOptions.map((option) => option.value)),
    [voiceOptions]
  )

  useEffect(() => {
    let isMounted = true

    Promise.all([fetchCharacters(), fetchVoices()])
      .then(([characterRows, voiceRows]) => {
        if (!isMounted) {
          return
        }

        setCharacters(characterRows)
        setVoiceOptions(toVoiceOptions(voiceRows))
        setErrorMessage(null)
      })
      .catch((error) => {
        console.error("Failed to load characters page data:", error)

        if (!isMounted) {
          return
        }

        setErrorMessage("Failed to load characters or voices. Please refresh and try again.")
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
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

  const updateCharacterCollection = (updatedCharacter: Character) => {
    setCharacters((previousCharacters) =>
      previousCharacters.map((character) => (character.id === updatedCharacter.id ? updatedCharacter : character))
    )

    if (selectedCharacterId === updatedCharacter.id) {
      setDraft(toCharacterDraft(updatedCharacter))
    }
  }

  const toggleCharacterChatState = async (characterId: string) => {
    const targetCharacter = characters.find((character) => character.id === characterId)

    if (!targetCharacter) {
      return
    }

    try {
      const updatedCharacter = await setCharacterActiveState(characterId, !targetCharacter.isActive)

      updateCharacterCollection(updatedCharacter)
      setErrorMessage(null)
    } catch (error) {
      console.error("Failed to toggle character chat state:", error)
      setErrorMessage("Could not update chat status for this character. Please try again.")
    }
  }

  const handleSave = async () => {
    const normalizedName = draft.name.trim()
    const hasValidVoiceSelection = draft.voiceId === "" || voiceOptionValues.has(draft.voiceId)
    const saveDraft = {
      ...draft,
      name: normalizedName || "Untitled",
      voiceId: hasValidVoiceSelection ? draft.voiceId : "",
    }

    try {
      if (editorMode === "create") {
        const id = createCharacterId()
        const created = await insertCharacter(saveDraft, id)

        setCharacters((prev) => [created, ...prev])
        setSelectedCharacterId(created.id)
        setEditorMode("edit")
        setDraft(toCharacterDraft(created))
        setErrorMessage(null)
        return
      }

      if (!selectedCharacterId) {
        return
      }

      const updated = await updateCharacter(selectedCharacterId, saveDraft)

      updateCharacterCollection(updated)
      setErrorMessage(null)
    } catch (error) {
      console.error("Failed to save character:", error)
      setErrorMessage("Could not save this character. Please try again.")
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

      setErrorMessage(null)

      unmountEditorWithPop(() => {
        setSelectedCharacterId(null)
        setEditorMode("create")
        setActiveTab("profile")
        setDraft(createEmptyCharacterDraft())
      })
    } catch (error) {
      console.error("Failed to delete character:", error)
      setErrorMessage("Could not delete this character. Please try again.")
    }
  }

  const handleDirectoryChat = (characterId: string) => {
    void toggleCharacterChatState(characterId)
  }

  const handleEditorChat = () => {
    if (editorMode !== "edit" || !selectedCharacterId) {
      setErrorMessage("Save this character first, then enable chat.")
      return
    }

    void toggleCharacterChatState(selectedCharacterId)
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
      {errorMessage ? (
        <div
          role="alert"
          style={{
            border: "1px solid rgba(246, 90, 87, 0.45)",
            borderRadius: "10px",
            color: "#f7b4b3",
            marginBottom: "12px",
            padding: "10px 12px",
          }}
        >
          {errorMessage}
        </div>
      ) : null}

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
              isChatActive={selectedCharacter?.isActive ?? false}
              mode={editorMode}
              onChange={(changes) => setDraft((previousDraft) => ({ ...previousDraft, ...changes }))}
              onChat={handleEditorChat}
              onClose={closeEditor}
              onDelete={handleDelete}
              onImageUpload={handleImageUpload}
              onSave={handleSave}
              onTabChange={setActiveTab}
              voiceOptions={voiceOptions}
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
