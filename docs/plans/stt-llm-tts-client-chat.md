# Plan: STT/LLM/TTS Client Chat

## Overview
This plan builds the missing client-side voice chat runtime on top of the already-working server STT/LLM/TTS contracts. We will first formalize contracts and wire a runnable skeleton, then add event-driven chat state, microphone capture uplink, and finally streamed audio playback with speaker-order tracking for multi-character turns.

## Spec Reference
docs/specs/stt-llm-tts-client-chat.md

## Status: COMPLETE

## Current Task: COMPLETE

---

<task id="1" status="COMPLETE">
  <n>Contracts-As-Code and Runtime Skeleton</n>
  <context>
    docs/specs/stt-llm-tts-client-chat.md (Section: Existing Constraints)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 2 - BOUND)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 3 - CONTRACT, New Contract A-E)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 4 - Sequence, Task 1)
    docs/audit.md (Section: Existing Contracts)
    client/src/lib/websocket.ts
    client/src/pages/HomePage.tsx
    client/src/components/editor/ChatEditor.tsx
  </context>
  <files>
    client/src/lib/chat-contracts.ts [CREATE]
    client/src/lib/audio-capture.ts [CREATE]
    client/src/lib/audio-player.ts [CREATE]
    client/src/lib/chat-messages.ts [CREATE]
    client/src/lib/chat-runtime.ts [CREATE]
    client/src/components/chat/ChatTimeline.tsx [CREATE]
    client/src/components/editor/ChatEditor.tsx [MODIFY - add runtime-facing props for listening controls/status]
    client/src/pages/HomePage.tsx [MODIFY - adopt chat-runtime hook skeleton]
  </files>
  <action>
    Implement shared TypeScript contracts for server events, runtime state, capture/player interfaces, and view model.
    Create stubbed implementations for new modules that satisfy the contracts exactly (no-op capture/player, placeholder reducer/timeline).
    Replace direct HomePage socket usage with a runtime hook skeleton while preserving current text send behavior (`user_message` + model settings).
    Keep all module interfaces stable so later tasks replace internals without changing call sites.
  </action>
  <done>
    `cd client && npm run build` passes.
    `cd client && npm run lint` passes.
    App boots without runtime errors and Home page remains usable.
    With server running, sending a text message from the editor still emits the existing command path and does not regress current behavior.
  </done>
  <depends-on>none</depends-on>
  <log>
    2026-03-23 12:31:33 -05:00 - Implemented Task 1 contract/stub/runtime skeleton files and Home page wiring.
    Verification: `cd client && npm run build` passed.
    Verification blocker: `cd client && npm run lint` fails in pre-existing files outside Task 1 scope (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).
    Marked COMPLETE by user decision to proceed to Task 2 with known baseline lint debt.
  </log>
</task>

<task id="2" status="COMPLETE">
  <n>Server Event State and Timeline Rendering</n>
  <context>
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 1 - New Flow B)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 2 - New Module C/D/E)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 3 - New Contract B, D, E)
    docs/specs/stt-llm-tts-client-chat.md (Section: Global Sequencing Invariants)
    client/src/lib/chat-contracts.ts
    client/src/lib/chat-messages.ts
    client/src/lib/chat-runtime.ts
    client/src/components/chat/ChatTimeline.tsx
    client/src/pages/HomePage.tsx
    client/src/styles.css
  </context>
  <files>
    client/src/lib/chat-messages.ts [MODIFY - replace stub reducer/state transitions]
    client/src/lib/chat-runtime.ts [MODIFY - route websocket text events into state]
    client/src/components/chat/ChatTimeline.tsx [MODIFY - render ordered user/character timeline]
    client/src/pages/HomePage.tsx [MODIFY - mount timeline with runtime state]
    client/src/styles.css [MODIFY - timeline and speaker status styles]
  </files>
  <action>
    Implement reducer logic for `stt_state`, `stt_update`, `stt_stabilized`, `stt_final`, `text_stream_start`, `text_chunk`, `text_stream_stop`, and audio control events.
    Ensure chronological ordering and message identity by `message_id`, including multi-character sequential turns.
    Render live streaming text and final messages in the timeline with clear speaker identity.
    Keep capture and playback modules as stubs in this task.
  </action>
  <done>
    `cd client && npm run build` passes.
    `cd client && npm run lint` passes.
    With server running, typed `user_message` flows render streaming character text (`text_stream_start/chunk/stop`) in-order in UI.
    STT text events update UI state (`stt_state`, preview/final text) without breaking message ordering.
  </done>
  <depends-on>1</depends-on>
  <log>
    2026-03-23 12:44:46 -05:00 - Implemented Task 2 reducer/event routing/timeline rendering updates.
    Files modified: client/src/lib/chat-messages.ts, client/src/lib/chat-runtime.ts, client/src/components/chat/ChatTimeline.tsx, client/src/pages/HomePage.tsx, client/src/styles.css.
    Verification: client build passed via npm run build.
    Verification blocker: client lint fails on pre-existing files outside Task 2 scope (components/registry/button.tsx, components/registry/tabs.tsx, components/ui/button.tsx, lib/websocket.ts).
    Pending manual check: live server validation for streamed text_stream_start/chunk/stop and STT UI updates.
  </log>
