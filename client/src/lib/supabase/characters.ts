import type { Character, CharacterDraft } from "@/lib/characters"
import { supabase } from "./client"

interface DbCharacterRow {
  id: string
  name: string | null
  voice_id: string | null
  global_roleplay: string | null
  system_prompt: string | null
  is_active: boolean | null
  image_url: string | null
  images: unknown[] | null
  created_at: string | null
  updated_at: string | null
}

function fromDbRow(row: DbCharacterRow): Character {
  return {
    id: row.id,
    name: row.name ?? "",
    voiceId: row.voice_id ?? "",
    globalRoleplay: row.global_roleplay ?? "",
    systemPrompt: row.system_prompt ?? "",
    isActive: row.is_active ?? false,
    imageUrl: row.image_url ?? "",
    images: row.images ?? [],
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }
}

function toDbRow(draft: CharacterDraft, id?: string) {
  return {
    ...(id ? { id } : {}),
    name: draft.name,
    voice_id: draft.voiceId,
    global_roleplay: draft.globalRoleplay,
    system_prompt: draft.systemPrompt,
    is_active: draft.isActive,
    image_url: draft.imageUrl,
    images: draft.images,
  }
}

export async function fetchCharacters(): Promise<Character[]> {
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  return (data as DbCharacterRow[]).map(fromDbRow)
}

export async function insertCharacter(draft: CharacterDraft, id: string): Promise<Character> {
  const { data, error } = await supabase
    .from("characters")
    .insert(toDbRow(draft, id))
    .select()
    .single()

  if (error) {
    throw error
  }

  return fromDbRow(data as DbCharacterRow)
}

export async function updateCharacter(id: string, draft: CharacterDraft): Promise<Character> {
  const { data, error } = await supabase
    .from("characters")
    .update(toDbRow(draft))
    .eq("id", id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return fromDbRow(data as DbCharacterRow)
}

export async function deleteCharacter(id: string): Promise<void> {
  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("id", id)

  if (error) {
    throw error
  }
}
