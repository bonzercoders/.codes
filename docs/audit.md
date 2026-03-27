# Codebase Audit: Voice Chat Application (WebSocket Runtime)
# Date: March 26, 2026

## Tech Stack
- Backend: Python, FastAPI, Async OpenAI client (OpenRouter endpoint), Supabase async client.
- STT: `faster-whisper`, WebRTC VAD, Silero VAD, optional wakeword backends (Porcupine/OpenWakeWord).
- TTS: Higgs Audio serve engine (`bosonai/higgs-audio-v2-generation-3B-base` + tokenizer), PyTorch.
- Frontend: React 19 + TypeScript + Vite, shadcn/ui, Tailwind + large custom CSS.
- Transport in code today: WebSocket text + binary PCM frames.
- Direction in docs: eventual move to WebRTC transport.

## Project Structure
- `server/main.py`: Runtime orchestration for websocket session, STT/LLM/TTS pipeline, and event fanout.
- `server/stt/`: Realtime STT engine and adapters (`AudioToTextRecorder` + optional client adapter path).
- `server/tts/`: TTS manager plus vendored Higgs Audio engine.
- `server/db/`: Supabase fetch + realtime sync + dataclass models.
- `client/src/lib/chat-*.ts`: Runtime contracts, reducer, and orchestration for speech/text chat state.
- `client/src/lib/audio-capture.ts`: Browser microphone capture + PCM16 conversion.
- `client/src/lib/audio-player.ts`: Browser PCM16 streaming scheduler.
- `client/src/lib/websocket.ts`: Browser websocket transport/reconnect wrapper.
- `client/src/components/chat/ChatTimeline.tsx`, `components/editor/ChatEditor.tsx`: Live conversation UI and controls.
- `client/src/pages/VoicesPage.tsx`, `CharactersPage.tsx`: Supabase-backed CRUD UIs.
- `docs/`: audit/spec/plan/tracker workflow artifacts.

## Data Flows
### Primary Flow: Browser Mic -> STT -> LLM -> TTS -> Browser Playback (WebSocket)
1. `ChatEditor` voice toggle calls `useChatRuntime.toggleListening`.
2. Client sends `{"type":"start_listening"}` and starts `audio-capture`.
3. `audio-capture` gets mic frames, resamples to 16kHz mono, encodes PCM16 little-endian `Uint8Array`.
4. Client websocket sends binary frames to `/ws`.
5. `ChatSession.handle_audio_message` forwards bytes to `STT.feed_audio(...original_sample_rate=16000)`.
6. STT callbacks emit `stt_update`, `stt_stabilized`, `stt_final` events; final text is queued to `stt_queue`.
7. `LLM.get_user_message` reads queue, streams model text chunks, emits `text_stream_start`/`text_chunk`/`text_stream_stop`.
8. Stream text is split into sentences and queued as `TTSSentence` entries.
9. `TTS.tts_worker` synthesizes PCM chunks and enqueues `AudioChunk` plus `AudioResponseDone` sentinel.
10. `ChatSession.stream_audio` emits `audio_stream_start`, sends binary PCM bytes, then emits `audio_stream_stop`.
11. Client runtime routes control events to reducer and bytes to `audio-player`, which decodes PCM16 and schedules playback.

Data formats at boundaries:
- Client uplink audio: raw PCM16 mono bytes at 16kHz.
- STT text events: `{ type: "stt_*", text | data }` JSON.
- Sentence queue: `TTSSentence{text,index,message_id,character_id,character_name,voice_id}`.
- TTS queue: `AudioChunk{audio_bytes,sentence_index,chunk_index,message_id,character_id,character_name}` + `AudioResponseDone`.
- Client downlink audio: websocket binary `ArrayBuffer` PCM16; sample rate from `audio_stream_start.data.sample_rate`.

State: COMPLETE for the current WebSocket architecture.
Evidence: client build passes (`npm run build`) and tracker notes user-validated end-to-end STT -> LLM -> TTS playback.

