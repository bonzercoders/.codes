import type { Voice, VoiceDraft } from "@/lib/voices"
import { supabase } from "./client"

interface DbVoiceRow {
  voice_id: string
  voice_name: string | null
  method: string | null
  scene_prompt: string | null
  ref_text: string | null
  ref_audio: string | null
  speaker_desc: string | null
  audio_ids: unknown[] | null
  created_at: string | null
  updated_at: string | null
}

function normalizeMethod(value: string | null): "clone" | "profile" {
  return value === "profile" ? "profile" : "clone"
}

function fromDbRow(row: DbVoiceRow): Voice {
  return {
    voiceId: row.voice_id,
    voiceName: row.voice_name ?? "",
    method: normalizeMethod(row.method),
    scenePrompt: row.scene_prompt ?? "",
    refText: row.ref_text ?? "",
    refAudio: row.ref_audio ?? "",
    speakerDesc: row.speaker_desc ?? "",
    audioIds: row.audio_ids ?? [],
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }
}

function toDbRow(draft: VoiceDraft, voiceId?: string) {
  return {
    ...(voiceId ? { voice_id: voiceId } : {}),
    voice_name: draft.voiceName,
    method: draft.method,
    scene_prompt: draft.scenePrompt,
    ref_text: draft.refText,
    ref_audio: draft.refAudio,
    speaker_desc: draft.speakerDesc,
    audio_ids: draft.audioIds,
  }
}

export async function fetchVoices(): Promise<Voice[]> {
  const { data, error } = await supabase
    .from("voices")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  return (data as DbVoiceRow[]).map(fromDbRow)
}

export async function insertVoice(draft: VoiceDraft, voiceId: string): Promise<Voice> {
  const { data, error } = await supabase
    .from("voices")
    .insert(toDbRow(draft, voiceId))
    .select()
    .single()

  if (error) {
    throw error
  }

  return fromDbRow(data as DbVoiceRow)
}

export async function updateVoice(voiceId: string, draft: VoiceDraft): Promise<Voice> {
  const { data, error } = await supabase
    .from("voices")
    .update(toDbRow(draft))
    .eq("voice_id", voiceId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return fromDbRow(data as DbVoiceRow)
}

export async function deleteVoice(voiceId: string): Promise<void> {
  const { error } = await supabase
    .from("voices")
    .delete()
    .eq("voice_id", voiceId)

  if (error) {
    throw error
  }
}
