# Codebase Audit: Voice Chat Application (STT/TTS Focus)
# Date: March 23, 2026

## Tech Stack
- Backend: Python, FastAPI, Async OpenAI client (OpenRouter endpoint), Supabase async client.
- STT stack: Faster-Whisper, WebRTC VAD, Silero VAD, optional wakeword backends (Porcupine/OpenWakeWord).
- TTS stack: Higgs Audio serve engine (`bosonai/higgs-audio-v2-generation-3B-base` + tokenizer), PyTorch.
- Frontend: React 19 + TypeScript + Vite, Supabase JS client.
- Transport: WebSocket text + binary audio frames (WebRTC is noted as future direction but not yet implemented).

## Project Structure
- `server/main.py`: Runtime orchestrator (WebSocket endpoint, STT/LLM/TTS pipeline wiring).
- `server/stt/`: STT engine and adapters.
- `server/tts/`: TTS manager plus vendored Higgs audio engine code.
- `server/db/`: Supabase fetch + realtime sync + dataclasses for voices/characters.
- `client/src/lib/websocket.ts`: Browser websocket transport abstraction.
- `client/src/pages/HomePage.tsx` + `client/src/components/editor/ChatEditor.tsx`: Chat surface and send-only message path.
- `client/src/lib/supabase/*`: Character/voice CRUD integration.
- `docs/tracker.md`: Placeholder tracker exists; `docs/specs/` and `docs/plans/` are currently empty.

## Data Flows
### Primary Flow: Speech Input -> STT -> LLM -> TTS -> Audio Stream
Entry -> stages -> output:
1. Browser sends binary WebSocket frames to `/ws`.
2. `ChatSession.handle_audio_message(audio_bytes)` forwards raw bytes to `STT.feed_audio`.
3. `STT` forwards PCM to `AudioToTextRecorder.feed_audio(..., original_sample_rate=16000)`.
4. Recorder thread emits final transcription string through callback.
5. `ChatSession.on_transcription_final` enqueues text in `stt_queue` and emits `stt_final`.
6. `LLM.get_user_message` consumes queue item and streams model output chunks.
7. `generate_sentences_async` splits token stream into sentence fragments.
8. Each sentence becomes a `TTSSentence` queued to `sentence_queue`.
9. `TTS.tts_worker` synthesizes PCM chunks and enqueues `AudioChunk` to `tts_queue`.
10. `ChatSession.stream_audio` emits control events and sends binary PCM to browser.

Data formats at boundaries:
- Inbound audio: raw bytes, expected PCM16 mono at 16kHz.
- STT partial/final text: plain `str`.
- Sentence queue item: `TTSSentence{text,index,message_id,character_id,character_name,voice_id}`.
- TTS queue item: `AudioChunk{audio_bytes,sentence_index,chunk_index,message_id,character_id,character_name}`.
- Outbound audio bytes: PCM16 byte stream, sample rate sent separately in `audio_stream_start` metadata.

State: PARTIAL
- Server-side pipeline is implemented.
- Client-side microphone capture, binary upload, text event rendering, and audio playback are not wired.

### Secondary Flow: Manual Text Message -> LLM -> TTS
Entry -> stages -> output:
1. Browser sends JSON text message `{ type: "user_message", text, model_settings }`.
2. Server validates/parses JSON and enqueues text directly to `stt_queue`.
3. Remaining stages reuse the same LLM -> sentence queue -> TTS -> audio stream path.

Data formats at boundaries:
- Inbound JSON command object.
- Same queue dataclasses and binary output as primary flow.

State: PARTIAL
- Request path exists and runs through server.
- Frontend currently has no stream transcript rendering or voice playback path.

### Tertiary Flow: Voice/Character Data -> Runtime Selection
Entry -> stages -> output:
1. Client CRUD updates `voices` and `characters` via Supabase.
2. Server `RealtimeSync` loads and subscribes to broadcast updates.
3. LLM selects active characters from in-memory store.
4. TTS resolves `voice_id` to `Voice` record and loads reference assets.

Data formats at boundaries:
- DB rows -> dataclasses (`Character`, `Voice`) with snake_case mapping.
- TTS expects `voice_id` and requires non-empty `ref_audio` + `ref_text`.

State: PARTIAL
- CRUD and runtime lookup are in place.
- No validation prevents active characters from pointing to missing/invalid voice refs.

