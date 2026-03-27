# Plan: Character + Voice Runtime Integration

## Overview
This plan completes the core character/voice runtime loop so active chat speaker and voice assignment are controlled from the client UI, not manual DB edits. It also stabilizes websocket lifecycle across page navigation and adds realtime sync visibility so character/voice changes apply while the server is already running.

## Spec Reference
docs/specs/character-voice-runtime-integration.md

## Status: IN_PROGRESS

## Current Task: 4

---

<task id="1" status="COMPLETE">
  <n>App-Lifetime Chat Runtime and Persistent WebSocket</n>
  <context>
    docs/specs/character-voice-runtime-integration.md (Section: Step 1 - New Flow A)
    docs/specs/character-voice-runtime-integration.md (Section: Step 3 - Contract A)
    docs/audit.md (Section: Client WebSocket Transport)
    client/src/App.tsx
    client/src/pages/HomePage.tsx
    client/src/lib/chat-runtime.ts
    client/src/lib/websocket.ts
  </context>
  <files>
    client/src/lib/chat-runtime-context.tsx [CREATE]
    client/src/App.tsx [MODIFY - mount provider once at app shell]
    client/src/pages/HomePage.tsx [MODIFY - consume runtime from context]
    client/src/lib/chat-runtime.ts [MODIFY - allow stable provider ownership if needed]
  </files>
  <action>
    Create a runtime provider/context that owns one `useChatRuntime` instance for the SPA lifecycle and survives route transitions.
    Move websocket URL resolution to env-driven config (with fallback) so persistent connection logic is not tied to hardcoded local ports.
    Rewire Home page to consume the shared runtime instead of creating it directly.
    Keep runtime contract unchanged for UI consumers and preserve existing send/listen behavior.
    Ensure provider teardown only occurs on full app unmount, not route navigation.
  </action>
  <done>
    `cd client && npm run build` passes.
    Lint baseline remains unchanged except for files touched by this task.
    Manual check: websocket stays connected when navigating `/home -> /characters -> /home` and message timeline state remains intact.
    Manual check: env override for websocket URL works and default fallback remains valid.
  </done>
  <depends-on>none</depends-on>
  <log>
    2026-03-26 02:18:04 -05:00 - Implemented Task 1 app-lifetime runtime ownership and route-persistent websocket lifecycle.
    Files created/modified: client/src/lib/chat-runtime-context.tsx (create), client/src/App.tsx, client/src/pages/HomePage.tsx, client/src/lib/chat-runtime.ts.
    Verification: `cd client && npm run build` passed.
    Verification baseline: `cd client && npm run lint` fails only on pre-existing files outside Task 1 scope (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).
    Manual verification pending: in-browser check for route navigation persistence and `VITE_VOICE_WS_URL` override behavior.
  </log>
</task>

<task id="2" status="COMPLETE">
  <n>Character Activation Toggle and Voice Dropdown Wiring</n>
  <context>
    docs/specs/character-voice-runtime-integration.md (Section: Step 1 - New Flow B and C)
    docs/specs/character-voice-runtime-integration.md (Section: Step 3 - Contract B and C)
    docs/audit.md (Section: Voice and Character CRUD UI)
    client/src/pages/CharactersPage.tsx
    client/src/components/characters/CharacterDirectory.tsx
    client/src/components/characters/CharacterEditor.tsx
    client/src/lib/characters.ts
    client/src/lib/supabase/characters.ts
    client/src/lib/supabase/voices.ts
  </context>
  <files>
    client/src/pages/CharactersPage.tsx [MODIFY - implement chat toggle handlers and voice option loading]
    client/src/components/characters/CharacterDirectory.tsx [MODIFY - wire chat button active toggle state]
    client/src/components/characters/CharacterEditor.tsx [MODIFY - replace Voice ID input with Voice dropdown]
    client/src/lib/supabase/characters.ts [MODIFY - add active-toggle helpers]
    client/src/lib/characters.ts [MODIFY - add voice option types/helpers if needed]
  </files>
  <action>
    Implement multi-active character toggle semantics from both directory and editor chat actions.
    Toggling on should activate only the target character; toggling an already active target off should deactivate only that character.
    Replace free-text `Voice ID` field with a `Voice` selector showing `voice_name`, while persisting selected `voice_id`.
    Keep character CRUD behavior intact for save/delete and ensure UI state reflects DB updates.
  </action>
  <done>
    `cd client && npm run build` passes.
    Lint baseline remains unchanged except for files touched by this task.
    Manual check: clicking Chat in directory/editor toggles `is_active` in Supabase and UI reflects active status.
    Manual check: character editor voice dropdown shows voice names and saves corresponding `voice_id`.
  </done>
  <depends-on>1</depends-on>
  <log>
    2026-03-26 02:33:43 -05:00 - Implemented Task 2 character activation toggles and character voice dropdown wiring.
    Files modified: client/src/pages/CharactersPage.tsx, client/src/components/characters/CharacterDirectory.tsx, client/src/components/characters/CharacterEditor.tsx, client/src/lib/supabase/characters.ts, client/src/lib/characters.ts.
    Verification: `cd client && npm run build` passed.
    Verification baseline: `cd client && npm run lint` fails only on pre-existing files outside Task 2 scope (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).
    Manual verification pending: confirm directory/editor Chat buttons toggle `is_active` in Supabase and confirm editor Voice dropdown shows `voice_name` while persisting `voice_id`.
  </log>