### Secondary Flow: Typed User Message -> LLM -> TTS -> Playback
1. `ChatEditor` send action sends `{"type":"user_message","text", "model_settings"}`.
2. Server queues text directly to `stt_queue` (no STT dependency).
3. Same LLM -> sentence queue -> TTS -> websocket audio path is reused.
4. Client timeline renders incremental text stream and speaking state.

State: COMPLETE.

### Tertiary Flow: Voice/Character CRUD -> Realtime Runtime Selection
1. Client CRUD pages write `voices` and `characters` tables via Supabase JS.
2. Server `RealtimeSync` fetches initial rows and subscribes to broadcast updates.
3. `LLM` resolves active characters from in-memory store.
4. `TTS` resolves `voice_id` to `Voice` and loads `ref_audio`/`ref_text` before synthesis.

State: PARTIAL.
Reason: wiring exists, but runtime validation is still loose (invalid `voice_id` and method-specific voice requirements are enforced late).

### Quaternary Flow: LLM Settings UI -> Runtime Model Settings
1. Home drawer LLM tab updates persisted local settings (`localStorage`).
2. Runtime debounces and sends `{"type":"model_settings", ...}` over websocket.
3. Server parses and stores `ModelSettings`; next generation uses updated values.

State: WORKING.

## Module Inventory
### STT Session Adapter
- Location: `server/main.py` (`STT` class).
- State: WORKING.
- Purpose: Bridges websocket audio frames to recorder and forwards recorder callbacks into async session events.
- Evidence: Explicit `feed_audio`, `start_listening`, `stop_listening`, callback bridging into asyncio loop.
- Depends on: `server/stt/audio_recorder.py`.
- Provides to: `ChatSession` (`stt_*` events, user text enqueue).
- Implicit contracts:
  - Accepts: `bytes` PCM16 mono audio expected at 16kHz.
  - Produces: callback text/state transitions used to emit websocket STT events.

### STT Core Engine
- Location: `server/stt/audio_recorder.py`, `server/stt/audio_input.py`, `server/stt/safepipe.py`.
- State: PARTIAL.
- Purpose: VAD-driven capture/transcription pipeline with realtime/final callbacks.
- Evidence: Full implementation present, but branch quality issues remain (`thread.deamon` typo), high complexity, and heavy model/runtime coupling.
- Depends on: `faster_whisper`, `torch`, `webrtcvad`, `silero`, wakeword deps.
- Provides to: STT adapter in `main.py`.
- Implicit contracts:
  - Accepts: chunked audio via `feed_audio(chunk, original_sample_rate=16000)`.
  - Produces: realtime and final transcription callbacks.

### STT Remote Client Adapter (Alternative Path)
- Location: `server/stt/audio_recorder_client.py`.
- State: SCAFFOLDED.
- Purpose: Optional wrapper for external `stt-server` process via local control/data websockets.
- Evidence: Not referenced from runtime path, includes no-op `recorded_chunk` branch (`pass`).
- Depends on: external `stt-server` binary + websocket endpoints.
- Provides to: currently unused runtime branch.
- Implicit contracts:
  - Accepts: binary frames with metadata prefix.
  - Produces: realtime/final transcription messages from external server.

### LLM Turn Orchestrator + Sentence Splitter
- Location: `server/main.py` (`LLM` class), `server/stream2sentence.py`.
- State: WORKING.
- Purpose: Pull user messages, stream model output, emit text events, split into sentence queue items for TTS.
- Evidence: `get_user_message` background consumer, streamed token handling, sentence queue with done sentinel.
- Depends on: OpenRouter client, active character store.
- Provides to: websocket text stream events + TTS sentence queue.
- Implicit contracts:
  - Accepts: user text from `stt_queue` and current `ModelSettings`.
  - Produces: `text_stream_*` events and `TTSSentence` queue entries.

