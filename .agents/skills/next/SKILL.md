---
name: next
description: Transition to new work after completing a feature or phase. Archives the current plan, refreshes the project audit, and prepares for planning the next piece of work. Use when the user says "next feature", "move on", "I want to work on something else", "what's next", or is done with the current plan and ready for different work.
---

## Feature Transition Workflow

### Step 1: Close Out Current Work

Read `docs/tracker.md` to find the active plan.

If the current plan has tasks that are NOT_STARTED or IN_PROGRESS:
- Tell the user: "The current plan ([name]) still has incomplete tasks:
  [list them]. Want to mark the plan as complete anyway, or finish those first?"
- Wait for confirmation before proceeding.

If all tasks are COMPLETE (or user confirms moving on):
- Update the plan file's `## Status:` to COMPLETE
- Update `docs/tracker.md`:
  - Clear all fields
  - Under "What Just Happened", write: "Completed [plan name]. 
    Plan archived at [plan file path]."

The old plan file stays where it is — it's a historical record. Do NOT delete it.

### Step 2: Refresh the Audit

Check when `docs/audit.md` was last written (look at the date in the file).

Tell the user: "The codebase has changed since the last audit [date]. I should
re-audit to understand the current state before planning new work. This takes
a few minutes but means the next plan will be accurate. Want me to run /audit
now, or skip it and plan from the current audit?"

If the user wants a refresh:
- Run the full audit workflow (same as /audit skill)
- The new audit will capture everything that was built in the previous feature

If the user wants to skip:
- Proceed with the existing audit, but note in the plan that the audit may
  be stale for recently built modules

### Step 3: Bridge to Planning

Tell the user:

"Ready for new work. The project state is:
- Completed: [previous feature name]
- Audit: [current/refreshed] as of [date]
- Active plan: none

What do you want to work on next? Describe it and I'll run /plan."

When the user describes the next feature, proceed directly into the /plan
workflow. The plan will automatically pick up the audit (current or refreshed)
and build around the existing codebase.
