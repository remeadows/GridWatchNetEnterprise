# AGENTS.md

## GridWatch NetEnterprise — Agent Workload & Execution Rules

This file defines how any coding agent (Claude Code, Codex, etc.) operates in this repository.
If there is ambiguity, follow these rules instead of guessing.

---

## 0) Prime Directive

- Correctness > Security > Performance > Convenience
- Prefer small, reversible changes.
- Do not invent APIs, ports, schemas, files, or behaviors.
- When unsure: **read code or run a command**.

---

## 1) Mandatory Startup Sequence (Canonical — Single Source of Truth)

At the start of every session, read these files **in this exact order**:

1. `GO.md` (execution objectives — what to produce)
2. `AGENTS.md` (this file — how to operate)
3. `CLAUDE.md` (tool conventions & repo structure)
4. `CLAUDE_ENTERPRISE_SKILL.md` (engineering standards & module blueprints)
5. `CONTEXT.md` (architecture & constraints)
6. `PROJECT_STATUS.md` (current state)
7. `IssuesTracker.md` (work queue)
8. `README.md` (human-facing overview)
9. `COMMIT.md` (commit & CI workflow)

### Required Session Header (always output)

- **Objective** (1 sentence)
- **Active blockers** (top 1–3)
- **Execution plan** (3–7 steps)
- **Risks / unknowns** (if any)

---

## 2) Source-of-Truth & Conflict Resolution

When information conflicts, precedence is:

1. Running code + tests
2. `IssuesTracker.md` → what to work on _now_
3. `PROJECT_STATUS.md` → what exists _today_
4. `AGENTS.md` → how work is performed
5. `CLAUDE.md` → tool conventions
6. `CONTEXT.md` → architecture reference
7. `README.md` → onboarding & usage

If docs disagree:

- Fix the docs as part of the task.
- Never leave contradictions behind.

---

## 3) Work Sizing & Change Discipline

- One concern per session whenever possible.
- Keep diffs small and reviewable.
- Do **not** refactor unrelated code “while you’re here.”
- Shared components (auth, gateway, shared libs) require:
  - Impact analysis
  - Updated dependents in the same session
  - Explicit note in `IssuesTracker.md`

---

## 4) Engineering Standards (Non-Negotiable)

### TypeScript / Gateway

- Strict TypeScript; no `any`
- Zod schemas at all boundaries
- Follow existing Fastify plugin and route patterns

### Python Services

- Type hints on all functions
- AsyncIO for I/O-bound paths
- Structured logging only (no prints)

### Configuration

- All config via env vars or config files
- Update `.env.example` for any new variable
- Secure defaults only

---

## 5) Security Baseline

- No secrets, tokens, keys, or credentials in code or logs
- No default credentials
- Prefer Vault or injected secrets
- Never widen CORS, auth, or observability exposure without justification
- If you touch auth, crypto, or access control:
  - Add or update tests
  - Call out risk explicitly in your summary

---

## 6) Testing & Quality Gates

Run the **minimum required** checks for the change scope.

### Always (when applicable)

- Lint
- Typecheck
- Unit tests for touched modules

### Conditional

- Integration tests → API, DB, or gateway changes
- Benchmarks → performance-sensitive paths
- Security scans → auth, deps, secrets, networking

If something is skipped:

- State why
- Track it in `IssuesTracker.md`

---

## 7) Documentation Update Rules

Update docs **only when relevant**, but always when behavior changes.

- `IssuesTracker.md` → task status + resolution notes
- `PROJECT_STATUS.md` → milestones, notable changes
- `CONTEXT.md` → architecture or integration changes
- `README.md` → setup, commands, features

Docs are code. Keep them accurate.

---

## 8) Commit & Push Requirements

Follow `COMMIT.md` exactly.

Before pushing:

- Tests pass (or failures explained and tracked)
- Docs updated if needed
- No new warnings, secrets, or critical security findings

---

## 9) Session Output Expectations

Every response must include:

- What was changed
- Why it was changed
- Commands run (or not run, explicitly stated)
- Open risks or follow-ups

No hand-waving. No silent assumptions.

---

## 10) Definition of Done

A task is done when:

- Code runs locally (or via compose)
- Tests pass for affected areas
- Docs reflect reality
- IssuesTracker entry is updated
- Security posture is unchanged or improved

Strict by design. Future you will thank you.
