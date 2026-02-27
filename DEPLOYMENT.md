# DiveOps™ — Deployment Guide

This guide covers deploying DiveOps outside of Replit.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ database
- OpenAI API key
- OpenWeather API key

## Environment Variables

Create a `.env` file or configure these in your hosting platform:

```
DATABASE_URL=postgresql://user:password@host:5432/diveops
SESSION_SECRET=your-random-secret-at-least-32-chars
OPENWEATHER_API_KEY=your-openweather-key

# OpenAI — use standard OpenAI URL when not on Replit
AI_INTEGRATIONS_OPENAI_API_KEY=sk-your-openai-key
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

## Option 1: Direct Deploy (VPS, bare metal)

```bash
# Install dependencies
npm ci

# Push database schema
npm run db:push

# Build the app
npm run build

# Start production server
npm start
```

The app runs on port 5000 by default. Put nginx or Caddy in front for HTTPS.

## Option 2: Docker

```bash
# Build the image
docker build -t diveops .

# Run with environment variables
docker run -d \
  --name diveops \
  -p 5000:5000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/diveops" \
  -e SESSION_SECRET="your-secret" \
  -e OPENWEATHER_API_KEY="your-key" \
  -e AI_INTEGRATIONS_OPENAI_API_KEY="sk-your-key" \
  -e AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1" \
  diveops
```

Note: Run `npm run db:push` separately before first launch to create the database tables.

## Option 3: Railway / Render / Fly.io

1. Connect your Git repository
2. Set the environment variables listed above
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add a PostgreSQL addon or use an external database
6. Run `npm run db:push` once to initialize the schema

## Database Setup

The app uses Drizzle ORM. To initialize a fresh database:

```bash
DATABASE_URL="your-connection-string" npm run db:push
```

This creates all tables. The app automatically seeds a default admin account on first run.

## Default Admin Account

On first launch, the app creates:
- Email: `spittman@precisionsubsea.com`
- Password: `Whisky9954!`
- Role: GOD

Change this password immediately after first login.

## Architecture Notes

- Frontend: React SPA served by Express from `/dist`
- Backend: Express API on port 5000
- Database: PostgreSQL with Drizzle ORM
- AI: OpenAI API (GPT models) for log classification, chat, voice
- Weather: OpenWeather API for conditions and lightning monitoring

## Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name diveops.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