### TTS Manager and Queue Worker
- Location: `server/tts/tts_generation.py`.
- State: PARTIAL.
- Purpose: Convert sentence queue items into streamed PCM16 chunks.
- Evidence: Functional synthesis/decode pipeline exists, but method/profile fields are not used in synthesis behavior and one cleanup call passes wrong type (`clear_generated_audio_ids(item)` expects optional stream id).
- Depends on: `RealtimeSync` voice lookup and Higgs engine.
- Provides to: `tts_queue` (`AudioChunk` + done sentinel).
- Implicit contracts:
  - Accepts: `TTSSentence` with valid `voice_id` and voice reference assets.
  - Produces: PCM16 byte chunks and response completion sentinel.

### Session Transport Orchestrator
- Location: `server/main.py` (`ChatSession`, `/ws` endpoint).
- State: PARTIAL.
- Purpose: Manage websocket lifecycle, route inbound commands/audio, and stream outbound text/audio.
- Evidence: Core routing is implemented and active, but no bounded queue strategy/backpressure and limited structured error propagation to client.
- Depends on: STT, LLM, TTS, websocket connection.
- Provides to: browser text and binary audio streams.
- Implicit contracts:
  - Accepts command types: `ping`, `user_message`, `start_listening`, `stop_listening`, `model_settings`, `clear_history`.
  - Accepts binary payload: raw audio bytes.
  - Produces event types: `stt_*`, `text_stream_*`, `audio_stream_start`, `audio_stream_stop`.

### Realtime Voice/Character Store
- Location: `server/db/client.py`, `server/db/models.py`, `server/db/realtime.py`.
- State: WORKING.
- Purpose: Maintain in-memory `voices` and `characters` with startup fetch and realtime broadcast updates.
- Evidence: startup load + realtime subscriptions + CRUD row mapping in dataclasses.
- Depends on: Supabase env vars and broadcast setup.
- Provides to: LLM active character selection and TTS voice lookup.
- Implicit contracts:
  - Character key: `id`; Voice key: `voice_id`.
  - `Character.from_db_row` and `Voice.from_db_row` map snake_case DB rows.

### Client WebSocket Transport
- Location: `client/src/lib/websocket.ts`.
- State: PARTIAL.
- Purpose: Maintain browser websocket connection, reconnect behavior, and text/binary handler routing.
- Evidence: reconnect loop and handlers implemented; lint currently fails in this file (`react-hooks/refs`), and URL is hardcoded to `:8000`.
- Depends on: runtime consumer handlers.
- Provides to: `useChatRuntime` via `useVoiceSocket`.
- Implicit contracts:
  - Sends JSON text and raw binary.
  - Emits parsed JSON records and binary `ArrayBuffer` to callbacks.

### Client Chat Runtime State + Reducer
- Location: `client/src/lib/chat-contracts.ts`, `chat-messages.ts`, `chat-runtime.ts`.
- State: WORKING.
- Purpose: Normalize server events, manage message timeline state, coordinate capture/player, and expose UI view model.
- Evidence: typed server-event parser, reducer for STT/text/audio events, model-setting sync and listening controls.
- Depends on: websocket transport + capture/player controllers.
- Provides to: Home page and chat UI components.
- Implicit contracts:
  - Accepts server payloads that conform to `ServerEvent` union.
  - Produces `ChatRuntimeViewModel` with state/actions and `lastError`.

### Client Microphone Capture
- Location: `client/src/lib/audio-capture.ts`.
- State: WORKING.
- Purpose: Browser mic lifecycle, resampling, PCM16 frame encoding, and chunk callback delivery.
- Evidence: `getUserMedia`, `AudioContext` graph, linear resampling and LE int16 conversion, cleanup and error mapping.
- Depends on: browser media/Web Audio APIs.
- Provides to: runtime binary uplink callback.
- Implicit contracts:
  - Accepts: `targetSampleRate: 16000`, state/error callbacks.
  - Produces: PCM16 `Uint8Array` chunks.