</task>

<task id="3" status="COMPLETE">
  <n>Deterministic Voice ID Generation in Voice Create Flow</n>
  <context>
    docs/specs/character-voice-runtime-integration.md (Section: Step 1 - New Flow D)
    docs/specs/character-voice-runtime-integration.md (Section: Step 3 - Contract D)
    docs/audit.md (Section: Voice and Character CRUD UI)
    client/src/lib/voices.ts
    client/src/pages/VoicesPage.tsx
    client/src/lib/supabase/voices.ts
  </context>
  <files>
    client/src/lib/voices.ts [MODIFY - add normalized sequential voice_id generator]
    client/src/pages/VoicesPage.tsx [MODIFY - use deterministic generator on create]
  </files>
  <action>
    Replace UUID voice id creation with `<normalized-voice-name>-<NNN>` generation.
    Compute next suffix from existing voices sharing the same normalized base.
    Keep voice_id immutable after creation and maintain existing save/edit/delete flow.
  </action>
  <done>
    `cd client && npm run build` passes.
    Lint baseline remains unchanged except for files touched by this task.
    Manual check: creating voices with same name yields ids like `amy-voice-001`, `amy-voice-002`.
    Manual check: voice edits do not change existing `voice_id`.
  </done>
  <depends-on>2</depends-on>
  <log>
    2026-03-26 03:14:08 -05:00 - Implemented Task 3 deterministic voice_id generation in voice create flow.
    Files modified: client/src/lib/voices.ts, client/src/pages/VoicesPage.tsx.
    Verification: `cd client && npm run build` passed.
    Verification baseline: `cd client && npm run lint` fails only on pre-existing files outside Task 3 scope (`components/registry/button.tsx`, `components/registry/tabs.tsx`, `components/ui/button.tsx`, `lib/websocket.ts`).
    Manual verification pending: create voices with same name and confirm sequential ids (`amy-voice-001`, `amy-voice-002`) while voice edits keep existing `voice_id` unchanged.
  </log>
</task>

<task id="4" status="NOT_STARTED">
  <n>Realtime Sync Observability and No-Restart Validation</n>
  <context>
    docs/specs/character-voice-runtime-integration.md (Section: Step 1 - New Flow E)
    docs/specs/character-voice-runtime-integration.md (Section: Step 3 - Contract E)
    docs/audit.md (Section: Realtime Voice/Character Store)
    server/db/realtime.py
    server/main.py
  </context>
  <files>
    server/db/realtime.py [MODIFY - track realtime event counters/last-event metadata]
    server/main.py [MODIFY - add read-only realtime status endpoint]
  </files>
  <action>
    Add lightweight runtime telemetry for realtime character/voice broadcast ingestion.
    Expose a read-only endpoint for local verification of channel health, event counts, and last update details.
    Ensure normal runtime behavior is unchanged while improving diagnosability of no-restart updates.
  </action>
  <done>
    Server starts successfully with new endpoint.
    Manual check: editing character/voice rows while server is running updates in-memory state and realtime status metadata without restart.
    Existing websocket chat flow remains functional after telemetry additions.
  </done>
  <depends-on>2,3</depends-on>
  <log>
  </log>
</task>




