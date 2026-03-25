import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"

import { HelpCircleIcon } from "lucide-react"
import { motion } from "motion/react"

import arrowRightIcon from "@/assets/arrow-right.png"
import { ModelCombobox } from "@/components/registry/combobox-02"
import { ParameterSlider } from "@/components/registry/p-slider-7"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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

const TAB_VALUES = ["llm", "stt", "tts"] as const

type DrawerTab = (typeof TAB_VALUES)[number]

type SttModelOption = "small.en" | "medium.en" | "large" | "turbo"

type SttSliderKey =
  | "realtime_processing_pause"
  | "silero_sensitivity"
  | "webrtc_sensitivity"
  | "post_speech_silence_duration"
  | "min_length_of_recording"
  | "pre_recording_buffer_duration"

interface SttSliderDefinition {
  key: SttSliderKey
  label: string
  min: number
  max: number
  step: number
  defaultValue: number
}

const STT_MODEL_OPTIONS: SttModelOption[] = ["small.en", "medium.en", "large", "turbo"]

const STT_SLIDER_DEFS: SttSliderDefinition[] = [
  {
    key: "realtime_processing_pause",
    label: "realtime processing pause",
    min: 0,
    max: 1,
    step: 0.1,
    defaultValue: 0.2,
  },
  {
    key: "silero_sensitivity",
    label: "silero sensitivity",
    min: 0,
    max: 1,
    step: 0.1,
    defaultValue: 0.2,
  },
  {
    key: "webrtc_sensitivity",
    label: "webrtc sensitivity",
    min: 0,
    max: 3,
    step: 1,
    defaultValue: 3,
  },
  {
    key: "post_speech_silence_duration",
    label: "post speech silence duration",
    min: 0,
    max: 2,
    step: 0.1,
    defaultValue: 0.9,
  },
  {
    key: "min_length_of_recording",
    label: "min length of recording",
    min: 0,
    max: 3,
    step: 0.1,
    defaultValue: 1.0,
  },
  {
    key: "pre_recording_buffer_duration",
    label: "pre recording buffer duration",
    min: 0,
    max: 3,
    step: 0.1,
    defaultValue: 1.0,
  },
]

type SttBottomSwitchKey = "normalize_audio" | "faster_whisper_vad_filter" | "start_callback_in_new_thread"

const STT_BOTTOM_SWITCHES: Array<{ key: SttBottomSwitchKey; label: string }> = [
  {
    key: "normalize_audio",
    label: "normalize audio",
  },
  {
    key: "faster_whisper_vad_filter",
    label: "faster whisper vad filter",
  },
  {
    key: "start_callback_in_new_thread",
    label: "start callback in new thread",
  },
]

const LLM_SLIDER_ACCENT = "#2b7fff"

const TAB_LABELS: Record<DrawerTab, string> = {
  llm: "LLM",
  stt: "STT",
  tts: "TTS",
}

function isDrawerTab(value: string): value is DrawerTab {
  return TAB_VALUES.some((tabValue) => tabValue === value)
}

function createSttSliderDefaults(): Record<SttSliderKey, number> {
  return STT_SLIDER_DEFS.reduce(
    (accumulator, definition) => {
      accumulator[definition.key] = definition.defaultValue
      return accumulator
    },
    {} as Record<SttSliderKey, number>
  )
}

function createSttSliderSwitchDefaults(): Record<SttSliderKey, boolean> {
  return STT_SLIDER_DEFS.reduce(
    (accumulator, definition) => {
      accumulator[definition.key] = false
      return accumulator
    },
    {} as Record<SttSliderKey, boolean>
  )
}

function createSttBottomSwitchDefaults(): Record<SttBottomSwitchKey, boolean> {
  return STT_BOTTOM_SWITCHES.reduce(
    (accumulator, definition) => {
      accumulator[definition.key] = false
      return accumulator
    },
    {} as Record<SttBottomSwitchKey, boolean>
  )
}

function formatSliderValue(value: number, step: number): string {
  const stepText = String(step)
  const decimalPart = stepText.includes(".") ? stepText.split(".")[1] : ""
  const decimals = decimalPart.length

  if (decimals === 0) {
    return String(Math.round(value))
  }

  return value.toFixed(decimals)
}

