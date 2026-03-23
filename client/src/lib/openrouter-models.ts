import { OpenRouter } from "@openrouter/sdk"

export interface ModelOption {
  value: string
  label: string
}

export interface ModelGroup {
  provider: string
  options: ModelOption[]
}

const PROVIDER_ALIASES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  "meta-llama": "Meta Llama",
  xai: "xAI",
  "x-ai": "xAI",
  mistralai: "Mistral AI",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  microsoft: "Microsoft",
  cohere: "Cohere",
  perplexity: "Perplexity",
  moonshotai: "Moonshot AI",
  nvidia: "NVIDIA",
  amazon: "Amazon",
  openrouter: "OpenRouter",
  nousresearch: "Nous Research",
}

const TOKEN_ALIASES: Record<string, string> = {
  ai: "AI",
  api: "API",
  gpt: "GPT",
  llm: "LLM",
  tts: "TTS",
  stt: "STT",
  oss: "OSS",
  r1: "R1",
  r2: "R2",
  o1: "O1",
  o3: "O3",
  o4: "O4",
}

let openRouterClient: OpenRouter | null = null

function tokenToTitleCase(token: string): string {
  const normalized = token.toLowerCase()
  const alias = TOKEN_ALIASES[normalized]

  if (alias) {
    return alias
  }

  if (/^\d+(\.\d+)?$/.test(token)) {
    return token
  }

  if (token.length <= 2 && /^[a-z]+$/i.test(token)) {
    return token.toUpperCase()
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

function titleCaseFromSlug(value: string): string {
  return value
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((token) => tokenToTitleCase(token))
    .join(" ")
}

export function parseModelId(id: string): { providerId: string; modelId: string } {
  const [providerId, ...modelParts] = id.split("/")

  if (!providerId || modelParts.length === 0) {
    return {
      providerId: "other",
      modelId: id,
    }
  }

  return {
    providerId,
    modelId: modelParts.join("/"),
  }
}

export function formatProviderLabel(providerId: string): string {
  const normalized = providerId.trim().toLowerCase()
  return PROVIDER_ALIASES[normalized] ?? titleCaseFromSlug(normalized)
}

export function formatModelLabelFromId(id: string): string {
  const { modelId } = parseModelId(id)

  if (!modelId) {
    return id
  }

  return modelId
    .split("/")
    .map((segment) => titleCaseFromSlug(segment))
    .join(" / ")
}

function getClient(): OpenRouter {
  if (openRouterClient) {
    return openRouterClient
  }

  const apiKey = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim()
  if (!apiKey) {
    throw new Error("Missing VITE_OPENROUTER_API_KEY in client environment.")
  }

  openRouterClient = new OpenRouter({ apiKey })
  return openRouterClient
}

export async function listOpenRouterModelGroups(): Promise<ModelGroup[]> {
  const client = getClient()
  const response = await client.models.list({})
  const entries = Array.isArray(response.data) ? response.data : []

  const grouped = new Map<string, { providerLabel: string; options: ModelOption[] }>()
  const uniqueIds = new Set<string>()

  for (const entry of entries) {
    const id = typeof entry.id === "string" ? entry.id.trim() : ""
    if (!id || uniqueIds.has(id)) {
      continue
    }

    uniqueIds.add(id)

    const { providerId } = parseModelId(id)
    const providerLabel = formatProviderLabel(providerId)
    const modelLabel = formatModelLabelFromId(id)
    const group = grouped.get(providerId)

    if (group) {
      group.options.push({ value: id, label: modelLabel })
      continue
    }

    grouped.set(providerId, {
      providerLabel,
      options: [{ value: id, label: modelLabel }],
    })
  }

  return [...grouped.values()]
    .map((group) => ({
      provider: group.providerLabel,
      options: group.options.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true })),
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider))
}
