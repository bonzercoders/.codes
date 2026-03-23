---
name: plan
description: Decompose a project or feature into structured, executable tasks. Traces data flow, identifies modules, defines contracts, determines build order, and writes task blocks. Use when the user wants to plan work before implementing, or says "let's plan", "break this down", "how should we build this", or similar.
---

## Planning Workflow — Full Decomposition

You are in PLANNING MODE. Do NOT write any implementation code.

### Step 0: Check for Existing Work

Before starting decomposition, check what already exists:

1. Check if `docs/audit.md` exists. If it does:
   - Read it. This contains a structured assessment of the existing codebase:
     data flows already implemented, modules and their states (WORKING, PARTIAL,
     SCAFFOLDED, BROKEN), implicit contracts from actual code, and identified gaps.
   - Use the audit as the foundation for Steps 1-3. DO NOT re-derive what the
     audit already discovered from the code. Instead:
     - Step 1 (MAP): Start from the audit's data flows. Only trace NEW flows
       the user is adding, or fill in gaps the audit identified.
     - Step 2 (BOUND): Start from the audit's module inventory. Only define NEW
       modules or adjust boundaries for existing ones if the new feature requires it.
     - Step 3 (CONTRACT): Start from the audit's existing contracts. Only define
       NEW contracts between new modules, or contracts for gaps the audit found.
       Existing contracts are constraints — new work must conform to them.
   - Tell the user: "I've read the codebase audit. Here's what already exists:
     [brief summary]. I'll build the plan around what's already working."

2. If no audit exists, check if the project has existing source code (look for
   src/, app/, lib/, or similar directories with implementation files).
   - If substantial code exists: tell the user "This project has existing code
     but no audit. I recommend running /audit first so I can understand what's
     built before planning. Want me to continue planning anyway, or run /audit?"
   - If the user wants to continue without an audit: do a quick read of the
     main entry points and key files to understand the current state. Note in
     the plan any assumptions you're making about existing code.

3. If no code exists (new project): proceed directly to Step 1.

---

Follow the remaining steps IN ORDER. Present each step's output to the user and
get confirmation before proceeding to the next. The user may want to skip steps
for smaller features — that's fine. For anything touching 3+ files or involving
multiple modules, do all five steps.

### Step 1: MAP — Trace the Data Flow

Understand what the system does by following data from input to output.

If an audit exists, start from its data flows. Only trace what's NEW or what
fills gaps the audit identified. Clearly mark which flows are existing (from
audit) vs new (being added).

If no audit exists:
- If no spec exists yet, ask the user to describe the primary use case
- Trace the primary data flow step by step: what goes in, what transformations
  happen at each stage, what comes out. Be specific about data formats at each
  boundary (bytes, text, JSON, events, streams).
- Then trace secondary flows: error cases, interrupts/cancellations, edge cases,
  reconnection, state that persists across interactions
- Present the flow and ask: "Does this match your mental model? What's missing?"

Output: Data flow section written to the spec file.

### Step 2: BOUND — Identify Modules

Draw boundaries around cohesive chunks of functionality.

If an audit exists, start from its module inventory. Existing modules with state
WORKING or PARTIAL are fixed boundaries — don't reorganize them. Only define NEW
modules for functionality being added. If the audit shows a module as SCAFFOLDED,
you may redefine its boundaries if the new plan will build it out.

If no audit exists, derive modules from the data flow:
- Identify natural modules (things that change together stay together)
- For each module: what does it receive, transform, and produce?
- Validate each boundary with these checks:
  - Can it be tested in isolation without other modules running?
  - If you rewrote its internals, would other modules need to change?
  - Can you describe what crosses the boundary in one sentence?
- Present modules and ask: "Are these boundaries right? Would you split
  or merge any of these?"

Output: Modules section written to the spec file.

### Step 3: CONTRACT — Define Interfaces

Specify exactly what passes between modules. This is the most important step.