## Module Inventory
### STT Session Adapter
- Location: `server/main.py` (`STT` class)
- State: WORKING
- Purpose: Bridges websocket audio bytes to recorder; forwards recorder callbacks into async session events.
- Evidence: Uses thread-safe callback bridging and explicit recorder lifecycle (`start_listening`, `stop_listening`, `feed_audio`).
- Depends on: `server/stt/audio_recorder.py`.
- Provides to: `ChatSession` callbacks and `stt_queue` ingestion.
- Implicit contracts:
  - Accepts: `bytes` audio chunk in PCM16 mono expected at 16kHz.
  - Produces: callback text strings (`update`, `stabilized`, `final`) and state transitions.

### STT Core Engine
- Location: `server/stt/audio_recorder.py`, `server/stt/safepipe.py`, `server/stt/audio_input.py`
- State: PARTIAL
- Purpose: VAD-driven recording, realtime/final transcription, wakeword support, multiprocessing orchestration.
- Evidence:
  - Full implementation exists for VAD, buffering, transcription worker, and shutdown.
  - Cross-platform process/thread behavior is complex and has minor quality issues (`thread.deamon` typo in Linux branch).
  - Heavy model/bootstrap dependencies make startup brittle without complete environment.
- Depends on: `faster_whisper`, `torch`, `webrtcvad`, `silero`, wakeword libs.
- Provides to: `server/main.py` STT adapter.
- Implicit contracts:
  - Accepts: audio chunks via `feed_audio(chunk, original_sample_rate=16000)`.
  - Produces: final transcription `str`, realtime updates, VAD lifecycle callbacks.

### STT Remote Client Adapter (Alternative Path)
- Location: `server/stt/audio_recorder_client.py`
- State: SCAFFOLDED
- Purpose: Client wrapper for external `stt-server` process over two local websockets.
- Evidence:
  - Fully featured class exists, but no references from runtime path (`main.py` uses `AudioToTextRecorder`, not client adapter).
  - Contains placeholder/no-op branch (`recorded_chunk` case ends in `pass`).
- Depends on: external `stt-server` command + websocket endpoints.
- Provides to: currently not wired into the running app.
- Implicit contracts:
  - Accepts: binary chunks prefixed with metadata length + JSON metadata.
  - Produces: realtime/full sentence messages from external server.

### LLM Stream + Sentence Splitter
- Location: `server/main.py` (`LLM` class), `server/stream2sentence.py`
- State: WORKING
- Purpose: Stream model tokens, emit incremental text, split to sentence units for TTS.
- Evidence: Async chunk streaming and sentence queue writes are implemented; `AudioResponseDone` sentinel emitted consistently.
- Depends on: OpenRouter-compatible chat completions, active character store.
- Provides to: `sentence_queue`, websocket text events.
- Implicit contracts:
  - Accepts: `stt_queue` messages and model settings.
  - Produces: websocket events `text_stream_start`, `text_chunk`, `text_stream_stop`; queued `TTSSentence` objects.

### TTS Manager and Queue Worker
- Location: `server/tts/tts_generation.py`
- State: PARTIAL
- Purpose: Consume sentence queue, generate PCM chunks, and pass to transport queue.
- Evidence:
  - Core streaming synthesis and chunk decode path is implemented.
  - Voice method/profile metadata is not used in synthesis path (only ref audio/text clone path is used).
  - Error paths mostly log without structured client error propagation.
- Depends on: `RealtimeSync` voice lookup, Higgs engine.
- Provides to: `tts_queue` (`AudioChunk` + `AudioResponseDone`).
- Implicit contracts:
  - Accepts: `TTSSentence` with valid `voice_id`.
  - Produces: PCM16 `bytes` chunks and done sentinel.

### Higgs Audio Engine Integration
- Location: `server/tts/boson_multimodal/serve/serve_engine.py` and package subtree
- State: WORKING (vendored dependency)
- Purpose: Audio token generation and decode for TTS.
- Evidence: Imported and used by TTS manager; stream API integrated.
- Depends on: model/tokenizer assets and torch runtime.
- Provides to: async token deltas for TTS synth path.
- Implicit contracts:
  - Accepts: `ChatMLSample` conversation input.
  - Produces: audio token deltas, then decodable waveform.

