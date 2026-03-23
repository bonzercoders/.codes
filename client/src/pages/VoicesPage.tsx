import { useEffect, useRef, useState } from "react"

import { VoiceDirectory } from "@/components/voices/VoiceDirectory"
import { VoiceEditor } from "@/components/voices/VoiceEditor"
import {
  createEmptyVoiceDraft,
  createVoiceId,
  toVoiceDraft,
  type Voice,
  type VoiceDraft,
} from "@/lib/voices"
import {
  deleteVoice,
  fetchVoices,
  insertVoice,
  updateVoice,
} from "@/lib/supabase/voices"
import { cn } from "@/lib/utils"

const EDITOR_TRANSITION_MS = 220
const EDITOR_ENTER_DELAY_MS = 18

type EditorMode = "create" | "edit"
type EditorPhase = "hidden" | "entering" | "entered" | "exiting"

export function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>("create")
  const [draft, setDraft] = useState<VoiceDraft>(createEmptyVoiceDraft)
  const [editorPhase, setEditorPhase] = useState<EditorPhase>("hidden")

  const enterTimerRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | null>(null)

  useEffect(() => {
    fetchVoices()
      .then(setVoices)
      .catch((error) => console.error("Failed to load voices:", error))
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
      setSelectedVoiceId(null)
      setDraft(createEmptyVoiceDraft())
    })
  }

  const openEditEditor = (voiceId: string) => {
    const voice = voices.find((entry) => entry.voiceId === voiceId)

    if (!voice) {
      return
    }

    if (isEditorOpen && editorMode === "edit" && selectedVoiceId === voiceId) {
      return
    }

    transitionEditor(() => {
      setEditorMode("edit")
      setSelectedVoiceId(voiceId)
      setDraft(toVoiceDraft(voice))
    })
  }

  const handleSave = async () => {
    const normalizedName = draft.voiceName.trim()
    const saveDraft = { ...draft, voiceName: normalizedName || "Untitled Voice" }

    try {
      if (editorMode === "create") {
        const id = createVoiceId()
        const created = await insertVoice(saveDraft, id)

        setVoices((prev) => [created, ...prev])
        setSelectedVoiceId(created.voiceId)
        setEditorMode("edit")
        setDraft(toVoiceDraft(created))
        return
      }

      if (!selectedVoiceId) {
        return
      }

      const updated = await updateVoice(selectedVoiceId, saveDraft)

      setVoices((prev) =>
        prev.map((voice) => (voice.voiceId === selectedVoiceId ? updated : voice))
      )

      setDraft(toVoiceDraft(updated))
    } catch (error) {
      console.error("Failed to save voice:", error)
    }
  }

  const handleDelete = async () => {
    if (editorMode !== "edit" || !selectedVoiceId) {
      return
    }

    try {
      await deleteVoice(selectedVoiceId)

      setVoices((prev) => prev.filter((voice) => voice.voiceId !== selectedVoiceId))

      unmountEditorWithPop(() => {
        setSelectedVoiceId(null)
        setEditorMode("create")
        setDraft(createEmptyVoiceDraft())
      })
    } catch (error) {
      console.error("Failed to delete voice:", error)
    }
  }

  const handlePreview = (voiceId: string) => {
    // Placeholder action by design.
    void voiceId
  }

  const editorShellClassName = cn(
    "voices-page__editor-shell",
    editorPhase === "entering" && "is-entering",
    editorPhase === "entered" && "is-entered",
    editorPhase === "exiting" && "is-exiting"
  )

  if (isLoading) {
    return (
      <div className="page-canvas voices-page">
        <div className="voices-page__loading">Loading voices...</div>
      </div>
    )
  }

  return (
    <div className="page-canvas voices-page">
      <div className="voices-page__split-shell">
        <VoiceDirectory
          onCreate={openCreateEditor}
          onPreview={handlePreview}
          onSelect={openEditEditor}
          selectedId={selectedVoiceId}
          voices={voices}
        />

        {isEditorOpen ? (
          <div className={editorShellClassName}>
            <VoiceEditor
              mode={editorMode}
              onChange={(changes) => setDraft((previousDraft) => ({ ...previousDraft, ...changes }))}
              onDelete={handleDelete}
              onSave={handleSave}
              voiceDraft={draft}
            />
          </div>
        ) : (
          <section className="voices-page__editor-empty" aria-label="Voice editor placeholder">
            <h2 className="voices-page__editor-empty-title">Voice Editor</h2>
            <p className="voices-page__editor-empty-copy">
              Select a voice from the directory or create a new one to begin editing.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
