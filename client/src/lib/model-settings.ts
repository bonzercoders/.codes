export type LlmSettings = {
  model: string
  temperature: number
  top_p: number
  min_p: number
  top_k: number
  frequency_penalty: number
  presence_penalty: number
  repetition_penalty: number
}

export type LlmNumericParameterKey = Exclude<keyof LlmSettings, "model">

export interface LlmParameterDefinition {
  key: LlmNumericParameterKey
  label: string
  min: number
  max: number
  step: number
  accent: string
}

const STORAGE_KEY = "home.llm.settings.v1"

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  model: "google/gemini-2.5-flash",
  temperature: 0.8,
  top_p: 0.95,
  min_p: 0.05,
  top_k: 40,
  frequency_penalty: 0,
  presence_penalty: 0,
  repetition_penalty: 1,
}

export const PARAMETER_DEFS: LlmParameterDefinition[] = [
  {
    key: "temperature",
    label: "Temperature",
    min: 0,
    max: 2,
    step: 0.01,
    accent: "#38d39f",
  },
  {
    key: "top_k",
    label: "Top K",
    min: 0,
    max: 100,
    step: 1,
    accent: "#3fb2ff",
  },
  {
    key: "top_p",
    label: "Top P",
    min: 0,
    max: 1,
    step: 0.01,
    accent: "#5f87ff",
  },
  {
    key: "min_p",
    label: "Min P",
    min: 0,
    max: 1,
    step: 0.01,
    accent: "#5e6bff",
  },
  {
    key: "frequency_penalty",
    label: "Frequency Penalty",
    min: -2,
    max: 2,
    step: 0.1,
    accent: "#9f7bff",
  },
  {
    key: "presence_penalty",
    label: "Presence Penalty",
    min: -2,
    max: 2,
    step: 0.1,
    accent: "#ff7fb7",
  },
  {
    key: "repetition_penalty",
    label: "Repetition Penalty",
    min: 0,
    max: 2,
    step: 0.01,
    accent: "#ff8f6a",
  },
]

const PARAMETER_MAP: Record<LlmNumericParameterKey, LlmParameterDefinition> = {
  temperature: PARAMETER_DEFS[0],
  top_k: PARAMETER_DEFS[1],
  top_p: PARAMETER_DEFS[2],
  min_p: PARAMETER_DEFS[3],
  frequency_penalty: PARAMETER_DEFS[4],
  presence_penalty: PARAMETER_DEFS[5],
  repetition_penalty: PARAMETER_DEFS[6],
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function stepDecimals(step: number): number {
  const stepText = String(step)
  const decimalPart = stepText.includes(".") ? stepText.split(".")[1] : ""
  return decimalPart.length
}

export function roundToStep(value: number, min: number, step: number): number {
  const decimals = stepDecimals(step)
  const rounded = Math.round((value - min) / step) * step + min
  return Number(rounded.toFixed(decimals))
}

function sanitizeNumericSetting(
  key: LlmNumericParameterKey,
  value: unknown,
  fallback: number
): number {
  const definition = PARAMETER_MAP[key]
  const parsed = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  const snapped = roundToStep(parsed, definition.min, definition.step)
  return clamp(snapped, definition.min, definition.max)
}

export function sanitizeSettings(value: Partial<LlmSettings> | null | undefined): LlmSettings {
  const next = value ?? {}
  const model = typeof next.model === "string" && next.model.trim() ? next.model.trim() : DEFAULT_LLM_SETTINGS.model

  return {
    model,
    temperature: sanitizeNumericSetting("temperature", next.temperature, DEFAULT_LLM_SETTINGS.temperature),
    top_p: sanitizeNumericSetting("top_p", next.top_p, DEFAULT_LLM_SETTINGS.top_p),
    min_p: sanitizeNumericSetting("min_p", next.min_p, DEFAULT_LLM_SETTINGS.min_p),
    top_k: sanitizeNumericSetting("top_k", next.top_k, DEFAULT_LLM_SETTINGS.top_k),
    frequency_penalty: sanitizeNumericSetting(
      "frequency_penalty",
      next.frequency_penalty,
      DEFAULT_LLM_SETTINGS.frequency_penalty
    ),
    presence_penalty: sanitizeNumericSetting(
      "presence_penalty",
      next.presence_penalty,
      DEFAULT_LLM_SETTINGS.presence_penalty
    ),
    repetition_penalty: sanitizeNumericSetting(
      "repetition_penalty",
      next.repetition_penalty,
      DEFAULT_LLM_SETTINGS.repetition_penalty
    ),
  }
}

export function loadSettings(): LlmSettings {
  if (typeof window === "undefined") {
    return DEFAULT_LLM_SETTINGS
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return DEFAULT_LLM_SETTINGS
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LlmSettings>
    return sanitizeSettings(parsed)
  } catch {
    return DEFAULT_LLM_SETTINGS
  }
}

export function saveSettings(settings: LlmSettings): void {
  if (typeof window === "undefined") {
    return
  }

  const normalized = sanitizeSettings(settings)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}
