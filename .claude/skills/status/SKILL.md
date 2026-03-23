---
name: status
description: Show current project progress. Quick check on where things stand. Use when the user says "status", "where are we", "what's next", "progress", or wants a quick overview.
---

## Status Check

Read `docs/tracker.md` and the active plan file referenced in the tracker.

Present a brief summary in this format:

**Feature:** [name]
**Progress:** [N of M tasks complete]
**Current Task:** [task id] — [task name] — [status]
**Branch:** [branch name]

**Done:**
- Task 1: [name] ✓
- Task 2: [name] ✓

**Up Next:**
- Task 3: [name] ← current
- Task 4: [name]

**Blockers:** [any blockers from tracker, or "None"]

**Session Notes:** [any notes from tracker, or omit if empty]

If there's no tracker file, say: "No active work tracked. Run /plan to get started."

Keep this SHORT. The user wants a quick glance, not a full report.
Do not read any source code files — only the tracker and plan.
