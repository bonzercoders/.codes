export const CHARACTER_TAB_VALUES = [
  "profile",
  "background",
  "chats",
] as const

export type CharacterTab = (typeof CHARACTER_TAB_VALUES)[number]

export interface Character {
  id: string
  name: string
  voiceId: string
  globalRoleplay: string
  systemPrompt: string
  isActive: boolean
  imageUrl: string
  images: unknown[]
  createdAt: string
  updatedAt: string
}

export type CharacterDraft = Omit<Character, "id" | "createdAt" | "updatedAt">

export const CHARACTER_TAB_LABELS: Record<CharacterTab, string> = {
  profile: "Profile",
  background: "Persona",
  chats: "Chats",
}

export const DEFAULT_GLOBAL_ROLEPLAY =
  "You are {character.name}, a roleplay actor engaging in a conversation with {user.name}. Your replies should be written in a conversational format, taking on the personality and characteristics of {character.name}."

export function createEmptyCharacterDraft(): CharacterDraft {
  return {
    name: "",
    voiceId: "",
    globalRoleplay: DEFAULT_GLOBAL_ROLEPLAY,
    systemPrompt: "",
    isActive: false,
    imageUrl: "",
    images: [],
  }
}

export function toCharacterDraft(character: Character): CharacterDraft {
  return {
    name: character.name,
    voiceId: character.voiceId,
    globalRoleplay: character.globalRoleplay,
    systemPrompt: character.systemPrompt,
    isActive: character.isActive,
    imageUrl: character.imageUrl,
    images: character.images,
  }
}

export function createCharacterId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `character-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
