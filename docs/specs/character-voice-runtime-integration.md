# Spec: Character + Voice Runtime Integration
# Date: March 26, 2026

## Overview
This spec completes the currently partial character/voice integration so chat/TTS behavior can be controlled from the app UI instead of manual Supabase edits. It also hardens runtime behavior so websocket chat state survives page navigation and backend realtime updates can be verified while the server remains running.

## Scope
- Keep chat websocket/runtime alive across app route changes.
- Make character "Chat" actions control `is_active` in Supabase.
- Replace character editor `Voice ID` free text with a voice picker driven by `voice_name`.
- Enforce new frontend voice id generation (`<normalized-voice-name>-<NNN>`).
- Verify/harden backend realtime sync observability so row changes apply without server restart.

## Non-Goals (This Phase)
- Full backend TTS parameter expansion for `profile`/`scene` semantics.
- WebRTC transport migration.
- Multi-tenant or enterprise coordination patterns.

## Existing Constraints (From Current Audit)
- Transport is websocket today (`client/src/lib/websocket.ts`, `server/main.py:/ws`).
- Client websocket URL is currently hardcoded to `:8000`, while local server run block uses `5173`.
- Chat runtime is currently mounted from Home page, so leaving Home tears down socket/runtime.
- Server already has `RealtimeSync` and consumes in-memory voices/characters during runtime.
- Character editor currently stores `voice_id` as free text.
- Voice creation currently uses UUID-style id generation in frontend.
- Current lint baseline has pre-existing failures outside this feature scope.

## Step 1 - MAP (Data Flow)
### Existing Flow 1 (Preserved)
User text/mic -> websocket -> STT/LLM/TTS queues -> websocket events/binary -> client timeline/audio playback.

### New Flow A: App-Lifetime Runtime Persistence
1. App boot creates exactly one chat runtime/websocket owner at app shell level.
2. Route switches (`/home` -> `/characters` -> `/home`) do not recreate websocket.
3. Home page subscribes to already-running runtime state.

Output: connection continuity and preserved in-memory conversation state across navigation.

### New Flow B: Character Chat Toggle -> Active Character State
1. User clicks `Chat` in character directory or character editor.
2. Client computes next active state and writes `is_active` update(s) to Supabase.
3. Server `RealtimeSync` receives broadcast update and updates in-memory character store.
4. Next turn selection in LLM reflects updated active character(s) without restart.

Output: active chat character can be changed in UI; no direct DB edits required.

### New Flow C: Character Voice Selection by Name
1. Character editor loads voice options from Supabase (`voice_id`, `voice_name`).
2. User selects voice by readable `voice_name` label from dropdown.
3. Editor stores selected `voice_id` in character draft/update payload.

Output: voice assignment is reliable and human-readable.

### New Flow D: Voice Create -> Deterministic Voice ID
1. User enters `voice_name` when creating a voice.
2. Client normalizes name to lowercase base token.
3. Client finds next available 3-digit suffix from existing IDs.
4. Insert uses `<base>-<001..999>` instead of UUID.

Output: predictable voice ids that align with requested naming rules.

### New Flow E: Realtime Verification During Runtime
1. Server tracks realtime channel health/events and exposes status payload.
2. While server is running, editing character/voice rows updates status counters and in-memory state.
3. No restart required for runtime to pick up new voice/character records.

Output: operational confidence that realtime subscriptions are actually functioning.

## Step 2 - BOUND (Module Boundaries)
### Existing Modules (Fixed Boundaries)
- `client/src/lib/chat-runtime.ts`: runtime orchestration.
- `client/src/lib/websocket.ts`: transport abstraction.
- `client/src/pages/CharactersPage.tsx` + character components: character CRUD UI.
- `client/src/pages/VoicesPage.tsx` + voice components: voice CRUD UI.
- `server/db/realtime.py`: in-memory realtime sync for characters/voices.
- `server/main.py`: session transport and pipeline runtime.

