import { type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { type VoiceDraft, type VoiceMethod } from "@/lib/voices"
import { cn } from "@/lib/utils"

type VoiceEditorMode = "create" | "edit"

interface VoiceEditorProps {
  mode: VoiceEditorMode
  voiceDraft: VoiceDraft
  onChange: (updates: Partial<VoiceDraft>) => void
  onDelete: () => void
  onSave: () => void
}

const METHOD_OPTIONS: { description: string; title: string; value: VoiceMethod }[] = [
  {
    description: "Build from reference text and audio.",
    title: "Clone",
    value: "clone",
  },
  {
    description: "Build from a written profile only.",
    title: "Profile",
    value: "profile",
  },
]

export function VoiceEditor({ mode, voiceDraft, onChange, onDelete, onSave }: VoiceEditorProps) {
  const isDeleteEnabled = mode === "edit"

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave()
  }

  return (
    <section aria-label="Voice editor" className="voice-editor">
      <form className="voice-editor__form" onSubmit={handleSubmit}>
        <ScrollArea className="voice-editor__scroll-area">
          <div className="voice-editor__fields">
            <div className="voice-editor__field-group">
              <Label className="voice-editor__label" htmlFor="voice-editor-name">
                Voice Name
              </Label>
              <Input
                className="voice-editor__input"
                id="voice-editor-name"
                onChange={(event) => onChange({ voiceName: event.target.value })}
                placeholder="Enter voice name"
                value={voiceDraft.voiceName}
              />
            </div>

            <div className="voice-editor__field-group">
              <Label className="voice-editor__label">Method</Label>
              <div aria-label="Voice method" className="voice-editor__method-grid" role="radiogroup">
                {METHOD_OPTIONS.map((option) => {
                  const isSelected = voiceDraft.method === option.value

                  return (
                    <button
                      aria-checked={isSelected}
                      className={cn("voice-editor__method-card", isSelected && "is-selected")}
                      key={option.value}
                      onClick={() => onChange({ method: option.value })}
                      role="radio"
                      type="button"
                    >
                      <span className="voice-editor__method-header">
                        <span aria-hidden="true" className="voice-editor__method-dot" />
                        <span className="voice-editor__method-title">{option.title}</span>
                      </span>
                      <span className="voice-editor__method-description">{option.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="voice-editor__field-group">
              <Label className="voice-editor__label" htmlFor="voice-editor-scene-prompt">
                Scene Prompt
              </Label>
              <Textarea
                className="voice-editor__textarea voice-editor__textarea--scene"
                id="voice-editor-scene-prompt"
                onChange={(event) => onChange({ scenePrompt: event.target.value })}
                placeholder="Enter scene prompt"
                value={voiceDraft.scenePrompt}
              />
            </div>

            <div className="voice-editor__references">
              <div className="voice-editor__field-group">
                <Label className="voice-editor__label" htmlFor="voice-editor-reference-text">
                  Reference Text
                </Label>
                <Input
                  className="voice-editor__input"
                  id="voice-editor-reference-text"
                  onChange={(event) => onChange({ refText: event.target.value })}
                  placeholder="Enter reference text path"
                  value={voiceDraft.refText}
                />
              </div>

              <div className="voice-editor__field-group">
                <Label className="voice-editor__label" htmlFor="voice-editor-reference-audio">
                  Reference Audio
                </Label>
                <Input
                  className="voice-editor__input"
                  id="voice-editor-reference-audio"
                  onChange={(event) => onChange({ refAudio: event.target.value })}
                  placeholder="Enter reference audio path"
                  value={voiceDraft.refAudio}
                />
              </div>
            </div>

            <div className="voice-editor__field-group">
              <Label className="voice-editor__label" htmlFor="voice-editor-speaker-description">
                Speaker Description
              </Label>
              <Textarea
                className="voice-editor__textarea voice-editor__textarea--speaker"
                id="voice-editor-speaker-description"
                onChange={(event) => onChange({ speakerDesc: event.target.value })}
                placeholder="Enter speaker description"
                value={voiceDraft.speakerDesc}
              />
            </div>
          </div>
        </ScrollArea>

        <footer className="voice-editor__footer">
          <Button className="voice-editor__save" type="submit">
            Save
          </Button>

          <Button
            className="voice-editor__delete"
            disabled={!isDeleteEnabled}
            onClick={onDelete}
            type="button"
            variant="secondary"
          >
            Delete
          </Button>
        </footer>
      </form>
    </section>
  )
}
