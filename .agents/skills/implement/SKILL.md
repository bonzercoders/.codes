---
name: implement
description: Implement the current task from the active plan. Reads the tracker to find what's next, loads the task's context files, executes the work, runs verification, and updates status in both the plan and tracker. Use when the user says "implement", "next task", "let's build", "go", or wants to execute a planned task.
---

## Implementation Workflow

### Step 1: Load State

Read `docs/tracker.md` to find:
- Which plan file is active
- What task number we're on
- Any session notes or blockers from previous work

Then read the plan file and locate the current task block.

If the user specifies a task number, use that instead.
If no tracker exists, tell the user to run /plan first.

### Step 2: Load Context

Read EVERY file listed in the current task's `<context>` block.
This is mandatory — do not skip any file. These are the references
needed to do the work correctly. If a context file references a
specific section of a spec (e.g., "Section: Contracts — STT → LLM"),
focus on that section.

### Step 3: Check Dependencies

Look at the task's `<depends-on>` field. Verify all listed task IDs
have status="COMPLETE" in the plan file. If any dependency is not
complete, tell the user which dependency is missing and stop.

### Step 4: Update Status — IN_PROGRESS

In the plan file, update the current task's status attribute:
  `<task id="N" status="IN_PROGRESS">`

Update the plan file's `## Current Task:` to this task number.
Update the plan file's `## Status:` to IN_PROGRESS.

Update `docs/tracker.md`:
- Set Current State task number, name, and status to IN_PROGRESS

### Step 5: Implement

Execute the work described in the task's `<action>` block:

- Follow all conventions from AGENTS.md
- Only touch files listed in the task's `<files>` block. If you discover
  you need to modify a file not listed, STOP and tell the user. This means
  the plan needs updating — don't silently expand scope.
- Write tests as specified in `<done>`
- If the task says to replace a stub, verify the new module has identical
  method signatures to the stub before changing any imports

### Step 6: Verify

Run EVERY verification command listed in the task's `<done>` block.
All criteria must pass before marking the task complete.

If a test fails:
- Fix the issue if it's a straightforward bug in the new code
- If the fix requires changing files outside the task's `<files>` list,
  or if the failure suggests a deeper problem, tell the user

### Step 7: Log and Complete

In the plan file, update the task block:

1. Set status to COMPLETE: `<task id="N" status="COMPLETE">`

2. Fill in the `<log>` block with:
   - Timestamp (current date and time)
   - Files created and modified (brief list)
   - Test results summary (how many passed, any notable outcomes)
   - Any deviations from the plan and why

3. Update the plan header:
   - Set `## Current Task:` to the next task number
   - If ALL tasks are now COMPLETE, set `## Status:` to COMPLETE

Update `docs/tracker.md`:
- Move the completed task's info into "What Just Happened"
- Set Current State to the next task number, name, and NOT_STARTED
- Update "What's Next" with remaining tasks
- Add any discoveries or decisions to "Session Notes" that future
  sessions should know about

### Step 8: Report

Tell the user:
- What was done (brief — 2-3 sentences max)
- Test results (what passed)
- What task is next (name and brief description)
- Any decisions made or issues encountered

IMPORTANT: Only implement ONE task per invocation. Do not continue to
the next task without the user's go-ahead.
