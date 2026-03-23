import type { LlmSettings } from "@/lib/model-settings"
import type { ConnectionStatus } from "@/lib/websocket"

export type SttState = "inactive" | "listening" | "recording" | "transcribing"

export type CaptureState = "idle" | "requesting_permission" | "capturing" | "stopping" | "error"

export type CaptureErrorCode =
  | "MIC_PERMISSION_DENIED"
  | "MIC_NOT_AVAILABLE"
  | "CAPTURE_START_FAILED"
  | "ENCODE_FAILURE"
  | "CAPTURE_RUNTIME_ERROR"

export interface CaptureError {
  code: CaptureErrorCode
  message: string
}

export interface AudioCaptureStartOptions {
  targetSampleRate: 16000
  onChunk: (chunk: Uint8Array) => void
  onStateChange?: (state: CaptureState) => void
  onError?: (error: CaptureError) => void
}

export interface AudioCaptureController {
  start(options: AudioCaptureStartOptions): Promise<void>
  stop(): Promise<void>
  getState(): CaptureState
  destroy(): Promise<void>
}

export interface TextStreamEventData {
  character_id: string
  character_name: string
  character_image_url: string
  message_id: string
}

export interface AudioStreamStartEventData {
  character_id: string
  character_name: string
  message_id: string
  sample_rate: number
}

export interface AudioStreamStopEventData {
  character_id: string
  character_name: string
  message_id: string
}

export type ServerEvent =
  | { type: "stt_state"; data: { state: SttState } }
  | { type: "stt_update"; text: string }
  | { type: "stt_stabilized"; text: string }
  | { type: "stt_final"; text: string }
  | { type: "text_stream_start"; data: TextStreamEventData }
  | { type: "text_chunk"; data: TextStreamEventData & { text: string } }
  | { type: "text_stream_stop"; data: TextStreamEventData & { text: string } }
  | { type: "audio_stream_start"; data: AudioStreamStartEventData }
  | { type: "audio_stream_stop"; data: AudioStreamStopEventData }
  | { type: "pong" }

export type PlaybackState = "idle" | "starting" | "playing" | "draining" | "error"

export type PlaybackErrorCode =
  | "AUDIO_INIT_FAILED"
  | "AUDIO_DECODE_FAILED"
  | "AUDIO_STREAM_MISMATCH"
  | "AUDIO_RUNTIME_ERROR"

export interface PlaybackError {
  code: PlaybackErrorCode
  message: string
  messageId?: string
}

export interface AudioStreamStartMeta {
  messageId: string
  characterId: string
  characterName: string
  sampleRate: number
}

export interface AudioPlayerController {
  startStream(meta: AudioStreamStartMeta): void
  pushChunk(chunk: ArrayBuffer): void
  stopStream(messageId: string): void
  flush(): void
  getState(): PlaybackState
  destroy(): void
}

export interface AudioPlayerOptions {
  onStateChange?: (state: PlaybackState) => void
  onError?: (error: PlaybackError) => void
}

export type ChatSpeakerRole = "user" | "character"
export type ChatMessageStatus = "streaming" | "final"
export type ChatMessageAudioState = "idle" | "starting" | "playing" | "stopped"

export interface ChatMessage {
  id: string
  role: ChatSpeakerRole
  speakerId: string
  speakerName: string
  speakerImageUrl?: string
  text: string
  status: ChatMessageStatus
  order: number
  audio: {
    streamState: ChatMessageAudioState
    isActiveSpeaker: boolean
  }
}

export interface ChatRuntimeState {
  connectionStatus: ConnectionStatus
  sttState: SttState
  sttPreviewText: string
  messages: ChatMessage[]
  activeAudioMessageId: string | null
  activeSpeakerId: string | null
}

export type RuntimeErrorCode =
  | CaptureErrorCode
  | PlaybackErrorCode
  | "PROTOCOL_ERROR"
  | "AUDIO_STREAM_CONTEXT_MISSING"
  | "MESSAGE_CONTEXT_MISSING"

export interface RuntimeError {
  code: RuntimeErrorCode
  message: string
}

export interface ChatRuntimeViewModel {
  state: ChatRuntimeState
  draftText: string
  setDraftText: (value: string) => void
  sendMessage: () => void
  toggleListening: () => void
  isListeningIntent: boolean
  lastError: RuntimeError | null
}

export interface UseChatRuntimeOptions {
  modelSettings: LlmSettings
  settingsSyncDebounceMs?: number
}

export interface UserMessageCommand {
  type: "user_message"
  text: string
  model_settings: LlmSettings
}

export interface ModelSettingsCommand extends LlmSettings {
  type: "model_settings"
}
