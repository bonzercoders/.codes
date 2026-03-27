# Project Tracker

## Active Feature
**Name:** character-voice-runtime-integration
**Plan:** docs/plans/character-voice-runtime-integration.md
**Spec:** docs/specs/character-voice-runtime-integration.md

## Current State
**Task:** 4 of 4
**Task Name:** Realtime Sync Observability and No-Restart Validation
**Status:** NOT_STARTED
**Branch:** codex/character-voice-runtime-integration

## What Just Happened
Completed Task 3: Deterministic Voice ID Generation in Voice Create Flow.
Voice creation now generates `voice_id` values using normalized base + 3-digit suffix (for example `amy-voice-001`, `amy-voice-002`) instead of UUIDs.
Create flow now retries on duplicate-key conflicts with refreshed voice rows, while edit flow keeps `voice_id` immutable.

## What's Next
- Task 4: Realtime Sync Observability and No-Restart Validation

## Blockers
None

## Session Notes
- Updated: character chat toggling is multi-active; toggling one character does not deactivate others.
- Updated: voice ID normalization is hyphenated and suffixed (example: `amy-voice-001`).
- Task 1 decision: runtime/socket ownership moved to app-level provider (`ChatRuntimeProvider`) and Home now consumes shared runtime context.
- Task 1 decision: websocket URL now supports optional `VITE_VOICE_WS_URL` override with fallback behavior.
- Task 2 decision: Characters page now loads voice options from Supabase and editor voice selection displays `voice_name` while storing `voice_id`.
- Task 2 decision: missing/deleted voice selections fall back to empty dropdown display and are sanitized to empty `voice_id` on save.
- Task 3 decision: deterministic `voice_id` generation now uses normalized name base + first free suffix from `001` to `999`; if all suffixes are used, create returns an explicit error.
- Task 3 decision: create flow retries after duplicate `voice_id` conflicts by refreshing voices before recomputing the next suffix.
- Current lint failures in registry/ui/websocket files are known baseline debt.
