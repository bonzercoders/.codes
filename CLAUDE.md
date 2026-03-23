# Project Overview

Low-latency voice chat application using WebSocket currently (move to --> WebRTC) to connect remote server and local client (browser). 
Single-user application. Do not over-engineer for enterprise scale or multi-tenancy.

## Tech Stack
[List your stack. Examples below — replace with yours.]
- Backend: Python 3.11, FastAPI
- Frontend: React, TypeScript, Vite, shadcn
- Database: Supabase (PostgreSQL)
- AI/LLM: OpenRouter
- Deployment: Server(remote) avast.ai GPU. Local client (browser)

**Important**

  While Tailwind is installed, as it is required, you should use standard CSS if possible.

## Principles/Style

- Adhere to KISS, YAGNI principles.
- Write code a human can read and maintain.

## Directory Structure

.code
├── server
├── client
│   └── src
│       ├── assets
│       ├── components
│       │   ├── characters
│       │   │   ├── CharacterDirectory.tsx
│       │   │   └── CharacterEditor.tsx
│       │   ├── drawer
│       │   │   └── HomeInfoDrawer.tsx
│       │   ├── editor
│       │   │   └── ChatEditor.tsx
│       │   ├── layout
│       │   │   ├── AppLayout.tsx
│       │   │   └── PageCanvas.tsx
│       │   ├── registry
│       │   ├── ui
│       │   └── voices
│       │       ├── VoiceDirectory.tsx
│       │       └── VoiceEditor.tsx
│       ├── lib
│       │   ├── supabase
│       │   │   ├── characters.ts
│       │   │   ├── client.ts
│       │   │   └── voices.ts
│       │   ├── characters.ts
│       │   ├── chat-messages.ts
│       │   ├── navigation.ts
│       │   ├── openrouter-models.ts
│       │   ├── utils.ts
│       │   ├── voices.ts
│       │   └── websocket.ts
│       └── pages
│           ├── HomePage.tsx
│           ├── AgentsPage.tsx
│           ├── CharactersPage.tsx
│           ├── VoicesPage.tsx
│           └── SettingsPage.tsx
├── CLAUDE.md
├── AGENTS.md
├── requirements_higgs.txt
└── setup.sh

## Workflow
This project uses a structured planning and execution workflow.
- Specs live in docs/specs/ — define what we're building (data flows, modules, contracts)
- Plans live in docs/plans/ — structured task blocks with context pointers
- Tracker at docs/tracker.md — current progress, updated by /implement
- Use /plan to decompose work, /implement to execute tasks, /status for progress, /resume to pick up after a break
- Each task in a plan has a <context> block listing files to read first — always read those before starting work
- Each task has a <files> block — only modify files listed there unless you check with me first
- Each task has <done> criteria — run all verification commands before marking complete