### Session Transport Orchestrator
- Location: `server/main.py` (`ChatSession` + websocket endpoint)
- State: PARTIAL
- Purpose: Session lifecycle, websocket routing, queue workers, event fanout.
- Evidence:
  - Handles text commands, binary audio ingress, and binary audio egress.
  - No bounded queue/backpressure strategy or explicit client error envelope for synthesis/transcription failures.
- Depends on: STT/LLM/TTS modules and websocket connection.
- Provides to: browser text events and binary audio stream.
- Implicit contracts:
  - Accepts text message types: `ping`, `user_message`, `start_listening`, `stop_listening`, `model_settings`, `clear_history`.
  - Produces text message types: `stt_state`, `stt_update`, `stt_stabilized`, `stt_final`, `text_stream_start`, `text_chunk`, `text_stream_stop`, `audio_stream_start`, `audio_stream_stop`.

### Realtime Voice/Character Store
- Location: `server/db/models.py`, `server/db/client.py`, `server/db/realtime.py`
- State: WORKING
- Purpose: Load and keep in-memory voice/character state synced from Supabase.
- Evidence: Startup fetch + realtime broadcast subscription + typed mapping are implemented.
- Depends on: Supabase env config and channel broadcasts.
- Provides to: LLM character selection and TTS voice resolution.
- Implicit contracts:
  - Character key: `id`; Voice key: `voice_id`.
  - Active character selection driven by `is_active`.

### Client WebSocket Transport
- Location: `client/src/lib/websocket.ts`
- State: WORKING
- Purpose: Browser websocket connection, reconnect behavior, text/binary handler routing.
- Evidence: Clean class + hook implementation with status transitions.
- Depends on: frontend caller wiring.
- Provides to: pages/components via `useVoiceSocket`.
- Implicit contracts:
  - Expects handler callbacks for JSON text and binary frames.
  - Hardcodes websocket target as `ws://<host>:8000/ws` (or wss).

### Client Speech UX Layer
- Location: `client/src/pages/HomePage.tsx`, `client/src/components/editor/ChatEditor.tsx`
- State: SCAFFOLDED
- Purpose: Chat input surface and websocket command send for text messages.
- Evidence:
  - Sends `user_message` and `model_settings` commands.
  - Voice button has no action wiring.
  - No websocket event handlers passed into `useVoiceSocket` (text/binary outputs are ignored).
- Depends on: `useVoiceSocket`.
- Provides to: user interaction layer only (text send).
- Implicit contracts:
  - Accepts typed text draft and connection status.
  - Produces only outbound text commands.

### Client Voice/Character CRUD
- Location: `client/src/pages/VoicesPage.tsx`, `client/src/components/voices/VoiceEditor.tsx`, `client/src/pages/CharactersPage.tsx`, `client/src/components/characters/CharacterEditor.tsx`, `client/src/lib/supabase/*`
- State: PARTIAL
- Purpose: Manage DB records for voices/characters used by runtime pipeline.
- Evidence:
  - CRUD paths are implemented.
  - Runtime-critical fields are free-form (e.g., character `voiceId`), with no validation against existing voices.
- Depends on: Supabase tables and env keys.
- Provides to: RealtimeSync-fed runtime selections.
- Implicit contracts:
  - Voice draft includes `method`, `scenePrompt`, `refText`, `refAudio`, `speakerDesc`.
  - Character draft includes `voiceId` and `isActive` flags.

## Existing Contracts (from code)
- WebSocket inbound command contract:
  - JSON commands with `type` in `{ ping, user_message, start_listening, stop_listening, model_settings, clear_history }`.
  - `user_message` may include nested `model_settings` object.
  - Binary websocket payload is treated as raw audio bytes.

- WebSocket outbound event contract:
  - STT state/update events:
    - `{"type":"stt_state","data":{"state":"inactive|listening|recording|transcribing"}}`
    - `{"type":"stt_update","text":string}`
    - `{"type":"stt_stabilized","text":string}`
    - `{"type":"stt_final","text":string}`
  - Text generation events:
    - `text_stream_start`, `text_chunk`, `text_stream_stop` with `character_*` and `message_id` fields.
  - Audio stream control events:
    - `audio_stream_start` includes `sample_rate` and message/character identifiers.
    - `audio_stream_stop` includes message/character identifiers.
  - Audio payload channel:
    - Binary websocket frames carry PCM16 data corresponding to the active stream.

