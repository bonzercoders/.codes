---
name: audit
description: Audit an existing codebase to understand what's built, what's working, what's partial, and what's missing. Use BEFORE /plan when dropping into an existing project, joining a project mid-stream, or when significant work was done outside the workflow system. Produces a structured assessment that /plan uses as input.
argument-hint: [focus area or "full"]
---

## Codebase Audit Workflow

You are in RESEARCH MODE. Do NOT modify any code.

This skill maps an existing codebase into a structured assessment. The output
becomes input for /plan, so it needs to capture what exists, what works, what
patterns are established, and what gaps remain.

### Step 1: Discover Project Structure

Read the project's top-level files and directory structure:
- CLAUDE.md (if it exists — this has the project's own documentation)
- README, package.json / requirements.txt / pyproject.toml (tech stack, deps)
- Directory tree (2 levels deep)
- Any existing docs/ folder

Report the tech stack and project shape to the user. Ask:
"Is this the full project, or should I also look at [other directories]?"

### Step 2: Trace Existing Data Flows

Read the main entry points (server startup, route definitions, main components)
and FOLLOW THE DATA through the code:

- Where does input enter the system? (API routes, WebSocket handlers, event listeners)
- What functions/classes process it at each stage?
- Where does output leave the system? (responses, WebSocket messages, audio streams)
- What data formats are used between stages? (look at actual types, dataclasses,
  function signatures — not guesses)

For each flow you discover, document:
- The path: entry point → processing stages → output
- The data format at each boundary (from actual code, not assumptions)
- Whether it's fully implemented, partially implemented, or just scaffolded

Present the flows to the user: "Here's what I see data doing in your system.
Does this match your understanding? What am I missing?"

### Step 3: Inventory Modules and Their State

For each distinct module/component in the codebase, assess:

```
MODULE: [Name]
  Location: [file paths]
  Purpose: [what it does, derived from code]
  State: WORKING | PARTIAL | SCAFFOLDED | BROKEN
  Evidence: [why you rated it this way — test results, TODO comments,
            stub implementations, missing error handling]
  Depends on: [other modules it calls or imports from]
  Provides to: [other modules that call or import from it]
  Implicit contracts: [data formats it accepts/produces, based on actual
                       function signatures and usage]
```

State definitions:
- WORKING: Has implementation and tests pass (or is actively used without errors)
- PARTIAL: Core functionality exists but missing error handling, edge cases,
  or secondary features
- SCAFFOLDED: Files/classes exist but implementation is stubbed, placeholder,
  or TODO-heavy
- BROKEN: Exists but has known issues, failing tests, or conflicts

### Step 4: Identify Implicit Contracts

Look at how modules actually communicate right now:
- Function signatures between modules (actual parameter types)
- Event/message formats (look at emit/send calls and their handlers)
- Shared data structures (dataclasses, TypeScript interfaces, schemas)
- Queue/stream patterns (what's produced, what's consumed)

Document these as contracts — even if they weren't explicitly designed as such.
These are constraints that any new work must respect.

### Step 5: Find the Gaps

Based on the data flows and module inventory, identify:
- **Missing modules**: Stages in the data flow that have no implementation
- **Missing connections**: Modules that exist but aren't wired together
- **Missing error handling**: Happy path works but failures aren't handled
- **Missing tests**: Code exists but isn't tested
- **Incomplete features**: Partially built functionality
- **Technical debt**: Patterns that will cause problems as the project grows
  (e.g., hardcoded values, mixed patterns, TODO comments)

### Step 6: Write the Audit Report

Create `docs/audit.md` with this structure:

```markdown
# Codebase Audit: [Project Name]
# Date: [current date]

## Tech Stack
[confirmed from actual dependencies]

## Project Structure
[actual directory layout with brief annotations]

## Data Flows
### Primary Flow: [name]
[entry → stage → stage → output, with data formats from actual code]
State: [COMPLETE | PARTIAL | BROKEN]

### Secondary Flow: [name] (if applicable)
...

## Module Inventory
### [Module Name]
- Location: [paths]
- State: WORKING | PARTIAL | SCAFFOLDED | BROKEN
- Evidence: [specifics]
- Implicit contracts:
  - Accepts: [actual input format from code]
  - Produces: [actual output format from code]

### [Next Module]
...

## Existing Contracts (from code)
[Data structures, interfaces, and communication patterns already established]

## Gaps
### Missing Modules
[stages in the flow with no implementation]

### Missing Connections
[modules that exist but aren't wired]

### Missing Error Handling
[where failures aren't handled]

### Incomplete Features
[partially built functionality]

### Technical Debt
[patterns that need addressing]

## Recommendations
[Suggested priorities: what to build, fix, or refactor first, and why]
```

### Step 7: Bridge to Planning

After presenting the audit, tell the user:

"This audit is saved to docs/audit.md. When you run /plan next, tell Claude
to read the audit first. It will use the existing modules, contracts, and
gaps as the starting point instead of designing from scratch.

For example:
  /plan
  Read docs/audit.md first. I want to [build the missing pieces / fix the
  gaps / add a new feature on top of what exists]."

The audit serves as the MAP and BOUND steps that /plan would normally do
from scratch — but grounded in what actually exists in the code rather than
what's in your head.
