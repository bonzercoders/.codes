/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react"

import { useChatRuntime } from "@/lib/chat-runtime"
import { type LlmSettings, loadSettings, sanitizeSettings, saveSettings } from "@/lib/model-settings"

const MODEL_SETTINGS_DEBOUNCE_MS = 160

interface ChatRuntimeContextValue {
  runtime: ReturnType<typeof useChatRuntime>
  settings: LlmSettings
  updateSettings: (partial: Partial<LlmSettings>) => void
}

const ChatRuntimeContext = createContext<ChatRuntimeContextValue | null>(null)

export function ChatRuntimeProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings())

  const runtime = useChatRuntime({
    modelSettings: settings,
    settingsSyncDebounceMs: MODEL_SETTINGS_DEBOUNCE_MS,
  })

  const updateSettings = useCallback((partial: Partial<LlmSettings>) => {
    setSettings((previous) => {
      const next = sanitizeSettings({ ...previous, ...partial })
      saveSettings(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ runtime, settings, updateSettings }),
    [runtime, settings, updateSettings]
  )

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>
}

export function useChatRuntimeContext() {
  const context = useContext(ChatRuntimeContext)

  if (!context) {
    throw new Error("useChatRuntimeContext must be used within a ChatRuntimeProvider")
  }

  return context
}