### Client PCM Playback Controller
- Location: `client/src/lib/audio-player.ts`.
- State: WORKING.
- Purpose: Decode PCM16 binary chunks and schedule playback for active stream.
- Evidence: stream start/stop context handling, chunk scheduling with lookahead, mismatch/error signaling.
- Depends on: browser Web Audio API.
- Provides to: runtime playback state callbacks.
- Implicit contracts:
  - Accepts: `AudioStreamStartMeta`, binary `ArrayBuffer` chunks, stream stop by message id.
  - Produces: playback state transitions (`starting|playing|draining|idle|error`).

### Chat Surface Components
- Location: `client/src/pages/HomePage.tsx`, `components/chat/ChatTimeline.tsx`, `components/editor/ChatEditor.tsx`.
- State: WORKING.
- Purpose: Render live conversation, STT preview, playback/speaking state, and provide text/voice controls.
- Evidence: runtime is mounted in `HomePage` with timeline + editor wiring and error display.
- Depends on: `useChatRuntime`.
- Provides to: end-user voice/text interaction loop.
- Implicit contracts:
  - Accepts runtime state and callbacks from view model.
  - Produces UI actions: send text, toggle listening.

### Voice and Character CRUD UI
- Location: `client/src/pages/VoicesPage.tsx`, `components/voices/*`, `client/src/pages/CharactersPage.tsx`, `components/characters/*`, `client/src/lib/supabase/*`.
- State: PARTIAL.
- Purpose: Create/edit/delete voices and characters used by runtime.
- Evidence: CRUD path is implemented, but runtime validation and preview/chat actions remain placeholders.
- Depends on: Supabase tables and credentials.
- Provides to: server runtime via realtime DB sync.
- Implicit contracts:
  - Voice records include `method`, `scenePrompt`, `refText`, `refAudio`, `speakerDesc`.
  - Character records include `voiceId`, prompts, and `isActive`.

### Home Info Drawer (LLM/STT/TTS Controls)
- Location: `client/src/components/drawer/HomeInfoDrawer.tsx`.
- State: PARTIAL.
- Purpose: Configure model and surface future STT/TTS options.
- Evidence: LLM settings are wired through runtime; STT/TTS controls are local UI state only with placeholder tooltips and no server integration.
- Depends on: `model-settings`, `openrouter-models`.
- Provides to: Home page settings panel.
- Implicit contracts:
  - LLM tab emits partial `LlmSettings` updates.
  - STT/TTS tabs currently produce no backend contract traffic.

### Ancillary Pages
- Location: `client/src/pages/AgentsPage.tsx`, `client/src/pages/SettingsPage.tsx`.
- State: SCAFFOLDED.
- Purpose: Route placeholders.
- Evidence: each returns `PageCanvas` title only.
- Depends on: layout shell.
- Provides to: navigation completeness only.

## Existing Contracts (from code)
### WebSocket Inbound Commands
- `ping`.
- `user_message`: `{ type: "user_message", text: string, model_settings?: LlmSettings }`.
- `start_listening`, `stop_listening`.
- `model_settings`: numeric/text fields parsed into `ModelSettings`.
- `clear_history`.
- Binary payload: raw audio bytes (client sends PCM16, 16kHz, mono).

### WebSocket Outbound Events
- STT events:
  - `stt_state`: `{ data: { state: "inactive" | "listening" | "recording" | "transcribing" } }`
  - `stt_update`: `{ text: string }`
  - `stt_stabilized`: `{ text: string }`
  - `stt_final`: `{ text: string }`
- Text stream events:
  - `text_stream_start`: `{ data: { character_id, character_name, character_image_url, message_id } }`
  - `text_chunk`: same + `text`
  - `text_stream_stop`: same + final `text`
- Audio stream events:
  - `audio_stream_start`: `{ data: { character_id, character_name, message_id, sample_rate } }`
  - `audio_stream_stop`: `{ data: { character_id, character_name, message_id } }`
- Audio payload channel: websocket binary PCM16 bytes.

