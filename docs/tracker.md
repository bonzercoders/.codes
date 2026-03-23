# Project Tracker

## Active Feature
**Name:** stt-llm-tts-client-chat
**Plan:** docs/plans/stt-llm-tts-client-chat.md
**Spec:** docs/specs/stt-llm-tts-client-chat.md

## Current State
**Task:** 4 of 4
**Task Name:** PCM Streaming Playback and Voice UX Hardening
**Status:** COMPLETE
**Branch:** codex/stt-llm-tts-client-chat

## What Just Happened
Implemented Task 4 playback/runtime/timeline hardening: real PCM16 audio scheduler, stream drain behavior, playback state routing into chat reducer, and speaking-status UI updates.

## What's Next
- Planned implementation tasks are complete.
- Run live server validation when available to confirm audible `audio_stream_start`/binary/`audio_stream_stop` playback end-to-end.

## Blockers
- `cd client && npm run lint` fails on pre-existing files outside current task scope:
  - `client/src/components/registry/button.tsx`
  - `client/src/components/registry/tabs.tsx`
  - `client/src/components/ui/button.tsx`
  - `client/src/lib/websocket.ts`

## Session Notes
- Task 3 was marked complete by user decision without live STT validation.
- Task 4 implementation verified via local client build; live server playback validation remains pending.
- Single-user, single active audio stream invariant is intentional and required.
