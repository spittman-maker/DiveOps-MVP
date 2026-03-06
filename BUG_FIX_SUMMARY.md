# DiveOps-MVP Bug Fix Summary

**Commit:** `2447d6d` on `main`
**Date:** March 6, 2026
**Files Changed:** 14 files, +1149 / -641 lines

---

## Critical Bugs Fixed (1-7)

| Bug # | Issue | Root Cause | Fix |
|-------|-------|-----------|-----|
| 1 | "Failed to create new day" red error on New Shift | Day creation route lacked try/catch error handling; errors returned as 500 without message | Added try/catch with descriptive error messages; client shows server error in toast |
| 2 | "Reopen Shift" button does nothing | Reopen route lacked try/catch; errors silently failed | Added try/catch with proper error handling; client shows disabled state during mutation |
| 3 | SOPs cannot be deleted or deactivated | Client mutations lacked error handling; failures were silent | Added onError handlers with toast messages to all SOP mutations (create, update, delete) |
| 4 | Facility tab won't let you add | Server required lat/lng but form didn't send them | Server defaults lat/lng to "0" if not provided; form auto-populates from browser geolocation |
| 5 | Cannot create new user | registerSchema required min 6 char password; admin form sent shorter | Created `adminCreateUserSchema` with min 1 char password for admin-created users |
| 6 | Cannot create new project | No validation or error messages on failure | Added name validation, proper error messages, and onError toast handlers |
| 7 | DiveOps Assistant chat non-functional | Model `gpt-4o-mini` not available via proxy; conversation creation could fail silently | Changed model to `gpt-4.1-mini`; added auto-create conversation on first message; improved error handling |

## Data/Logic Fixes (8-15)

| Bug # | Issue | Root Cause | Fix |
|-------|-------|-----------|-----|
| 8 | Lat/Long and Timezone require manual entry | No auto-population from browser | Added `navigator.geolocation` API call on admin tab mount; auto-fills lat, lng, timezone |
| 9 | 6-6 / 24-hour schedule constraint | Hardcoded `0600-0559` window in structured-processor.ts | Changed to dynamic window based on actual event times (earliest event to +24h) |
| 10 | Dive operations not editable / no propagation | Dive PATCH didn't invalidate master-log queries | Added master-log query invalidation on dive updates; auto-recompute dive table on depth/time changes |
| 11 | Risk register logic wrong | All risks hardcoded as `'med'` level | Added per-rule `riskLevel` to RISK_RULES (high for equipment failure/weather, med for operational, low for procedural) |
| 12 | Names inconsistent in dive logs | Query invalidation too narrow on name changes | Broadened query invalidation to include dives, master-log, and dive-logs on any dive update |
| 13 | Reach Surface showing same time for multiple divers | `updateDiveTimes` overwrote existing times | Changed to only update time fields that are not already set (null/undefined check) |
| 14 | Table Used showing "-" for dives with depth data | `autoComputeDiveTable` returned early if tableUsed already set | Removed early return; always recomputes when depth and bottom time are available |
| 15 | Reach Bottom / Leave Bottom missing | `extractData` didn't parse combined dive event strings | Improved regex parsing to handle "L/S 0830 R/B 0835" combined formats; added fallback patterns |

## Feature Fixes (16-22)

| Bug # | Issue | Root Cause | Fix |
|-------|-------|-----------|-----|
| 16 | Raw notes preview truncated | ScrollArea had `max-h-[60vh]` constraint | Changed to `max-h-[80vh]` with `max-h-[92vh]` on dialog; full content rendering |
| 17 | Daily log preview truncated | Same ScrollArea constraint | Same fix applied to daily log preview dialog |
| 18 | Reference docs not clickable | Static list with no click handler | Added `selectedRefDoc` state, click handler on each doc, and full document viewer dialog with content for each reference |
| 19 | Master log not narrative format | Table-based layout, no narrative sections | Complete rewrite with 8 narrative sections: Day Shift Operations, Email Coordination, Night Shift Operations, Dive Station Logs, Notes, QC Closeout, SEI Advisories, Standing Risks |
| 20 | Dashboard missing equipment cert tracking | Widget existed but not in default layout | Added `equipment_certs` widget to default dashboard layout; widget shows 8 equipment items with expiry status |
| 21 | Dashboard missing diver cert tracking | Widget existed but not in default layout | Added `diver_certs` widget to default dashboard layout; widget shows medical and dive cert expiry per diver |
| 22 | PTT transcription not working | Audio client used proxy URL that doesn't support transcription endpoint | Added direct OpenAI client for audio; fallback from `gpt-4o-mini-transcribe` to `whisper-1` |

## Test Results

- **Unit tests:** 185/185 passing
- **Integration tests (routes):** 35/35 passing
- **Integration/functional tests (DB-dependent):** Require running PostgreSQL (expected to fail in CI without DB)

## Files Modified

| File | Changes |
|------|---------|
| `server/routes.ts` | Day creation, reopen, project creation, facility creation, user creation, risk level, dive table, dashboard layout, chat model |
| `server/storage.ts` | `updateDiveTimes` conditional field updates |
| `server/extraction.ts` | Improved dive event parsing for L/S, R/B, L/B, R/S |
| `server/logging/log_pipeline_guard.ts` | Risk rules with per-rule risk levels |
| `server/logging/structured-processor.ts` | Dynamic day window instead of hardcoded 0600-0559 |
| `server/replit_integrations/audio/client.ts` | Direct OpenAI client for audio, whisper-1 fallback |
| `client/src/components/chat-assistant.tsx` | Auto-create conversation, improved input handling |
| `client/src/components/tabs/admin.tsx` | Geolocation auto-populate, error handling on all mutations |
| `client/src/components/tabs/daily-log.tsx` | Mutation error handling, PTT SSE parsing fix |
| `client/src/components/tabs/dashboard.tsx` | DiverCertsWidget and EquipmentCertsWidget with tracking fields |
| `client/src/components/tabs/dive-logs.tsx` | Broader query invalidation for name/dive changes |
| `client/src/components/tabs/library.tsx` | Reference doc viewer dialog, full preview without truncation |
| `client/src/components/tabs/master-log.tsx` | Complete rewrite with narrative 24-hour format |
| `tests/unit/document-export.test.ts` | Fixed timezone-sensitive date test |
