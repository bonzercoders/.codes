import { useCallback, useState } from "react"

import { ChatTimeline } from "@/components/chat/ChatTimeline"
import { HomeInfoDrawer } from "@/components/drawer/HomeInfoDrawer"
import { ChatEditor } from "@/components/editor/ChatEditor"
import { useChatRuntime } from "@/lib/chat-runtime"
import { type LlmSettings, loadSettings, sanitizeSettings, saveSettings } from "@/lib/model-settings"

const MODEL_SETTINGS_DEBOUNCE_MS = 160

export function HomePage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings())

  const runtime = useChatRuntime({
    modelSettings: settings,
    settingsSyncDebounceMs: MODEL_SETTINGS_DEBOUNCE_MS,
  })

  const handleSettingsChange = useCallback((partial: Partial<LlmSettings>) => {
    setSettings((previous) => {
      const next = sanitizeSettings({ ...previous, ...partial })
      saveSettings(next)
      return next
    })
  }, [])

  return (
    <div className="page-canvas home-page">
      <div className="home-page__columns">
        <div className="home-page__column home-page__column--left">
          <HomeInfoDrawer
            isOpen={isDrawerOpen}
            onSettingsChange={handleSettingsChange}
            onToggle={() => setIsDrawerOpen((previous) => !previous)}
            settings={settings}
          />
        </div>

        <div className="home-page__column home-page__column--right">
          <div className="home-page__editor-shell">
            <ChatTimeline
              activeAudioMessageId={runtime.state.activeAudioMessageId}
              activeSpeakerId={runtime.state.activeSpeakerId}
              connectionStatus={runtime.state.connectionStatus}
              messages={runtime.state.messages}
              sttPreviewText={runtime.state.sttPreviewText}
              sttState={runtime.state.sttState}
            />
            <ChatEditor
              isListeningIntent={runtime.isListeningIntent}
              onChange={runtime.setDraftText}
              onSend={runtime.sendMessage}
              onToggleListening={runtime.toggleListening}
              status={runtime.state.connectionStatus}
              sttState={runtime.state.sttState}
              value={runtime.draftText}
            />
            {runtime.lastError ? <p className="home-page__runtime-error">{runtime.lastError.message}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
