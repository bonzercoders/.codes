---
name: review
description: Review code changes for quality, bugs, and spec compliance. Runs in a forked context for a fresh perspective. Use after completing tasks, before shipping, or when the user says "review", "check this", or "is this ready to ship".
context: fork
agent: Explore
---

## Code Review

Review all changes in the current branch compared to main (or the base branch).

Use `git diff main...HEAD` to see what changed. If no branch context is clear,
ask the user which changes to review.

Check the spec file in `docs/specs/` if one exists for this feature.

### Review Checklist

1. **Correctness**: Logic errors, off-by-one bugs, race conditions, async/await
   mistakes, missing null checks

2. **Contract compliance**: Do modules accept and produce data matching the
   contracts defined in the spec? Are interface signatures correct?

3. **Error handling**: Missing try/catch, unhandled edge cases, silent failures,
   errors that are caught but not meaningfully handled

4. **Security**: Injection risks, exposed secrets or credentials, authentication
   gaps, unvalidated user input

5. **Performance**: N+1 queries, unnecessary loops, missing caching where it
   matters, blocking calls in async code

6. **Test coverage**: Are new code paths tested? Are edge cases covered? Do
   integration tests verify module connections?

7. **Conventions**: Does the code follow patterns established in AGENTS.md?
   Consistent naming, error handling style, file organization?

### Output Format

For each issue found:
- **File and location**: exact file path and line range
- **Severity**: CRITICAL (must fix) / WARNING (should fix) / NOTE (consider)
- **Problem**: what's wrong in one sentence
- **Fix**: specific suggestion

### Final Rating

Rate the changes: **SHIP** / **NEEDS WORK** / **NEEDS RETHINK**

- SHIP: No critical issues. Warnings are minor. Good to merge.
- NEEDS WORK: Has fixable issues. List what needs to change.
- NEEDS RETHINK: Fundamental approach problems. Explain what's wrong
  and suggest an alternative direction.
