# Project Tracker

## Active Feature
**Name:** stt-llm-tts-client-chat
**Plan:** docs/plans/stt-llm-tts-client-chat.md
**Spec:** docs/specs/stt-llm-tts-client-chat.md

## Current State
**Task:** 1 of 4
**Task Name:** Contracts-As-Code and Runtime Skeleton
**Status:** NOT_STARTED
**Branch:** codex/stt-llm-tts-client-chat

## What Just Happened
Created the spec and implementation plan from docs/audit.md, including data flows, module boundaries, contracts, and build sequence.

## What's Next
- Task 1: Contracts-As-Code and Runtime Skeleton
- Task 2: Server Event State and Timeline Rendering
- Task 3: Microphone Capture and STT Binary Uplink
- Task 4: PCM Streaming Playback and Voice UX Hardening

## Blockers
None

## Session Notes
- Single-user, single active audio stream invariant is intentional and required.
- UI must still track speaker identity and sequential order across multiple character responses.
- Server websocket contracts are treated as fixed constraints and not redesigned in this plan.
