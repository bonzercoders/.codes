# Spec: STT/LLM/TTS Client Chat
# Date: March 23, 2026

## Scope
Build the missing client-side modules and wiring for real-time voice chat:
- microphone capture + PCM uplink to websocket,
- websocket event/state handling for STT + streamed character text,
- streamed PCM playback for TTS,
- chat UI for user messages and character responses.

This spec intentionally preserves existing server contracts in `docs/audit.md` and does not redesign server behavior.

## Existing Constraints (From Audit)
- WebSocket URL and transport are already established via `useVoiceSocket` / `VoiceSocket`.
- Server inbound command types are fixed: `ping`, `user_message`, `start_listening`, `stop_listening`, `model_settings`, `clear_history`.
- Server inbound binary payload is raw PCM16 audio bytes.
- Server outbound text events are fixed: `stt_state`, `stt_update`, `stt_stabilized`, `stt_final`, `text_stream_start`, `text_chunk`, `text_stream_stop`, `audio_stream_start`, `audio_stream_stop`.
- Server outbound binary payload is streamed PCM16 audio for active TTS output.

## Step 1: MAP - Data Flow

### Existing Flows Reused (No Server Contract Changes)
1. Client sends text message (`user_message`) -> server LLM stream -> server TTS stream.
2. Client can send `start_listening` / `stop_listening` commands.
3. Server emits STT state/text events, text stream events, and binary audio chunks.

### New Flow A: Voice Capture -> STT Uplink (Client Adds)
Path:
1. User presses voice button in chat editor.
2. Client sends `{ "type": "start_listening" }`.
3. Capture module requests microphone permission (`getUserMedia`).
4. Capture module reads browser audio frames (typically float PCM at device sample rate).
5. Client downmixes to mono, resamples to 16kHz, converts to PCM16 little-endian bytes.
6. Client sends binary chunks through `VoiceSocket.sendBinary` while listening is active.
7. User presses voice button again (or stop action), client sends `{ "type": "stop_listening" }` and halts capture.

Boundary formats:
- Browser capture input: float PCM frames (`Float32Array`) at browser sample rate.
- Uplink payload: raw PCM16 mono 16kHz (`Uint8Array`/`ArrayBuffer`) sent as websocket binary.

State target: COMPLETE after client wiring.

### New Flow B: Server STT + LLM Events -> Chat State (Client Adds)
Path:
1. Websocket text messages are parsed in `useVoiceSocket` consumer.
2. Event router maps server event types to chat state transitions.
3. STT events update live user speech status:
   - `stt_state`: recording/listening/transcribing indicator.
   - `stt_update`/`stt_stabilized`: provisional speech text.
   - `stt_final`: commits final user utterance to chat timeline.
4. LLM events update active character message stream:
   - `text_stream_start`: create pending assistant message by `message_id`.
   - `text_chunk`: append token fragment to that message.
   - `text_stream_stop`: finalize message text.

Boundary formats:
- Inbound event envelope: JSON object with `type` + payload.
- Internal UI representation: typed chat state model keyed by `message_id` and participant metadata.

State target: COMPLETE after event reducer/store is added.

### New Flow C: Server TTS Binary Stream -> Browser Playback (Client Adds)
Path:
1. `audio_stream_start` arrives with `message_id`, character metadata, and `sample_rate`.
2. Playback module opens/activates stream context for that `message_id`.
3. Incoming websocket binary chunks are interpreted as PCM16 mono.
4. Module converts PCM16 to float audio buffers and schedules contiguous playback.
5. `audio_stream_stop` finalizes stream state; player drains pending audio and marks playback complete.

Boundary formats:
- Control events: JSON (`audio_stream_start`, `audio_stream_stop`).
- Audio payload: binary PCM16 chunks associated with currently active stream.
- Playback internal queue: chunk queue keyed by stream/message id with sample-rate metadata.

State target: COMPLETE after audio player and event wiring are added.

### New Flow D: Connection/Recovery + Edge Behavior (Client Adds)
Path:
1. Socket reconnects (`disconnected` -> `connecting` -> `connected`).
2. Chat view preserves prior messages and clears only volatile stream buffers.
3. If mic capture is active during disconnect, capture is stopped locally and UI returns to safe idle.
4. If `audio_stream_start` occurs with no binary chunks (or decode errors), UI still resolves stream state cleanly.

