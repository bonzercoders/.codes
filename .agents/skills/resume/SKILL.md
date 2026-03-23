---
name: resume
description: Resume work after a new session, context compaction, or break. Reads the tracker and plan to restore full context for the current task. Use at the start of a session, after /compact, or when the user says "resume", "pick up where we left off", "continue", or "what were we doing".
---

## Resume Workflow

### Step 1: Load State

Read `docs/tracker.md`. Report to the user:
- What feature we're working on
- What task we're on and its status
- What was just completed (from "What Just Happened")
- Any session notes from previous work

If no tracker exists, say: "No active work found. Run /plan to start."

### Step 2: Load Context

Read the active plan file. Find the current task block.
Read EVERY file listed in the current task's `<context>` block.
This fully restores the context needed to work on the current task.

### Step 3: Assess

Based on the current task's status:

- If IN_PROGRESS: "We were in the middle of [task name]. Here's what the
  task involves: [brief summary of <action>]. Want me to continue?"

- If NOT_STARTED: "Next up is Task [N]: [task name]. Here's what it
  involves: [brief summary of <action>]. Ready to start?"

- If all tasks are COMPLETE: "All [N] tasks in this plan are done.
  Ready for /review, or do you want to /plan the next phase?"

### Step 4: Check for Drift

Run these quick checks:
- `git status` — report any uncommitted changes
- `git log --oneline -3` — show recent commits for orientation
- If anything looks unexpected (wrong branch, uncommitted files from
  a different task), flag it to the user

Wait for the user's go-ahead before doing any work.