export function HomeInfoDrawer({ isOpen, onToggle, settings, onSettingsChange }: HomeInfoDrawerProps) {
  const drawerClassName = isOpen ? "home-info-drawer is-open" : "home-info-drawer"

  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([])
  const [isModelLoading, setIsModelLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<DrawerTab>("llm")
  const [sttModel, setSttModel] = useState<SttModelOption>("small.en")
  const [sttRealtimeModel, setSttRealtimeModel] = useState<SttModelOption>("small.en")
  const [sttSliderValues, setSttSliderValues] = useState<Record<SttSliderKey, number>>(() => createSttSliderDefaults())
  const [sttSliderSwitches, setSttSliderSwitches] = useState<Record<SttSliderKey, boolean>>(() =>
    createSttSliderSwitchDefaults()
  )
  const [sttBottomSwitches, setSttBottomSwitches] = useState<Record<SttBottomSwitchKey, boolean>>(() =>
    createSttBottomSwitchDefaults()
  )

  const tabRefs = useRef<Record<DrawerTab, HTMLButtonElement | null>>({ llm: null, stt: null, tts: null })
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const sttIdPrefix = useId()

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

  useLayoutEffect(() => {
    const activeElement = tabRefs.current[activeTab]
    if (!activeElement) {
      return
    }

    const { offsetLeft, offsetWidth } = activeElement
    setUnderlineStyle({ left: offsetLeft, width: offsetWidth })
  }, [activeTab])

  const handleNumericChange = (key: LlmNumericParameterKey, value: number) => {
    onSettingsChange({ [key]: value } as Partial<LlmSettings>)
  }

  const handleSttSliderChange = (key: SttSliderKey, nextValues: number[]) => {
    const nextValue = nextValues[0]

    if (typeof nextValue !== "number") {
      return
    }

    setSttSliderValues((previous) => ({
      ...previous,
      [key]: nextValue,
    }))
  }

  return (
    <div className={drawerClassName}>
      <div className="home-info-drawer__panel">
        <Tabs
          className="home-info-drawer__tabs"
          onValueChange={(nextValue) => {
            if (isDrawerTab(nextValue)) {
              setActiveTab(nextValue)
            }
          }}
          value={activeTab}
        >
          <div className="home-info-drawer__tabs-header">
            <TabsList className="home-info-drawer__tabs-list" variant="line">
              {TAB_VALUES.map((tab) => (
                <TabsTrigger
                  className="home-info-drawer__tabs-trigger"
                  key={tab}
                  ref={(element) => {
                    tabRefs.current[tab] = element
                  }}
                  value={tab}
                >
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}

              <motion.div
                className="home-info-drawer__tabs-underline"
                layoutId="home-drawer-tabs-underline"
                style={{
                  left: underlineStyle.left,
                  width: underlineStyle.width,
                }}
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 40,
                }}
              />
            </TabsList>

            <div aria-hidden="true" className="home-info-drawer__tabs-divider" />
          </div>

          <TabsContent className="home-info-drawer__tab-content" value="llm">
            <section aria-label="LLM settings" className="home-info-drawer__tab-panel home-info-drawer__llm-tab">
              <div className="home-info-drawer__llm-row home-info-drawer__llm-row--model">
                <div className="home-info-drawer__llm-label-cell">
                  <h3 className="home-info-drawer__section-label">Model Selection</h3>
                </div>

                <div className="home-info-drawer__llm-control-cell">
                  <ModelCombobox
                    error={modelsError}
                    groups={modelGroups}
                    loading={isModelLoading}
                    onValueChange={(model) => onSettingsChange({ model })}
                    value={settings.model}
                  />
                </div>
              </div>

              <div className="home-info-drawer__llm-row home-info-drawer__llm-row--parameters">
                <div className="home-info-drawer__llm-label-cell">
                  <h3 className="home-info-drawer__section-label">Parameters</h3>
                </div>

                <div className="home-info-drawer__llm-control-cell home-info-drawer__llm-control-cell--stack">
                  {PARAMETER_DEFS.map((parameter) => (
                    <ParameterSlider
                      accent={LLM_SLIDER_ACCENT}
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
              </div>
            </section>
          </TabsContent>

          <TabsContent className="home-info-drawer__tab-content" value="stt">
            <section aria-label="STT settings" className="home-info-drawer__tab-panel home-info-drawer__stt-tab">
              <header className="home-info-drawer__stt-header">
                <h3 className="home-info-drawer__stt-title">RealtimeSTT Recorder</h3>
              </header>

              <div className="home-info-drawer__stt-model-grid">
                <div className="home-info-drawer__stt-model-block">
                  <p className="home-info-drawer__stt-subtitle">Model</p>
                  <RadioGroup
                    className="home-info-drawer__radio-group"
                    onValueChange={(value) => {
                      if (STT_MODEL_OPTIONS.includes(value as SttModelOption)) {
                        setSttModel(value as SttModelOption)
                      }
                    }}
                    value={sttModel}
                  >
                    {STT_MODEL_OPTIONS.map((modelOption) => {
                      const radioId = `${sttIdPrefix}-model-${modelOption.replace(".", "-")}`

                      return (
                        <div className="home-info-drawer__radio-option" key={modelOption}>
                          <RadioGroupItem id={radioId} value={modelOption} />
                          <Label className="home-info-drawer__radio-label" htmlFor={radioId}>
                            {modelOption}
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </div>

                <div className="home-info-drawer__stt-model-block">
                  <p className="home-info-drawer__stt-subtitle">Realtime Model</p>
                  <RadioGroup
                    className="home-info-drawer__radio-group"
                    onValueChange={(value) => {
                      if (STT_MODEL_OPTIONS.includes(value as SttModelOption)) {
                        setSttRealtimeModel(value as SttModelOption)
                      }
                    }}
                    value={sttRealtimeModel}
                  >
                    {STT_MODEL_OPTIONS.map((modelOption) => {
                      const radioId = `${sttIdPrefix}-realtime-${modelOption.replace(".", "-")}`

                      return (
                        <div className="home-info-drawer__radio-option" key={modelOption}>
                          <RadioGroupItem id={radioId} value={modelOption} />
                          <Label className="home-info-drawer__radio-label" htmlFor={radioId}>
                            {modelOption}
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </div>
              </div>

              <div className="home-info-drawer__stt-controls-grid">
                <div className="home-info-drawer__stt-switch-column">
                  {STT_SLIDER_DEFS.map((definition) => {
                    const switchId = `${sttIdPrefix}-switch-${definition.key}`

                    return (
                      <div className="home-info-drawer__stt-switch-row" key={switchId}>
                        <Switch
                          checked={sttSliderSwitches[definition.key]}
                          id={switchId}
                          onCheckedChange={(nextChecked) => {
                            setSttSliderSwitches((previous) => ({
                              ...previous,
                              [definition.key]: nextChecked,
                            }))
                          }}
                        />
                        <div className="home-info-drawer__stt-switch-label-wrap">
                          <Label className="home-info-drawer__stt-switch-label" htmlFor={switchId}>
                            {definition.label}
                          </Label>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  aria-label={`Tooltip placeholder for ${definition.label}`}
                                  className="home-info-drawer__tooltip-trigger"
                                  type="button"
                                >
                                  <HelpCircleIcon aria-hidden="true" className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right">Tooltip content placeholder</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="home-info-drawer__stt-slider-column">
                  {STT_SLIDER_DEFS.map((definition) => (
                    <div className="home-info-drawer__stt-slider-row" key={`slider-${definition.key}`}>
                      <div className="home-info-drawer__stt-slider-head">
                        <span className="home-info-drawer__stt-slider-label">{definition.label}</span>
                        <span className="home-info-drawer__stt-slider-value">
                          {formatSliderValue(sttSliderValues[definition.key], definition.step)}
                        </span>
                      </div>

                      <Slider
                        className="home-info-drawer__stt-slider-control"
                        max={definition.max}
                        min={definition.min}
                        onValueChange={(nextValues) => handleSttSliderChange(definition.key, nextValues)}
                        step={definition.step}
                        value={[sttSliderValues[definition.key]]}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="home-info-drawer__stt-bottom-switches">
                {STT_BOTTOM_SWITCHES.map((definition) => {
                  const switchId = `${sttIdPrefix}-${definition.key}`

                  return (
                    <div className="home-info-drawer__stt-bottom-card" key={definition.key}>
                      <Label className="home-info-drawer__stt-bottom-label" htmlFor={switchId}>
                        {definition.label}
                      </Label>
                      <Switch
                        checked={sttBottomSwitches[definition.key]}
                        className="home-info-drawer__stt-bottom-switch"
                        id={switchId}
                        onCheckedChange={(nextChecked) => {
                          setSttBottomSwitches((previous) => ({
                            ...previous,
                            [definition.key]: nextChecked,
                          }))
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent className="home-info-drawer__tab-content" value="tts">
            <section aria-label="TTS settings" className="home-info-drawer__tab-panel home-info-drawer__tts-tab" />
          </TabsContent>
        </Tabs>
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