### Queue Contracts
- `stt_queue`: user message strings (also tolerates tuple forms in `LLM.get_user_message`).
- `sentence_queue`: `TTSSentence` plus `AudioResponseDone` sentinel.
- `tts_queue`: `AudioChunk` plus `AudioResponseDone` sentinel.

### Client Runtime Contracts
- `ServerEvent` discriminated union in `chat-contracts.ts` is the source of truth for accepted server payloads.
- `AudioCaptureController` emits PCM16 chunks and capture state/error transitions.
- `AudioPlayerController` consumes stream metadata + chunks and emits playback state/error transitions.

### DB Contracts
- `characters` row fields map to `Character` (`id`, `voice_id`, prompts, `is_active`, images).
- `voices` row fields map to `Voice` (`voice_id`, `method`, `ref_audio`, `ref_text`, `speaker_desc`, `scene_prompt`).
- TTS synthesis path currently requires usable `ref_audio` and `ref_text` regardless of `method` value.

## Gaps
### Missing Modules
- No WebRTC transport path in runtime code (project docs mention WebRTC direction; implementation is still websocket).
- No automated test suite for server pipeline contracts or client runtime reducer/audio controllers.

### Missing Connections
- STT and TTS settings in `HomeInfoDrawer` are not connected to server runtime controls.
- Voice preview action in `VoicesPage` is placeholder.
- Character directory chat action is placeholder and does not bridge to Home conversation context.

### Missing Error Handling
- Server-side synthesis/transcription failures are mostly logged and not always surfaced to the client as structured error events.
- No explicit queue backpressure/size limits for long or noisy sessions.
- Runtime data validity checks happen late (e.g., invalid character `voice_id` can fail only during synthesis).

### Missing Tests
- No unit tests for websocket contracts, reducer transitions, audio decode/resample behavior, or queue/sentinel flow.
- No integration test that exercises end-to-end websocket STT -> LLM -> TTS with mocked providers.

### Incomplete Features
- Voice `method` semantics are incomplete: UI supports `clone` and `profile`, but server synthesis path is effectively reference-audio/text clone oriented.
- Character editor tabs `background` and `chats` are empty content panes.
- `AgentsPage` and `SettingsPage` are route placeholders.

### Technical Debt
- Port mismatch risk: client websocket URL hardcodes `:8000`, while `server/main.py` local run block uses `port=5173`.
- TTS cleanup call passes wrong type to `clear_generated_audio_ids` (`AudioResponseDone` object instead of optional stream id string).
- `server/main.py` mixes many concerns in one file and carries many unused imports.
- STT engine has low-confidence branch issues (`thread.deamon` typo) and very large mixed-responsibility implementation.
- `audio-capture.ts` uses `ScriptProcessorNode` (legacy/deprecated API) rather than `AudioWorklet`.
- Lint baseline still fails on known files (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).

## Recommendations
1. Stabilize transport/config contracts first.
   - Resolve websocket port contract (`8000` vs `5173`) and move to one explicit env-driven base URL.
   - Expose server-side structured `error` events for STT/TTS/runtime failures.
2. Wire unfinished control surfaces.
   - Connect Home STT/TTS controls to actual server command contracts or hide until supported.
   - Implement voice preview and character chat handoff actions.
3. Tighten runtime data validation.
   - Validate character `voiceId` against existing voices before save/activation.
   - Enforce method-specific voice requirements (`clone` vs `profile`) in server and client.
4. Fix known reliability defects.
   - Correct TTS cleanup API usage and STT thread typo path.
   - Add bounded queue strategy/backpressure metrics for long-running sessions.
5. Add test coverage around contracts.
   - Client: reducer event-transition tests and audio encode/decode tests.
   - Server: websocket contract tests + mocked end-to-end STT/LLM/TTS cycle.
6. Plan WebRTC migration as a dedicated phase.
   - Keep existing websocket contracts as reference behavior.
   - Swap transport incrementally behind stable client/server message contracts.