Boundary formats:
- Connection status from `useVoiceSocket`: `connecting|connected|disconnected`.
- Local recovery actions: stop capture, flush playback queue, retain durable chat timeline.

State target: COMPLETE after lifecycle guards and recovery handling are wired.

## Step 2: BOUND - Module Boundaries

### Existing Fixed Boundaries (Reused As-Is)
1. `client/src/lib/websocket.ts` (WORKING): websocket transport/reconnect and text+binary dispatch.
2. `client/src/pages/HomePage.tsx` (PARTIAL): main page composition and send-text path.
3. `client/src/components/editor/ChatEditor.tsx` (SCAFFOLDED): input shell and voice button surface.

These are preserved. New work adds modules around them.

### New Module A: Audio Capture Module
- Proposed location: `client/src/lib/audio-capture.ts`
- Purpose: Own browser microphone lifecycle and produce PCM16 mono 16kHz chunks for websocket uplink.
- Receives:
  - start/stop commands from page/controller layer.
  - callback sink for encoded binary chunks.
- Produces:
  - encoded audio chunk callbacks.
  - capture status and error signals.
- Why separate: keeps browser media APIs and DSP transforms isolated/testable from UI code.

### New Module B: Streaming Audio Playback Module
- Proposed location: `client/src/lib/audio-player.ts`
- Purpose: Queue and schedule PCM16 chunks for playback using `audio_stream_start` metadata.
- Receives:
  - stream control (`start(message_id, character, sample_rate)`, `stop(message_id)`).
  - binary PCM16 chunk push operations.
- Produces:
  - playback lifecycle state (idle/playing/draining/error).
  - optional stream progress hooks for UI indicators.
- Boundary constraint:
  - single active audio stream at a time.
  - must still track speaker/message metadata so the timeline shows which character is speaking in sequence.
- Why separate: keeps timing/buffering complexity out of React render tree.

### New Module C: Chat Runtime State Module
- Proposed location: `client/src/lib/chat-messages.ts`
- Purpose: Normalize and store STT + text stream + audio stream events into a single typed state model.
- Receives:
  - parsed websocket text events.
  - local UI intents (send text, toggle listening).
  - playback lifecycle updates.
- Produces:
  - render-ready timeline of user and character messages.
  - STT status + provisional/final transcript state.
  - active speaker + speaking order metadata.
- Why separate: centralizes event sequencing and message identity (`message_id`) logic.

### New Module D: Client Event Router/Coordinator
- Proposed location: `client/src/lib/chat-runtime.ts`
- Purpose: Wire `useVoiceSocket`, audio capture, playback, and chat-messages store into one orchestrated runtime for `HomePage`.
- Receives:
  - websocket status/text/binary callbacks.
  - UI actions (`sendMessage`, `toggleListening`).
- Produces:
  - stable state/actions API for page and chat components.
- Why separate: prevents `HomePage` from becoming a monolithic control file.

### New Module E: Chat Timeline UI Component
- Proposed location: `client/src/components/chat/ChatTimeline.tsx`
- Purpose: Render ordered conversation (user + multiple characters), live stream text updates, and speaking indicators.
- Receives:
  - render-ready timeline entries and active speaker metadata.
- Produces:
  - presentational UI only.
- Why separate: keeps rendering concerns independent from socket/media logic.

### Existing Modules To Extend
1. `client/src/components/editor/ChatEditor.tsx`
- Extend props for listening toggle, disabled states, and status display.
- Keep it as dumb/presentational control surface.

2. `client/src/pages/HomePage.tsx`
- Switch from direct `useVoiceSocket` calls to runtime coordinator usage.
- Compose `ChatTimeline` + `ChatEditor` with a single source of truth.

### Boundary Checks
- Testability: each new module can be tested in isolation with mocked callbacks.
- Replaceability: capture backend or playback scheduler can be swapped without changing UI contracts.
- Interface clarity: each module has one sentence for what crosses the boundary.

## Step 3: CONTRACT - Interface Definitions

