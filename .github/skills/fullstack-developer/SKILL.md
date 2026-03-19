---
name: fullstack-developer
description: |
  Skill supporting the `fullstack-developer` agent. Contains safe workflows and guidelines
  for making changes across frontend (`public/`), backend (`src/`), scripts (`scripts/`), and tests.
---

# Fullstack Developer Skill

This skill bundles recommended workflows, constraints, and examples the `fullstack-developer` agent will follow.

Workflows
- Frontend cleanup: small, reversible edits in `public/` (comments, extract helpers, minimal DOM changes). Run `npm test` and show diffs.
- Backend edits: modify `src/` files, run unit/integration tests, and ensure server starts locally when applicable.
- DB workflows: run `scripts/reset-db.ps1` (PowerShell) or `node scripts/create-test-layout.js` with env overrides; back up `data/` before changes.
- E2E stabilization: seed layout, promote test admin, run targeted Puppeteer test, capture artifacts on failure.

Safety rules
- Run unit tests after any change; abort and revert if tests fail.
- Limit edits per commit to a small set of files; present diffs and ask for confirmation for larger changes.
- Do not modify documentation files (`README.md`, `DEV-*.md`) unless explicitly requested.

Examples
- "Tidy comments in `public/` and run tests" → edits only `.js` files under `public/`, run `npm test` and return results.
- "Make create-test-layout upsert idempotent" → edit `scripts/create-test-layout.js`, run the script in dry-run mode, and run tests.

Activation
- The agent loads this skill when the user requests `fullstack-developer` or when a prompt includes the `fullstack-developer` tag.