</task>

<task id="3" status="COMPLETE">
  <n>Microphone Capture and STT Binary Uplink</n>
  <context>
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 1 - New Flow A and D)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 3 - New Contract A, B, E)
    docs/specs/stt-llm-tts-client-chat.md (Section: Existing Contracts - binary uplink expectation)
    client/src/lib/chat-contracts.ts
    client/src/lib/audio-capture.ts
    client/src/lib/chat-runtime.ts
    client/src/lib/websocket.ts
    client/src/components/editor/ChatEditor.tsx
    client/src/pages/HomePage.tsx
  </context>
  <files>
    client/src/lib/audio-capture.ts [MODIFY - implement browser capture + PCM16 encoding]
    client/src/lib/chat-runtime.ts [MODIFY - listening toggle, start/stop commands, binary send wiring]
    client/src/components/editor/ChatEditor.tsx [MODIFY - voice toggle UX/state]
    client/src/pages/HomePage.tsx [MODIFY - pass listening controls/status to editor]
  </files>
  <action>
    Replace capture stub with real mic lifecycle implementation (`getUserMedia`, mono downmix, 16kHz PCM16 chunk output).
    Wire `toggleListening` to send `start_listening` / `stop_listening` and push binary chunks via websocket only when connected.
    Enforce cleanup on disconnect and permission/capture errors per contract.
    Keep API surface identical to Task 1 contracts.
  </action>
  <done>
    `cd client && npm run build` passes.
    `cd client && npm run lint` passes.
    With server running, clicking voice toggle starts/stops listening and emits valid STT state transitions in UI.
    Speaking into microphone produces STT updates/finals through the existing server pipeline.
    Disconnect while capturing triggers safe local stop and no runaway capture loop.
  </done>
  <depends-on>2</depends-on>
  <log>
    2026-03-23 12:54:09 -05:00 - Implemented Task 3 microphone capture and STT uplink wiring (audio-capture lifecycle, runtime start/stop/listen logic, editor voice state UI props).
    Files modified: client/src/lib/audio-capture.ts, client/src/lib/chat-runtime.ts, client/src/components/editor/ChatEditor.tsx, client/src/pages/HomePage.tsx.
    Verification: `cd client && npm run build` passed.
    Verification blocker: `cd client && npm run lint` fails on pre-existing files outside Task 3 scope (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).
    Pending manual check: with server running, validate mic start/stop toggles and STT update/final events from live speech.`r`n    Assumed complete by user decision to move forward without live STT validation.
  </log>
</task>

<task id="4" status="COMPLETE">
  <n>PCM Streaming Playback and Voice UX Hardening</n>
  <context>
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 1 - New Flow C and D)
    docs/specs/stt-llm-tts-client-chat.md (Section: Step 3 - New Contract B, C, D, E)
    docs/specs/stt-llm-tts-client-chat.md (Section: Global Sequencing Invariants)
    client/src/lib/chat-contracts.ts
    client/src/lib/audio-player.ts
    client/src/lib/chat-runtime.ts
    client/src/lib/chat-messages.ts
    client/src/components/chat/ChatTimeline.tsx
    client/src/styles.css
  </context>
  <files>
    client/src/lib/audio-player.ts [MODIFY - implement PCM16 queue/scheduler]
    client/src/lib/chat-runtime.ts [MODIFY - route audio stream control + binary chunks to player]
    client/src/lib/chat-messages.ts [MODIFY - active speaker/audio stream state transitions]
    client/src/components/chat/ChatTimeline.tsx [MODIFY - speaking indicators/playback status]
    client/src/styles.css [MODIFY - speaking/playback visual states]
  </files>
  <action>
    Replace playback stub with real PCM16 player that respects `audio_stream_start` sample rate and drains on `audio_stream_stop`.
    Enforce single active stream invariant while preserving speaker attribution and speaking order in timeline.
    Handle edge cases: orphan chunks, stream mismatch, stop mismatch, reconnect flush/drain behavior.
    Keep runtime contracts stable and expose non-fatal playback errors via view model.
  </action>
  <done>
    `cd client && npm run build` passes.
    `cd client && npm run lint` passes.
    With server running, streamed TTS binary chunks are audibly played from start to stop events.
    Timeline shows correct active speaker and ordered turn history for sequential character responses.
    Only one audio stream is active at a time; mismatch/orphan stream inputs fail gracefully without UI breakage.
  </done>
  <depends-on>3</depends-on>
  <log>
    2026-03-23 13:25:46 -05:00 - Implemented Task 4 PCM streaming playback and voice UX hardening.
    Files modified: client/src/lib/audio-player.ts, client/src/lib/chat-runtime.ts, client/src/lib/chat-messages.ts, client/src/components/chat/ChatTimeline.tsx, client/src/styles.css.
    Verification: `cd client && npm run build` passed.
    Verification baseline: `cd client && npm run lint` fails only on pre-existing files outside Task 4 scope (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).
    2026-03-23 13:56:25 -05:00 - User validated end-to-end on live server: STT mic toggle, streamed text flow, and audible TTS playback all functioning.
  </log>
</task>