### Existing Contracts (Fixed Constraints)
These existing contracts are already in code and must be preserved:
1. Outbound websocket commands use JSON envelopes with `type` values from:
   - `ping`, `user_message`, `start_listening`, `stop_listening`, `model_settings`, `clear_history`.
2. Inbound server text events use these `type` values:
   - `stt_state`, `stt_update`, `stt_stabilized`, `stt_final`,
   - `text_stream_start`, `text_chunk`, `text_stream_stop`,
   - `audio_stream_start`, `audio_stream_stop`.
3. Inbound binary websocket payloads are PCM16 audio chunks from TTS.
4. Outbound binary websocket payloads are PCM16 microphone chunks expected by STT.

### New Contract A: `chat-runtime` <-> `audio-capture`
Transport mechanism:
- Function-call API + callback registration.

Data format:
```ts
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
```

Flow control:
- `chat-runtime` initiates `start()` only once per listen session.
- `onChunk` is push-based; capture module emits chunk cadence suitable for realtime (small chunk windows).
- If socket disconnects, runtime must call `stop()` immediately.

Error contract:
- Capture module does not throw after startup; runtime receives async errors via `onError`.
- On non-recoverable capture error, module transitions to `error` then `idle` after cleanup.

### New Contract B: `chat-runtime` <-> websocket server messages
Transport mechanism:
- Existing `useVoiceSocket` text/binary handlers, normalized by runtime.

Data format (normalized union):
```ts
export type ServerEvent =
  | { type: "stt_state"; data: { state: "inactive" | "listening" | "recording" | "transcribing" } }
  | { type: "stt_update"; text: string }
  | { type: "stt_stabilized"; text: string }
  | { type: "stt_final"; text: string }
  | { type: "text_stream_start"; data: { character_id: string; character_name: string; character_image_url: string; message_id: string } }
  | { type: "text_chunk"; data: { text: string; character_id: string; character_name: string; character_image_url: string; message_id: string } }
  | { type: "text_stream_stop"; data: { character_id: string; character_name: string; character_image_url: string; message_id: string; text: string } }
  | { type: "audio_stream_start"; data: { character_id: string; character_name: string; message_id: string; sample_rate: number } }
  | { type: "audio_stream_stop"; data: { character_id: string; character_name: string; message_id: string } }
  | { type: "pong" }
```

Flow control:
- Runtime is single consumer of socket events for Home page.
- Runtime sends text commands and binary chunks only when `status === "connected"`.
- Runtime may drop binary capture chunks while disconnected and must stop capture on disconnect.

Error contract:
- Unknown or malformed text event -> runtime emits `PROTOCOL_ERROR` to local error channel and ignores event.
- Binary chunk without active audio stream context -> runtime emits `AUDIO_STREAM_CONTEXT_MISSING` and drops chunk.

### New Contract C: `chat-runtime` <-> `audio-player`
Transport mechanism:
- Function-call control API + optional callbacks.

Data format:
```ts
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
```

Flow control:
- Single active stream invariant: `startStream` replaces/ends previous stream if still active.
- `pushChunk` appends to active stream queue only.
- `stopStream` marks stream as closed and allows queued audio to drain before `idle`.

Error contract:
- `stopStream` with mismatched message id is ignored with warning event.
- Player never throws to UI; it reports errors through runtime callback channel.

### New Contract D: `chat-runtime` <-> `chat-messages`
Transport mechanism:
- Reducer-style function calls with immutable state updates.

Data format:
```ts
export type ChatSpeakerRole = "user" | "character"

export interface ChatMessage {
  id: string
  role: ChatSpeakerRole
  speakerId: string
  speakerName: string
  speakerImageUrl?: string
  text: string
  status: "streaming" | "final"
  order: number
  audio: {
    streamState: "idle" | "starting" | "playing" | "stopped"
    isActiveSpeaker: boolean
  }
}

export interface ChatRuntimeState {
  connectionStatus: "connecting" | "connected" | "disconnected"
  sttState: "inactive" | "listening" | "recording" | "transcribing"
  sttPreviewText: string
  messages: ChatMessage[]
  activeAudioMessageId: string | null
  activeSpeakerId: string | null
}
```

