# DiveOps MVP — Fixes Applied

## Issue #1: Missing OpenAI API Key (App Crash on Start)
**Status:** ✅ RESOLVED  
**Root Cause:** The `server/ai-drafting.ts` module initializes the OpenAI client at module load time. If `OPENAI_API_KEY` is missing, the app crashes immediately with `Missing credentials. Please pass an apiKey`.  
**Fix:** Added `OPENAI_API_KEY` environment variable to the Azure Container App.

## Issue #2: Missing `table.sql` for Session Store
**Status:** ✅ RESOLVED  
**Root Cause:** `connect-pg-simple` needs `table.sql` to create the session table. The Dockerfile's multi-stage build didn't copy this file to the `dist/` directory.  
**Fix:** Added `RUN cp node_modules/connect-pg-simple/table.sql dist/table.sql` to the Dockerfile builder stage.

## Issue #3: Session Cookie Not Being Set (Login Broken in Production)
**Status:** ✅ RESOLVED  
**Root Cause:** Three compounding issues:
1. **esbuild inlines `process.env.NODE_ENV`** — The build script uses `define: { "process.env.NODE_ENV": '"production"' }`, which causes `secure: process.env.NODE_ENV === "production"` to become `secure: true` (hardcoded) in the compiled output.
2. **Missing `trust proxy`** — Azure Container Apps terminates TLS at the load balancer and forwards HTTP to the container. Without `app.set("trust proxy", 1)`, Express doesn't recognize the connection as HTTPS and refuses to set `secure` cookies.
3. **CI/CD not creating new revisions** — The GitHub Actions workflow used the `latest` tag for Docker images. Azure Container Apps doesn't create a new revision when the image tag is unchanged, so code changes weren't being deployed.

**Fixes Applied:**
- Added `app.set("trust proxy", 1)` to `server/index.ts` before session middleware
- Added `sameSite: "lax"` to cookie config for cross-site compatibility
- Added explicit `req.session.save()` in login route for reliable cookie setting
- Added `COOKIE_SECURE` env var override (set `COOKIE_SECURE=false` to disable secure cookies if needed)
- Added session store error event listener for debugging
- Fixed CI/CD workflow to use git SHA-based image tags to force new revisions on every deploy

## Issue #4: Login Only Accepted Username, Not Email
**Status:** ✅ RESOLVED (previously fixed)  
**Root Cause:** `getUserByUsername()` only matched on the `username` column.  
**Fix:** Updated `storage.ts` to also check the `email` column, allowing login with either username or email.

## Issue #5: No Users in Production Database
**Status:** ✅ RESOLVED  
**Root Cause:** The `/api/seed` endpoint is blocked in production. The `/api/setup/init` endpoint only works when `userCount === 0`. The `/api/auth/register` only creates DIVER users.  
**Fix:** Added a secure `/api/bootstrap` endpoint protected by `BOOTSTRAP_SECRET` environment variable. Used it to:
- Create GOD user: `spittman` (login with `spittman@precisionsubsea.com`)
- Create SUPERVISOR user: `supervisor`
- Existing DIVER users: `diver2`, `goduser`, `testuser`, `testuser2`
The `BOOTSTRAP_SECRET` env var has been removed after setup, disabling the endpoint.

## Issue #6: CI/CD Pipeline
**Status:** ✅ RESOLVED  
**Root Cause:** No CI/CD pipeline existed.  
**Fix:** Created `.github/workflows/deploy.yml` that:
- Triggers on push to `main` branch or manual dispatch
- Builds Docker image and pushes to Azure Container Registry (ACR)
- Uses git SHA-based tags to ensure new revisions are created
- Updates Azure Container App with the new image

## Environment Configuration (Azure Container App)
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Session encryption secret
- `NODE_ENV=production`
- `PORT=5000`
- `OPENAI_API_KEY` — OpenAI API key
- `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY`, `AZURE_STORAGE_CONTAINER` — Blob storage
- `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_ADMIN_KEY` — Azure AI Search

## Users in Production
| Username | Role | Login With |
|----------|------|------------|
| spittman | GOD | `spittman@precisionsubsea.com` / `Whisky9954!` |
| supervisor | SUPERVISOR | `supervisor` / `supervisor123` |
| diver2 | DIVER | `diver2` / `diver123` |

## Remaining Items
- [x] `OPENAI_API_KEY` is now the canonical env var for OpenAI (AI_INTEGRATIONS_OPENAI_API_KEY removed)
- [ ] Create a real project and test dive logging end-to-end
- [ ] Consider removing the `/api/bootstrap` endpoint code after initial setup is complete