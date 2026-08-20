# Progress Tracker — Investment Agreement Management System

**Purpose of this file:** This project is being built collaboratively across multiple AI assistants (Claude Code, Gemini, Codex/ChatGPT) as work continues across sessions and tools. Read this file FIRST, before PLAN.md, before touching any code — it tells you exactly what exists, what's approved, and what to do next. Update it every time you complete or start a unit of work, regardless of which AI you are.

**Repo:** https://github.com/pr4peace/good-earth-investment-platform (private)
**Owner:** Prashanth (GoodEarth)
**Spec:** [PLAN.md](PLAN.md) — the full product/architecture spec. Read this second, for context on the system you're building.

---

## How to pick this up in a new AI / new session

1. `git pull` / `git log --oneline --all` to see the true current state — this file is a summary, git is the source of truth if they ever disagree.
2. Read the "Current State" section below to see what branch you're on and what's merged vs. in-progress.
3. If there's an "In Progress" plan below, open its file under `docs/superpowers/plans/` and find the last unchecked `- [ ]` step — that's where to resume.
4. If starting a new subsystem, write a new plan file under `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` (follow the format of the existing ones — file structure, numbered tasks, TDD steps with real code, no placeholders) before writing implementation code.
5. Local dev database: PostgreSQL 16 via Homebrew (`brew services start postgresql@16`), databases `investment_platform` (dev) and `investment_platform_test` (test), both owned by OS user `prashanthpalanisamy`, no password (trust auth). A `.env` file (gitignored) must exist locally with `DATABASE_URL` / `TEST_DATABASE_URL` pointing at these — see `.env.example` for the shape.
6. Run tests with `NODE_ENV=test npm test`. Run migrations with `npm run migrate`.
7. Update this file's "Current State" and "Log" sections before you stop working, so the next AI/session isn't guessing.

---

## Current State

- **Stable branch:** `main` — foundation scaffold + Google OAuth/RBAC merged, tests green (20 tests, 7 suites), pushed to GitHub. Latest commit: `6e87231`.
- **In-progress branch:** none — `feature/google-oauth-rbac` merged and can be deleted locally/remotely once confirmed no longer needed.
- **Local Postgres:** installed & running (see step 5 above).
- **Auth is live but has no consumers yet:** `authenticate`/`requireRole` (from `src/auth/middleware.js`) exist and are tested, but no agreement/payout/calendar routes exist yet to protect with them. The next subsystem plan should import and use these by name rather than reinventing auth.
- **Bootstrapping note:** there are no `admin`-role users in a fresh DB. The very first Admin must be set manually via SQL: `UPDATE users SET role = 'admin' WHERE email = '...'` (that user must sign in via `/auth/google` at least once first, so their row exists).

### Completed