Flow control:
- Runtime assigns monotonic `order` at message creation.
- `text_stream_start` creates a single streaming character message for `message_id`.
- `text_chunk` appends only to that message.
- `text_stream_stop` finalizes only that same message.
- `audio_stream_start/stop` update audio substate on the same `message_id` to preserve speaking order in timeline.

Error contract:
- Event for unknown `message_id` during stream update -> state reducer no-op + warning code `MESSAGE_CONTEXT_MISSING`.

### New Contract E: `chat-runtime` <-> UI components (`HomePage`, `ChatEditor`, `ChatTimeline`)
Transport mechanism:
- Hook return object and callback props.

Data format:
```ts
export interface ChatRuntimeViewModel {
  state: ChatRuntimeState
  draftText: string
  setDraftText: (value: string) => void
  sendMessage: () => void
  toggleListening: () => void
  isListeningIntent: boolean
  lastError: { code: string; message: string } | null
}
```

Flow control:
- UI is passive and calls runtime actions.
- Runtime is sole owner of socket/capture/playback side effects.

Error contract:
- Runtime exposes non-fatal user-visible errors through `lastError` and continues operating when possible.

### Global Sequencing Invariants
1. Single-user: one runtime instance for Home page session.
2. Single active audio stream: exactly zero or one active TTS stream in player at any moment.
3. Multi-character ordering: timeline must preserve chronological order across character responses via `order` and `message_id` linkage.
4. Speaker attribution: any active stream must map to one character message and set active speaker markers until stop/drain completes.

## Step 4: SEQUENCE - Build Order

Build strategy follows existing-project sequencing: keep working boundaries, formalize contracts first, then replace new-module stubs incrementally while staying runnable after each task.

### Task Sequence (High Level)
1. **Contracts-As-Code + Skeleton Wiring**
   - Create typed contracts and state/event models in client code.
   - Create stub implementations for new modules (`audio-capture`, `audio-player`, `chat-messages`, `chat-runtime`, `ChatTimeline`).
   - Wire `HomePage` and `ChatEditor` to runtime API with safe no-op behavior for missing internals.
   - Outcome: app remains runnable; text send path still works; new architecture shell is in place.

2. **Chat Event State + Timeline Rendering**
   - Implement real reducer/state logic for server text events (`stt_*`, `text_*`, `audio_stream_*` control state).
   - Replace timeline stub with render-ready message list UI showing speaker identity/order and streaming text.
   - Keep audio capture/playback stubs for now.
   - Outcome: text and STT event flow become visible in UI, including multi-character message sequencing.

3. **Microphone Capture + STT Uplink**
   - Implement browser capture lifecycle (`getUserMedia`, mono/downsample/PCM16 encode) and runtime listening toggle.
   - Wire `start_listening` / `stop_listening` commands and binary uplink chunk flow.
   - Add disconnect/cleanup behavior for active capture sessions.
   - Outcome: client can feed live speech audio into existing server STT pipeline.

4. **Streaming Playback + End-to-End Voice UX Hardening**
   - Implement PCM16 playback queue/scheduler and bind it to `audio_stream_start`, binary chunks, and `audio_stream_stop`.
   - Enforce single active stream while preserving speaker attribution/order in timeline.
   - Complete runtime error handling and edge-case guards (orphan chunks, mismatched stop, reconnection drain/flush).
   - Outcome: full client STT -> LLM -> TTS conversational loop works with sequential character speech playback.

### Why This Order
- **Contracts first** prevents drift while multiple new modules are introduced.
- **User-visible chat state early** gives fast feedback on correctness of event sequencing before media complexity.
- **High-risk media tasks in first half** (capture and playback) reduce late surprises.
- **Runnable after every task** keeps implementation iterative and debuggable.
## Open Questions / Assumptions
- Confirmed: single user and one active audio stream at a time.
- Required behavior: chat timeline must support multiple characters speaking sequentially with explicit speaker identity and order.
- Assumption: websocket binary chunks belong to the currently active server-announced audio stream (`audio_stream_start` -> `audio_stream_stop`).
- Assumption: first implementation prioritizes robust sequencing and intelligible playback over advanced effects.

