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
const MAX_VOICE_ID_RETRIES = 3

type EditorMode = "create" | "edit"
type EditorPhase = "hidden" | "entering" | "entered" | "exiting"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

function isVoiceIdConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const candidate = error as { code?: unknown; details?: unknown; message?: unknown }
  const code = typeof candidate.code === "string" ? candidate.code : ""
  const details = typeof candidate.details === "string" ? candidate.details.toLowerCase() : ""
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : ""

  if (code === "23505") {
    return true
  }

  return (details.includes("voice_id") || message.includes("voice_id")) &&
    (details.includes("duplicate") || message.includes("duplicate"))
}

export function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>("create")
  const [draft, setDraft] = useState<VoiceDraft>(createEmptyVoiceDraft)
  const [editorPhase, setEditorPhase] = useState<EditorPhase>("hidden")

  const enterTimerRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let isMounted = true

    fetchVoices()
      .then((voiceRows) => {
        if (!isMounted) {
          return
        }

        setVoices(voiceRows)
        setErrorMessage(null)
      })
      .catch((error) => {
        console.error("Failed to load voices:", error)

        if (!isMounted) {
          return
        }

        setErrorMessage("Failed to load voices. Please refresh and try again.")
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

  const createVoiceWithDeterministicId = async (saveDraft: VoiceDraft): Promise<Voice> => {
    let latestVoices = voices

    for (let attempt = 0; attempt < MAX_VOICE_ID_RETRIES; attempt += 1) {
      const nextVoiceId = createVoiceId(
        saveDraft.voiceName,
        latestVoices.map((voice) => voice.voiceId)
      )

      try {
        return await insertVoice(saveDraft, nextVoiceId)
      } catch (error) {
        if (!isVoiceIdConflictError(error)) {
          throw error
        }

        latestVoices = await fetchVoices()
        setVoices(latestVoices)
      }
    }

    throw new Error("Could not allocate a unique voice ID. Please try again.")
  }

  const handleSave = async () => {
    const normalizedName = draft.voiceName.trim()
    const saveDraft = { ...draft, voiceName: normalizedName || "Untitled Voice" }

    try {
      if (editorMode === "create") {
        const created = await createVoiceWithDeterministicId(saveDraft)

        setVoices((prev) => [created, ...prev.filter((voice) => voice.voiceId !== created.voiceId)])
        setSelectedVoiceId(created.voiceId)
        setEditorMode("edit")
        setDraft(toVoiceDraft(created))
        setErrorMessage(null)
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
      setErrorMessage(null)
    } catch (error) {
      console.error("Failed to save voice:", error)
      setErrorMessage(getErrorMessage(error, "Could not save this voice. Please try again."))
    }
  }

  const handleDelete = async () => {
    if (editorMode !== "edit" || !selectedVoiceId) {
      return
    }

    try {
      await deleteVoice(selectedVoiceId)

      setVoices((prev) => prev.filter((voice) => voice.voiceId !== selectedVoiceId))
      setErrorMessage(null)

      unmountEditorWithPop(() => {
        setSelectedVoiceId(null)
        setEditorMode("create")
        setDraft(createEmptyVoiceDraft())
      })
    } catch (error) {
      console.error("Failed to delete voice:", error)
      setErrorMessage(getErrorMessage(error, "Could not delete this voice. Please try again."))
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