If an audit exists, its "Existing Contracts" section documents interfaces that
are ALREADY IN THE CODE. These are constraints, not suggestions. New work must
conform to them. Only define NEW contracts for:
- Interfaces between new modules
- Interfaces between existing and new modules
- Gaps the audit identified (modules that exist but aren't wired together)
Clearly label which contracts are EXISTING (from code) vs NEW (being defined).

For EACH new interface between two modules, define:
- Data format: exact types, fields, encoding
- Transport mechanism: function call, event/callback, async queue, stream
- Flow control: who initiates, push vs pull, streaming vs batch, backpressure
- Error contract: what errors can occur, how they're signaled to the caller

Write these as if two different developers will independently build each side.
They should be able to implement their module without coordinating beyond this
contract.

Write all contracts to the spec file under a dedicated Contracts section.
These are the single source of truth that every task will reference.

Ask: "Do these interfaces look right? Any format preferences or constraints?"

Output: Contracts section written to the spec file.

### Step 4: SEQUENCE — Determine Build Order

Figure out what to build first using these principles:

FOR NEW PROJECTS (no audit, no existing code):

1. SKELETON FIRST: The first task always establishes the project structure,
   defines contract types as actual code (dataclasses, interfaces, schemas),
   and creates stubs for every module that implement the contract interfaces
   with hardcoded/fake data. Wire stubs together so data flows end-to-end.

2. ONE REPLACEMENT AT A TIME: Each subsequent task replaces exactly one stub
   with one real implementation. The interface stays identical — only the
   internals change.

FOR EXISTING PROJECTS (audit exists):

1. STABILIZE FIRST: If the audit identified BROKEN or PARTIAL modules that
   affect the area you're working on, fix or complete those before building
   new things. The first task should address any instability in modules your
   new work depends on.

2. CONTRACTS AS CODE: If shared types/contracts don't already exist as
   explicit code (they may be implicit in function signatures), the first
   task should extract and formalize them. This prevents drift as you add
   new modules alongside existing ones.

3. STUBS ONLY FOR NEW MODULES: Don't create stubs for modules that already
   have WORKING implementations. Only stub out genuinely new modules. Wire
   new stubs into the existing system so the pipeline works end-to-end with
   real existing modules + stubbed new modules.

4. NEW MODULES ONE AT A TIME: Same as the new-project pattern — each task
   replaces one new stub with one real implementation.

FOR BOTH:

- INTEGRATION FROM DAY ONE: Every task tests the connections to neighbors,
  not just the module's internals. After every task, you can run the system
  and see something work.

- RISKS EARLY: Schedule uncertain or difficult parts in the first half so
  you can pivot if the approach doesn't work.

For large projects, split into phases of 3-5 tasks each. Each phase starts
and ends with a working system. Plan one phase at a time — don't plan
Phase 3 until Phase 2 is done.

Present the sequence and ask: "Does this order make sense? Anything you'd
want to tackle sooner or later?"

Output: Agreed build order.

### Step 5: TASK — Write Structured Task Blocks

Convert the sequence into the plan file at `docs/plans/[name].md`.

The plan file format:

```
# Plan: [Feature/Phase Name]

## Overview
[2-3 sentences: what we're building and why]

## Spec Reference
docs/specs/[name].md

## Status: NOT_STARTED

## Current Task: 1

---

[task blocks here]
```

For EACH task, write a block using this format:

```xml
<task id="N" status="NOT_STARTED">
  <n>Short task name</n>
  <context>
    List every file Claude must READ before starting this task.
    Be specific — include section references for specs.
    Example: docs/specs/voice-chat.md (Section: Contracts — STT → LLM)
  </context>
  <files>
    Every file to CREATE or MODIFY, with markers:
    src/pipelines/stt.py [CREATE]
    src/pipelines/__init__.py [MODIFY - swap stub import for real module]
  </files>
  <action>
    Specific instructions. Reference contract names, existing patterns,
    functions, classes, and middleware by name. If replacing a stub,
    name which stub and confirm the interface stays identical.
  </action>
  <done>
    Testable criteria with runnable commands.
    Must test the interface (input/output matches contract), not just internals.
    Example: pytest tests/integration/test_stt_pipeline.py
  </done>
  <depends-on>task IDs that must be COMPLETE first, or "none"</depends-on>
  <log>
  </log>
</task>
```

Task block rules:
- Every task's <context> MUST include the relevant contracts from the spec
- Every task's <done> MUST test the interface, not just internals
- If replacing a stub, <action> must name which stub and confirm interface match
- Maximum 3-5 tasks per plan
- Each task completable in one focused session
- First task establishes shared types, stubs, and project structure
- There must be a working (runnable) system after every task

After writing the plan, create or update `docs/tracker.md`:

```
# Project Tracker

## Active Feature
**Name:** [feature name]
**Plan:** docs/plans/[name].md
**Spec:** docs/specs/[name].md

## Current State
**Task:** 1 of [N]
**Task Name:** [first task name]
**Status:** NOT_STARTED
**Branch:** feature/[name]

## What Just Happened
[nothing yet — first task]

## What's Next
- Task 1: [name]
- Task 2: [name]
- ...

## Blockers
None

## Session Notes
```

Present the complete plan for final review.

IMPORTANT: Stay in planning mode until the user explicitly says to implement.
