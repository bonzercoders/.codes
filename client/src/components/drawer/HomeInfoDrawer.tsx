import { useEffect, useState } from "react"

import arrowRightIcon from "@/assets/arrow-right.png"
import { ModelCombobox } from "@/components/registry/combobox-02"
import { ParameterSlider } from "@/components/registry/p-slider-7"
import {
  type LlmNumericParameterKey,
  type LlmSettings,
  PARAMETER_DEFS,
} from "@/lib/model-settings"
import { listOpenRouterModelGroups, type ModelGroup } from "@/lib/openrouter-models"

interface HomeInfoDrawerProps {
  isOpen: boolean
  onToggle: () => void
  settings: LlmSettings
  onSettingsChange: (partial: Partial<LlmSettings>) => void
}

export function HomeInfoDrawer({ isOpen, onToggle, settings, onSettingsChange }: HomeInfoDrawerProps) {
  const drawerClassName = isOpen ? "home-info-drawer is-open" : "home-info-drawer"

  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([])
  const [isModelLoading, setIsModelLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)

  useEffect(() => {
    let isSubscribed = true

    const loadModels = async () => {
      setIsModelLoading(true)
      setModelsError(null)

      try {
        const groups = await listOpenRouterModelGroups()
        if (!isSubscribed) {
          return
        }

        setModelGroups(groups)

        if (groups.length === 0) {
          setModelsError("No models were returned.")
        }
      } catch (error) {
        if (!isSubscribed) {
          return
        }

        const message = error instanceof Error ? error.message : "Unable to load models."
        setModelsError(message)
      } finally {
        if (isSubscribed) {
          setIsModelLoading(false)
        }
      }
    }

    void loadModels()

    return () => {
      isSubscribed = false
    }
  }, [])

  const handleNumericChange = (key: LlmNumericParameterKey, value: number) => {
    onSettingsChange({ [key]: value } as Partial<LlmSettings>)
  }

  return (
    <div className={drawerClassName}>
      <div className="home-info-drawer__panel">
        <section className="home-info-drawer__section home-info-drawer__section--llm" aria-label="LLM settings">
          <div className="home-info-drawer__llm-grid">
            <div className="home-info-drawer__llm-parameters">
              {PARAMETER_DEFS.map((parameter) => (
                <ParameterSlider
                  accent={parameter.accent}
                  key={parameter.key}
                  label={parameter.label}
                  max={parameter.max}
                  min={parameter.min}
                  onChange={(value) => handleNumericChange(parameter.key, value)}
                  step={parameter.step}
                  value={settings[parameter.key]}
                />
              ))}
            </div>

            <div className="home-info-drawer__llm-model">
              <ModelCombobox
                error={modelsError}
                groups={modelGroups}
                loading={isModelLoading}
                onValueChange={(model) => onSettingsChange({ model })}
                value={settings.model}
              />
            </div>
          </div>
        </section>

        <section className="home-info-drawer__section" aria-label="STT settings" />
        <section className="home-info-drawer__section" aria-label="TTS settings" />
      </div>

      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Collapse home info drawer" : "Expand home info drawer"}
        className="home-info-drawer__toggle"
        onClick={onToggle}
        type="button"
      >
        <img alt="" aria-hidden="true" className="home-info-drawer__icon" src={arrowRightIcon} />
      </button>
    </div>
  )
}