| Plan | Branch | Status |
|---|---|---|
| [Foundation Scaffold](docs/superpowers/plans/2026-08-20-foundation-scaffold.md) | merged to `main` | ✅ Express skeleton, Postgres pool, migrations for `agreements`/`payouts`/`calendar_events`/`audit_trail`, `/health` + `/health/db` endpoints. All 4 tasks reviewed and approved (1 fix round on Task 3 — transaction bug + `calendar_events.id`→`event_id` rename). Final whole-branch review approved after 2 more small fixes (pool error handler, DB health-check error logging). |
| [Google OAuth + RBAC](docs/superpowers/plans/2026-08-20-google-oauth-rbac.md) | merged to `main` (was `feature/google-oauth-rbac`) | ✅ `users` table + migration, JWT sign/verify (`src/auth/jwt.js`), Google ID token verification (`src/auth/googleVerify.js`), `POST /auth/google` (atomic upsert, preserves role, syncs name/email) + `GET /auth/me`, `authenticate`/`requireRole` middleware (`src/auth/middleware.js`) re-fetches role from DB every request — not trusted from the JWT claim — so a role change or revocation takes effect immediately, `PATCH /users/:id/role` (admin-only). Global async error boundary added (`src/utils/asyncHandler.js` + `src/app.js`'s trailing error middleware) so a DB failure returns a clean 500 instead of hanging/crashing. One fix round mid-plan (extracted shared `extractBearerToken` helper) and one fix round on final review (async error boundary + atomic upsert to close a signup race condition). Merge commit: `6e87231`. |

### Not Started (per PLAN.md's Phase 1 roadmap)

- Agreement creation form (KYC + investment terms, backend route + validation) — should be protected with `authenticate` + `requireRole('investment_manager', 'admin')` per PLAN.md's permissions table
- Payout schedule generator (Gemini-coded per PLAN.md's multi-AI orchestration section, Codex-verified — flat 10% TDS default with per-agreement override, weekend payout dates shift to preceding Friday)
- PDF agreement document generation (decided: generate immediately in Phase 1, not deferred — see PLAN.md's "Open Questions — RESOLVED" section)
- In-app calendar + calendar event creation/storage
- Email notification system (SendGrid, daily 9 AM IST cron)
- Role-based dashboards
- Audit trail logging + timeline UI
- Test suite for edge cases (leap years, partial months, TDS correctness, weekend-shift dates, PDF rendering)

---

## Key Decisions Already Made (do not re-litigate — see PLAN.md for full detail)

1. **TDS rate:** Flat 10% default, overridable per agreement via `tds_rate_override` column.
2. **Weekend payouts:** Shift to the preceding Friday.
3. **Agreement document format:** Generate a PDF immediately in Phase 1 (not deferred to Phase 2).
4. **Role assignment:** Manual admin assignment only (no self-select, no email-domain auto-detect). First Admin in a fresh deployment must be set via direct SQL (`UPDATE users SET role = 'admin' WHERE email = '...'`) since there's no bootstrapping route.
5. **Roles:** exactly `admin`, `investment_manager`, `salesperson`, `accounts_team` (stored lower-snake-case).
6. **No ORM** — raw SQL via `pg` throughout.
7. **Schema field names must match PLAN.md's data model exactly** (this has already caused one bug — see Log below — check field names against PLAN.md before introducing new columns).

---

## Working Conventions (for whichever AI is driving)

- Plans live in `docs/superpowers/plans/`, one file per subsystem, written before implementation (TDD steps with real code, no placeholders — see existing plans for the exact format expected).
- `main` is the stable branch. New work happens on a `feature/*` branch off `main`, merged back via PR (or direct merge if working solo) once tests pass and a review has happened.
- Every task: write failing test → confirm it fails → minimal implementation → confirm it passes → commit. Don't skip the "confirm it fails" step — it's what catches a test that can't actually fail.
- Before merging a feature branch: run the full suite (`NODE_ENV=test npm test`), and do at least a self-review pass against the plan's Global Constraints section.
- Commit messages: conventional-ish (`feat:`, `fix:`, `chore:`, `docs:`), one logical change per commit.
- Don't invent scope. If PLAN.md or a plan file doesn't say to do something, don't do it — flag it as an open question in this file's "Open Questions for Prashanth" section instead.

---

## Open Questions for Prashanth

*(none currently — all Phase 1 "Immediate" questions from PLAN.md were resolved on 2026-08-20; see "Key Decisions Already Made" above)*

---

## Log

Newest entries at the top. One entry per work session, regardless of which AI did the work — note which AI/tool in each entry.

- **2026-08-20 (Claude Code):** Implemented the Google OAuth + RBAC plan in full (4 tasks, subagent-driven development) and merged to `main` (`6e87231`). Two fix rounds along the way: (1) extracted a shared `extractBearerToken` helper mid-plan so the route and the middleware didn't duplicate Bearer-parsing logic; (2) on final whole-branch review, added an async error boundary (`asyncHandler` + global Express error middleware) and replaced a SELECT-then-INSERT login upsert with an atomic `INSERT ... ON CONFLICT` to close a signup race condition. One implementer subagent died mid-task to a connection error partway through the second fix round — resumed cleanly from the uncommitted working-tree state rather than restarting, no lost work. Deferred (not fixed, judged acceptable for Phase 1): JWT_SECRET not fail-fast at boot, no defensive check on empty Google payload, `extractBearerToken` tolerant of malformed multi-part headers, and a rare edge case where two different Google accounts sharing an email would collide on the `users.email` UNIQUE constraint during the upsert (surfaces as a 500, arguably should be 409 — flag if it ever actually happens).
- **2026-08-20 (Claude Code):** Wrote the Google OAuth + RBAC plan (`docs/superpowers/plans/2026-08-20-google-oauth-rbac.md`), created `feature/google-oauth-rbac` branch off `main`. Not yet implemented. Created this PROGRESS.md file for cross-AI handoff.
- **2026-08-20 (Claude Code):** Created private GitHub repo `pr4peace/good-earth-investment-platform`, pushed `main`.
- **2026-08-20 (Claude Code):** Implemented and merged the Foundation Scaffold plan (4 tasks, subagent-driven development, 2 review-fix rounds). Installed local Postgres 16 via Homebrew for dev since neither Docker nor an existing Postgres install was available.
- **2026-08-20 (Claude Code):** Resolved 4 of PLAN.md's "Immediate" open questions with Prashanth (TDS rate, weekend payouts, document format, role assignment) and updated PLAN.md in place.
- **2026-08-20 (Claude Code):** Initial PLAN.md authored (pre-existing at session start).
