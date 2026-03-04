# DiveOps MVP - Production Fix Plan

## Phase 1: Repository Analysis [x]
- [x] Read all key files and understand architecture
- [x] Identify root causes of session cookie issue

## Phase 2: Fix Session/Login System [x]
- [x] Add `app.set("trust proxy", 1)` to server/index.ts
- [x] Add `sameSite: "lax"` to cookie config
- [x] Add session store error logging
- [x] Add explicit `req.session.save()` in login route
- [x] Fix CI/CD workflow to use unique image tags (force new revisions)
- [x] Deploy and verify Set-Cookie header is present
- [x] Verify full login flow: login → cookie → /api/auth/me

## Phase 3: Create Users & Test App [x]
- [x] Create GOD user (spittman) via bootstrap endpoint
- [x] Create SUPERVISOR user via bootstrap endpoint
- [x] Verify all three roles can log in (GOD, SUPERVISOR, DIVER)
- [x] Verify session persistence across requests
- [x] Verify role-based access control (list users requires ADMIN/GOD)
- [x] Remove BOOTSTRAP_SECRET env var to disable bootstrap endpoint

## Phase 4: Cleanup & Documentation [x]
- [x] Remove excessive debug logging (keep error logging)
- [x] Commit and deploy final clean version
- [x] Update FIXES_APPLIED.md with complete resolution details
- [x] Verify final deployment works end-to-end