# DiveOps MVP - Fixes Applied

## Summary of Issues Found & Fixed

### Issue 1: App Wouldn't Start - Missing OpenAI API Key
**Root Cause:** The OpenAI client in `server/ai-drafting.ts` is initialized at module load time with `new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY })`. The production build (`npm start`) runs `NODE_ENV=production node dist/index.cjs` which does NOT auto-load `.env` files.

**Fix:** Run the app with environment variables explicitly exported:
```bash
export $(grep -v '^#' .env | xargs) && NODE_ENV=development PORT=3000 node dist/index.cjs
```

---

### Issue 2: Login Failed - Missing `table.sql` for Session Store
**Root Cause:** The app uses `connect-pg-simple` for PostgreSQL session storage with `createTableIfMissing: true`. The built `dist/index.cjs` looks for `table.sql` at `dist/table.sql` (relative to `__dirname`), but the build process doesn't copy this file from `node_modules/connect-pg-simple/`.

**Error:** `ENOENT: no such file or directory, open '/workspace/DiveOps-MVP/dist/table.sql'`

**Fix:** Copy the file after each build:
```bash
cp node_modules/connect-pg-simple/table.sql dist/table.sql
```

---

### Issue 3: Session Cookie Not Sent - `secure: true` Hardcoded in Build
**Root Cause:** The session cookie configuration uses `secure: process.env.NODE_ENV === "production"`. During the Vite build, this expression is evaluated at build time and inlined as `secure: true` (hardcoded). This means the cookie is always set as `secure: true`, requiring HTTPS. Over HTTP (localhost), browsers/curl won't send secure cookies.

**Fix:** Patch the built `dist/index.cjs` after each build:
```bash
sed -i 's/saveUninitialized:!1,cookie:{maxAge:1e3\*60\*60\*24\*7,httpOnly:!0,secure:!0}/saveUninitialized:!1,cookie:{maxAge:1e3*60*60*24*7,httpOnly:!0,secure:!1}/g' dist/index.cjs
```

**Permanent Fix (recommended):** In `server/index.ts`, change:
```typescript
secure: process.env.NODE_ENV === "production",
```
To:
```typescript
secure: process.env.COOKIE_SECURE === "true",
```
Then set `COOKIE_SECURE=true` in production environment variables.

---

### Issue 4: Login Only Accepted Username, Not Email
**Root Cause:** The `getUserByUsername()` method in `server/storage.ts` only queried by `username` field, not `email`. Users trying to log in with their email address (`spittman@precisionsubsea.com`) would get "Invalid username or password".

**Fix Applied:** Updated `server/storage.ts` to fall back to email lookup:
```typescript
async getUserByUsername(username: string): Promise<User | undefined> {
  // Support login by username OR email
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (user) return user;
  // Try email lookup
  const [userByEmail] = await db.select().from(schema.users).where(eq(schema.users.email, username));
  return userByEmail;
}
```

---

### Issue 5: Database Not Seeded / No Users
**Root Cause:** The `/api/seed` endpoint is blocked in production (`NODE_ENV === "production"`). The database was empty with no users.

**Fix:** Used the `/api/setup/init` endpoint (works when `userCount === 0`) to create the initial GOD user:
```bash
curl -X POST http://localhost:3000/api/setup/init \
  -H "Content-Type: application/json" \
  -d '{
    "username": "spittman",
    "password": "Inlanddiver9954!",
    "fullName": "S Pittman",
    "initials": "SP",
    "email": "spittman@precisionsubsea.com"
  }'
```

---

## Login Credentials (Local)

| Field | Value |
|-------|-------|
| Email | spittman@precisionsubsea.com |
| Username | spittman |
| Password | Inlanddiver9954! |
| Role | GOD (full access) |

---

## Azure Deployment Fixes Needed

For the deployed Azure version, the following environment variables must be set correctly:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | Must be set - app exits if missing in production |
| `OPENWEATHER_API_KEY` | ✅ | For weather features |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | ✅ | OpenAI API key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Optional | Defaults to OpenAI API |
| `COOKIE_SECURE` | Recommended | Set to `true` for HTTPS deployments |

**Critical:** The `SESSION_SECRET` must be set in Azure App Service environment variables, or the app will exit with a fatal error.

**Database Initialization:** If the Azure database is empty, POST to `/api/setup/init` with the admin user details.

---

## Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up PostgreSQL
sudo -u postgres createuser -P diveops  # password: diveops123
sudo -u postgres createdb -O diveops diveops
sudo -u postgres psql -c "GRANT ALL ON SCHEMA public TO diveops;"

# 3. Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://diveops:diveops123@localhost:5432/diveops
SESSION_SECRET=your-secret-key-here-minimum-32-chars
OPENWEATHER_API_KEY=your-key-here
AI_INTEGRATIONS_OPENAI_API_KEY=sk-your-key-here
NODE_ENV=development
PORT=3000
EOF

# 4. Push database schema
npm run db:push

# 5. Build
npm run build

# 6. Start (using the fix script)
./start-local.sh
```