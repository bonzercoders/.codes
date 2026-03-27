export const VOICE_METHOD_VALUES = ["clone", "profile"] as const

export type VoiceMethod = (typeof VOICE_METHOD_VALUES)[number]

export interface Voice {
  voiceId: string
  voiceName: string
  method: VoiceMethod
  scenePrompt: string
  refText: string
  refAudio: string
  speakerDesc: string
  audioIds: unknown[]
  createdAt: string
  updatedAt: string
}

export type VoiceDraft = Omit<Voice, "voiceId" | "createdAt" | "updatedAt">

const VOICE_ID_FALLBACK_BASE = "voice"
const VOICE_ID_SUFFIX_WIDTH = 3
const MAX_VOICE_ID_SUFFIX = 999

export function createEmptyVoiceDraft(): VoiceDraft {
  return {
    voiceName: "",
    method: "clone",
    scenePrompt: "",
    refText: "",
    refAudio: "",
    speakerDesc: "",
    audioIds: [],
  }
}

export function toVoiceDraft(voice: Voice): VoiceDraft {
  return {
    voiceName: voice.voiceName,
    method: voice.method,
    scenePrompt: voice.scenePrompt,
    refText: voice.refText,
    refAudio: voice.refAudio,
    speakerDesc: voice.speakerDesc,
    audioIds: voice.audioIds,
  }
}

export function normalizeVoiceIdBase(voiceName: string): string {
  const normalizedBase = voiceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return normalizedBase || VOICE_ID_FALLBACK_BASE
}

function parseVoiceSuffixForBase(voiceId: string, base: string): number | null {
  const prefix = `${base}-`

  if (!voiceId.startsWith(prefix)) {
    return null
  }

  const suffixToken = voiceId.slice(prefix.length)

  if (!/^\d{3}$/.test(suffixToken)) {
    return null
  }

  const suffixValue = Number.parseInt(suffixToken, 10)

  if (!Number.isFinite(suffixValue) || suffixValue < 1 || suffixValue > MAX_VOICE_ID_SUFFIX) {
    return null
  }

  return suffixValue
}

export function createVoiceId(voiceName: string, existingVoiceIds: string[]): string {
  const base = normalizeVoiceIdBase(voiceName)
  const usedSuffixes = new Set<number>()

  existingVoiceIds.forEach((existingVoiceId) => {
    const suffix = parseVoiceSuffixForBase(existingVoiceId, base)

    if (suffix !== null) {
      usedSuffixes.add(suffix)
    }
  })

  for (let suffix = 1; suffix <= MAX_VOICE_ID_SUFFIX; suffix += 1) {
    if (usedSuffixes.has(suffix)) {
      continue
    }

    const paddedSuffix = suffix.toString().padStart(VOICE_ID_SUFFIX_WIDTH, "0")
    return `${base}-${paddedSuffix}`
  }

  throw new Error(`No available voice_id suffix remaining for "${base}".`)
}