### New/Adjusted Boundaries
- New client runtime ownership boundary:
  - App-level runtime provider/context owns singleton runtime lifecycle.
  - Route pages become runtime consumers only.
- Character activation service boundary:
  - Dedicated supabase update path for active toggling semantics.
- Voice id generation boundary:
  - Deterministic id generator in `lib/voices.ts`, used only on create.
- Realtime observability boundary:
  - `RealtimeSync` reports health/counters; FastAPI exposes read-only status endpoint.

## Step 3 - CONTRACT (Interfaces)
### Contract A: App-Lifetime Chat Runtime
Producer: app shell/provider.
Consumer: Home page and any future chat-aware UI.

Data/API:
- `ChatRuntimeViewModel` is unchanged.
- Provider exposes stable runtime reference for entire SPA session.

Flow control:
- Runtime initialized once on app mount.
- Route changes must not call websocket `disconnect()`.
- Socket URL source is env-driven (`VITE_VOICE_WS_URL` override, safe fallback behavior) instead of hardcoded port assumptions.

Error contract:
- Existing `lastError` surface remains; provider must forward it unchanged.

### Contract B: Character Active Toggle
Producer: Character directory/editor chat controls.
Consumer: Supabase characters table + server realtime sync.

Data format:
- Update payload: `{ is_active: boolean }` (and id filters).

Flow control (multi-active invariant):
- Toggle on: set selected character `is_active=true` only.
- Toggle off (same character): set selected character `is_active=false` only.
- Activating one character does not deactivate any other active characters.

Error contract:
- Supabase update errors are surfaced in UI and do not leave optimistic state stale.

### Contract C: Character Voice Selection
Producer: Character editor.
Consumer: Character update payload.

Data format:
- Voice options: `{ value: voice_id, label: voice_name }[]`.
- Persisted field remains `voice_id`.

Flow control:
- Dropdown renders `voice_name` for user.
- Selection writes `voice_id` only.

Error contract:
- If selected voice is missing on refresh, editor falls back to empty selection and prompts reselection.

### Contract D: Voice ID Generation
Producer: Voice create flow.
Consumer: Supabase voices insert.

Data format:
- `voice_id = <normalized-voice-name>-<suffix_3_digits>`.

Normalization rules:
- Lowercase.
- Convert spaces/separators to single hyphens.
- Remove characters outside `a-z`, `0-9`, and `-`.
- Collapse repeated hyphens and trim leading/trailing hyphens.
- Empty result falls back to `voice`.
- Suffix range starts at `001`, increments using existing IDs with same normalized base.

Error contract:
- If generated id already exists after recomputation, retry with next suffix.
- If no suffix available (`>999`), return explicit create error to UI.

### Contract E: Realtime Sync Status API
Producer: `RealtimeSync` internals.
Consumer: debug/ops checks and local verification.

Data format (read-only JSON):
- character count, voice count.
- subscription flags/channel readiness.
- last character event timestamp/type/id.
- last voice event timestamp/type/id.
- event counters + parse/error counters.

Flow control:
- Updated on every broadcast callback and startup load.

Error contract:
- Parsing failures increment counters and are logged; status endpoint still responds.

## Step 4 - SEQUENCE (Build Order)
1. Persist websocket/chat runtime across route changes first to remove session churn and unblock UX work.
2. Implement character activation toggle + voice dropdown wiring so chat control is usable from UI.
3. Enforce deterministic voice id generation in create flow.
4. Add realtime status observability + runtime verification for no-restart updates.

This order de-risks user-visible behavior first, then data consistency, then backend operational confidence.

## Assumptions for This Plan
1. Active character behavior is multi-active (many can be active at once). Toggling one on does not affect others; toggling an already active character off deactivates only that character.
2. Voice ID normalization is hyphenated (example: `"Amy Voice" -> "amy-voice-001"`).
3. Current lint failures outside feature scope remain baseline debt unless touched directly.
