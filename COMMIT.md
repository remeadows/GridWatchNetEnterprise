# COMMIT.md - Session Commit Instructions

## Task

Update the following documentation files with changes made during this work session:

1. **IssuesTracker.md**
   - Update NOW / NEXT / BLOCKED header
   - Document all resolved issues with resolution notes
   - Capture any open risks or follow-ups

2. **PROJECT_STATUS.md**
   - Update project status, milestones, and completion percentages
   - Note any significant technical or security-impacting changes

3. **CONTEXT.md**
   - Update only if architectural, integration, or system-boundary changes occurred

4. **README.md**
   - Update only if setup steps, commands, features, or module capabilities changed

5. **docs/GridWatch_Executive_Summary_ISSO.html** (ISSO Deliverable)
   - Executive Summary document for Information System Security Officer
   - Classification: UNCLASSIFIED
   - Contains: Project overview, deliverables, status, tech stack, security review status
   - Format: HTML (Word-compatible) - open in Microsoft Word and save as .docx
   - Update when: Version changes, security posture changes, or major milestone completions

---

## Requirements

- Version bump **only if** a public interface changed:
  - API contracts
  - Configuration variables
  - CLI flags
  - Exported modules or Docker image expectations
- Add a **last-updated timestamp** to modified docs
- Ensure all new features and resolved issues from this session are documented
- Do not duplicate the same explanation across multiple documents (link instead)

---

## Pre-Commit Quality Gate (Required)

Before committing, run the appropriate local checks for the work performed.

### TypeScript / Gateway (if touched)

- Lint
- Typecheck
- Unit tests

### Python (if touched)

- Lint / typecheck
- Unit tests

### Integration / Platform (if touched)

- `docker compose up -d --build`
- Integration or smoke tests (if applicable)

If any check is skipped:

- Document the reason in **IssuesTracker.md**
- Include the reason in the commit body

---

## CI/CD Validation

CI/CD is the authoritative gate for correctness.

### When CI/CD validation is REQUIRED

- Any code change (backend, frontend, services)
- Dependency changes (lockfiles, base images)
- Configuration or deployment changes
- Security, auth, networking, or secrets-related changes

### Pre-Push Gate

Before pushing:

- Confirm CI will trigger on push or PR
- If CI is not configured for this repo or branch, document that limitation in **PROJECT_STATUS.md**

### Post-Push Gate

After pushing:

- Verify the CI pipeline for this commit/PR is **green**
- Record the result in documentation:
  - `CI Status: PASS ✅` or `CI Status: FAIL ❌`
  - If failed: capture failing job name + short error summary in **IssuesTracker.md**

A task is **not complete** until CI passes or the failure is explicitly tracked.

---

## After Updates

1. Stage all modified documentation files
2. Commit with a descriptive message following conventional commit format
3. Push to the git repository
4. Verify CI/CD status post-push

---

## Commit Message Format

### Documentation-only session
