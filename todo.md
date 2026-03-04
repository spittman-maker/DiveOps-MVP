# DiveOps MVP - Production Fix Plan

## Phase 1: Repository Analysis [x]
- [x] Read all key files and understand architecture
- [x] Identify root causes of session cookie issue

## Phase 2: Fix Session/Login System
- [x] Add `app.set("trust proxy", 1)` to server/index.ts
- [x] Add `sameSite: "lax"` to cookie config
- [x] Add session store error logging
- [x] Fix CI/CD workflow to use unique image tags (force new revisions)
- [x] Deploy and verify Set-Cookie header is present
- [x] Verify full login flow: login → cookie → /api/auth/me

## Phase 3: Create GOD User & Test App
- [ ] Create a GOD user via /api/setup/init or /api/auth/register
- [ ] Test browser-based login on the live site
- [ ] Test key app features (projects, dives, etc.)

## Phase 4: Cleanup & Documentation
- [ ] Remove excessive debug logging (keep error logging)
- [ ] Commit and deploy final clean version
- [ ] Update FIXES_APPLIED.md with resolution details