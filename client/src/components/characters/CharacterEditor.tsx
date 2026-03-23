import { ChevronDown, MessageCircle, UserRound, X } from "lucide-react"
import { type ChangeEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CHARACTER_TAB_VALUES, type CharacterDraft, type CharacterTab } from "@/lib/characters"
import { cn } from "@/lib/utils"

type CharacterEditorMode = "create" | "edit"

interface CharacterEditorProps {
  mode: CharacterEditorMode
  draft: CharacterDraft
  activeTab: CharacterTab
  onChange: (changes: Partial<CharacterDraft>) => void
  onTabChange: (tab: CharacterTab) => void
  onChat: () => void
  onClose: () => void
  onDelete: () => void
  onSave: () => void
  onImageUpload: (file: File) => void
}

const TAB_ORDER: CharacterTab[] = ["profile", "background", "chats"]

const TAB_LABELS: Record<CharacterTab, string> = {
  profile: "Profile",
  background: "Persona",
  chats: "Chats",
}

function isCharacterTab(value: string): value is CharacterTab {
  return CHARACTER_TAB_VALUES.some((tabValue) => tabValue === value)
}

export function CharacterEditor({
  mode,
  draft,
  activeTab,
  onChange,
  onTabChange,
  onChat,
  onClose,
  onDelete,
  onSave,
  onImageUpload,
}: CharacterEditorProps) {
  const [isGlobalPromptOpen, setIsGlobalPromptOpen] = useState(true)
  const displayName = draft.name.trim() || "Character name"
  const isDeleteEnabled = mode === "edit"

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    onImageUpload(nextFile)
    event.target.value = ""
  }

  return (
    <section aria-label="Character editor" className="character-editor">
      <header className="character-editor__header">
        <h2 className="character-editor__title">{displayName}</h2>

        <button aria-label="Close editor" className="character-editor__close" onClick={onClose} type="button">
          <X size={18} />
        </button>
      </header>

      <Tabs
        className="character-editor__tabs"
        onValueChange={(value) => {
          if (isCharacterTab(value)) {
            onTabChange(value)
          }
        }}
        value={activeTab}
      >
        <div className="character-editor__tabs-header">
          <TabsList className="character-editor__tabs-list" variant="line">
            {TAB_ORDER.map((tabValue) => (
              <TabsTrigger className="character-editor__tabs-trigger" key={tabValue} value={tabValue}>
                {TAB_LABELS[tabValue]}
              </TabsTrigger>
            ))}
          </TabsList>

          <div aria-hidden="true" className="character-editor__tabs-divider" />
        </div>

        <TabsContent className="character-editor__content character-editor__content--profile" value="profile">
          <div className="character-editor__profile-layout">
            <div className="character-editor__image-column">
              <label className="character-editor__image-label" htmlFor="character-editor-image-upload">
                {draft.imageUrl ? (
                  <img alt={displayName} className="character-editor__image" src={draft.imageUrl} />
                ) : (
                  <span className="character-editor__image-empty" aria-hidden="true">
                    <UserRound size={74} />
                    <span>Click to upload image</span>
                  </span>
                )}
              </label>

              <input
                accept="image/*"
                className="character-editor__image-input"
                id="character-editor-image-upload"
                onChange={handleImageSelection}
                type="file"
              />
            </div>

            <div className="character-editor__field-column">
              <div className="character-editor__field-block character-editor__field-block--wide">
                <button
                  aria-controls="character-editor-global-prompt"
                  aria-expanded={isGlobalPromptOpen}
                  className="character-editor__toggle"
                  onClick={() => setIsGlobalPromptOpen((previous) => !previous)}
                  type="button"
                >
                  <span>Global Roleplay System Prompt</span>
                  <ChevronDown className={cn("character-editor__toggle-icon", isGlobalPromptOpen && "is-open")} size={15} />
                </button>

                <div
                  className={cn(
                    "character-editor__collapsible",
                    isGlobalPromptOpen && "is-open"
                  )}
                  id="character-editor-global-prompt"
                >
                  <Textarea
                    className="character-editor__textarea character-editor__textarea--global"
                    onChange={(event) => onChange({ globalRoleplay: event.target.value })}
                    value={draft.globalRoleplay}
                  />
                </div>
              </div>

              <div className="character-editor__field-block character-editor__field-block--narrow">
                <Label className="character-editor__label" htmlFor="character-editor-name">
                  Character Name
                </Label>
                <Input
                  className="character-editor__input"
                  id="character-editor-name"
                  onChange={(event) => onChange({ name: event.target.value })}
                  value={draft.name}
                />
              </div>

              <div className="character-editor__field-block character-editor__field-block--narrow">
                <Label className="character-editor__label" htmlFor="character-editor-voice">
                  Voice ID
                </Label>
                <Input
                  className="character-editor__input"
                  id="character-editor-voice"
                  onChange={(event) => onChange({ voiceId: event.target.value })}
                  placeholder="Enter voice ID"
                  value={draft.voiceId}
                />
              </div>

              <div className="character-editor__field-block character-editor__field-block--wide character-editor__field-block--stretch">
                <Label className="character-editor__label" htmlFor="character-editor-system-prompt">
                  System Prompt
                </Label>
                <Textarea
                  className="character-editor__textarea character-editor__textarea--system"
                  id="character-editor-system-prompt"
                  onChange={(event) => onChange({ systemPrompt: event.target.value })}
                  value={draft.systemPrompt}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent className="character-editor__content character-editor__content--blank" value="background" />
        <TabsContent className="character-editor__content character-editor__content--blank" value="chats" />
      </Tabs>

      <footer className="character-editor__footer">
        <Button
          className="character-editor__delete"
          disabled={!isDeleteEnabled}
          onClick={onDelete}
          type="button"
          variant="secondary"
        >
          Delete
        </Button>

        <div className="character-editor__footer-actions">
          <Button className="character-editor__chat" onClick={onChat} type="button" variant="secondary">
            <MessageCircle size={15} />
            Chat
          </Button>
          <Button className="character-editor__save" onClick={onSave} type="button">
            Save
          </Button>
        </div>
      </footer>
    </section>
  )
}
