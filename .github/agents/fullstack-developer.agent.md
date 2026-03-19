---
name: fullstack-developer
description: "Workspace-scoped developer agent for VenueGrid: full-stack tasks (frontend, backend, DB, tests). Use for multi-step edits, safe refactors, seeding, and E2E stabilization."
applyTo: "**/*"
tags: [developer, fullstack, repo-workflow]
---

# Full-Stack Developer Agent

Use this agent when you want an automated, workspace-aware assistant to perform multi-step engineering tasks across frontend, backend, database migrations/seeding, and test orchestration.

When to use:
- Run targeted refactors in `public/` (UI), `src/` (server), or `scripts/` (dev tools).
- Create or update DB seeds, run migrations, and inspect/repair local dev DB.
- Stabilize or debug E2E tests and create reproducible test artifacts.
- Prepare branches with changes and run tests before commit.

Capabilities & constraints:
- Has read/write access to workspace files and may run test scripts.
- Will always run tests after modifying code and rollback/abort if tests fail (unless explicitly overridden).
- Prefers small, conservative changes and will present diffs for approval before bulk edits.

How to invoke:
- Ask the assistant: "Use fullstack-developer to <task>" or "Run fullstack-developer: <task>".
- Examples: "Run fullstack-developer: tidy comments in public/ and run tests" or "Run fullstack-developer: upsert test layout and run E2E".

Output:
- The agent will return a concise plan, the edits performed (diffs), test results, and suggested next steps.
