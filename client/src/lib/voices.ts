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

export function createVoiceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `voice-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
