import { useState } from "react"

import { ChatTimeline } from "@/components/chat/ChatTimeline"
import { HomeInfoDrawer } from "@/components/drawer/HomeInfoDrawer"
import { ChatEditor } from "@/components/editor/ChatEditor"
import { useChatRuntimeContext } from "@/lib/chat-runtime-context"

export function HomePage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { runtime, settings, updateSettings } = useChatRuntimeContext()

  return (
    <div className="page-canvas home-page">
      <div className="home-page__columns">
        <div className="home-page__column home-page__column--left">
          <HomeInfoDrawer
            isOpen={isDrawerOpen}
            onSettingsChange={updateSettings}
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