- Queue contracts:
  - `stt_queue`: user message string payload (also tolerant of tuple forms).
  - `sentence_queue`: `TTSSentence` + `AudioResponseDone` sentinel.
  - `tts_queue`: `AudioChunk` + `AudioResponseDone` sentinel.

- DB contracts:
  - `characters` rows map to `Character` dataclass with `voice_id`, `is_active`, prompts.
  - `voices` rows map to `Voice` dataclass with `voice_id`, `method`, `ref_audio`, `ref_text`, etc.
  - TTS currently requires `ref_audio` and `ref_text` even though `method` allows `profile` conceptually.

- Frontend transport contract:
  - Socket URL is built as `ws(s)://<hostname>:8000/ws`.
  - `useVoiceSocket` expects consumers to provide `onText`/`onBinary` handlers for runtime behavior.

## Gaps
### Missing Modules
- Browser microphone capture + PCM encoding + binary uplink module for STT input.
- Browser streaming audio playback module (buffering/chunk scheduling) for TTS output.
- Client message state model (STT interim/final text + assistant stream + per-message playback state).
- Integration tests for STT/TTS pipeline (server unit + websocket integration + client E2E smoke).

### Missing Connections
- `HomePage` creates websocket without `onText`/`onBinary` handlers, so server events are dropped.
- `ChatEditor` voice button is present but not wired to `start_listening`/`stop_listening`.
- No client path sends binary microphone audio to websocket.
- No client path consumes websocket binary audio chunks.
- `AudioToTextRecorderClient` exists but is not integrated in runtime.
- Project docs mention `chat-messages.ts` and `audio-player.ts`, but those files are absent in current client tree.

### Missing Error Handling
- TTS synthesis errors are logged but not surfaced to client with structured error events.
- Character `voiceId` is free text; invalid IDs fail late at synthesis time.
- Startup hard-fails if STT/TTS heavy dependencies/models are unavailable; no degraded-mode fallback.
- No queue size limits/backpressure policy for long sessions.

### Incomplete Features
- Voice `method`/`scenePrompt`/`speakerDesc` fields are captured in UI but not used by server synthesis logic.
- Character editor tabs `background` and `chats` are placeholders.
- Voice preview action is placeholder/no-op.
- Current transport is websocket-only despite project direction toward WebRTC.

### Technical Debt
- Mixed ownership code in STT/TTS directories (custom wrapper + large vendored engines) increases maintenance burden.
- `thread.deamon` typo in STT Linux thread branch indicates low-confidence branch quality.
- `TTS.tts_worker` calls `clear_generated_audio_ids(item)` with sentinel object; API expects optional stream id string.
- `server/main.py` contains significant unused imports and mixed concerns in one file.
- `docs/specs` and `docs/plans` are empty; tracker is still template content.
- Potential port mismatch risk: frontend websocket targets `:8000`, while `server/main.py` direct run uses `port=5173`.

## Recommendations
1. Build a minimal end-to-end client speech path first:
   - Add microphone capture and PCM chunk streaming.
   - Wire voice button to `start_listening`/`stop_listening`.
   - Add streaming audio playback for binary chunks using `audio_stream_start.sample_rate`.
2. Add a client-side websocket event reducer:
   - Handle `stt_*`, `text_*`, and `audio_stream_*` events in one state model.
   - Render live transcript and assistant responses.
3. Enforce runtime data validity:
   - Validate character `voiceId` against existing voices before save/activate.
   - Enforce required voice fields by method (`clone` vs `profile`) with server-side checks.
4. Finish TTS method semantics:
   - Implement `profile`/scene/speaker descriptor handling in `synthesize_speech` path or remove unused fields temporarily.
5. Harden reliability:
   - Add bounded queues/backpressure strategy and structured server error events.
   - Add startup capability checks and clearer degraded behavior when models are unavailable.
6. Add test coverage:
   - Unit tests for message contracts and queue item transforms.
   - Integration test for websocket STT->LLM->TTS cycle with mocked model calls.
7. Clean architecture/documentation drift:
   - Split `server/main.py` into transport/session/services modules.
   - Align AGENTS/CLAUDE directory descriptions with actual files.
   - Seed `docs/specs/` and `docs/plans/` from this audit before implementation.
