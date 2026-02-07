# DiveOps™ - Subsea Operations Management System

## Overview

DiveOps™ is an enterprise-grade dive operations management system built for Precision Subsea Group LLC. It provides command and control capabilities for subsea diving operations, including real-time logging, dive tracking, safety incident management, and AI-assisted documentation.

The application follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence and OpenAI for AI-powered features like log drafting and chat assistance.

## User Preferences

Preferred communication style: Simple, everyday language.

## CRITICAL SAFETY REQUIREMENTS

### Dive Table and Decompression Data
**ABSOLUTE PROHIBITION**: The AI system must NEVER generalize, calculate, or infer:
- Dive times or bottom times
- Decompression schedules or stops
- Surface intervals
- Repetitive dive calculations
- No-decompression limits
- Any dive table data

All decompression planning follows **U.S. Navy Dive Manual** standards exclusively. The AI may only quote exact input text related to dive planning - no interpretation or calculation is permitted. This is non-negotiable for diver safety.

### When Dive Tables Are Referenced
If dive table information is requested:
1. Quote the U.S. Navy Dive Manual table VERBATIM only
2. Show 3 depths shallower and 3 depths deeper for context
3. NEVER paraphrase or put information "into your own words"
4. NEVER interpret or calculate - quote exactly as written in the manual

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom navy-themed design tokens
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript compiled with tsx
- **Authentication**: Passport.js with local strategy and express-session
- **API Design**: RESTful endpoints under `/api/*` prefix
- **Role-Based Access**: Four-tier hierarchy (GOD, ADMIN, SUPERVISOR, DIVER)

### Data Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with snake_case column mapping
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Drizzle Kit with `db:push` command

### AI Integration
- **Provider**: OpenAI via Replit AI Integrations
- **Features**: 
  - Log event classification and extraction
  - AI-drafted internal canvas and master log lines
  - Chat assistant for operational support
  - Voice transcription and text-to-speech capabilities

### Key Domain Concepts
- **Projects**: Represent dive operation contracts with clients
- **Days**: Daily operational periods within projects (DRAFT, ACTIVE, CLOSED states)
- **LogEvents**: Timestamped operational entries with AI-generated renders
- **Dives**: Individual dive records with LS/RB/LB/RS timestamps and full PSG-LOG-01 fields
  - diverId is nullable; diverDisplayName stores name for unmatched divers
  - PSG-LOG-01 fields: diverBadgeId, station, workLocation, taskSummary, toolsEquipment, installMaterialIds, qcDisposition, verifier, decompRequired, decompMethod, postDiveStatus, photoVideoRefs, supervisorInitials
  - PATCH /api/dives/:id for supervisor field editing
  - POST /api/dives/:id/generate-summary for AI task summary from related log events
- **Risk Register**: Rolling cumulative safety/operational risk tracking (RR-### IDs, project-wide, persists across days)
  - Fields: riskId, source (jha/field_observation/client_directive/equipment_issue), description, affectedTask, initialRiskLevel (low/med/high), residualRisk, status (open/mitigated/closed), owner, mitigation, closureAuthority, linkedDirectiveId
  - Auto-created from client directives, condition changes, deviations, equipment issues
  - API: GET /api/projects/:projectId/risks (rolling), GET /api/days/:dayId/risks (day-scoped), PATCH /api/risks/:id
- **Client Directive Register**: Verbatim client instruction tracking (CD-### IDs)

### Compliance Framework (4 Controlled Records)
The system maintains 4 parallel controlled records per compliance document:
1. **Risk Register** (rolling, cumulative) — RR-### IDs, never reused, persists across days
2. **Daily Field / Supervisor Log** (chronological, timestamped) — no interpretation, no hindsight
3. **ADCI-Compliant Dive Log** (structured) — factual only, cross-references Risk IDs
4. **Client Directive Register** (verbatim) — CD-### IDs, never paraphrased, linked Risk IDs
- Governing rules: never invent data, never summarize client instructions, never close risks without authorization
- Auto-linking: client directives auto-generate linked Risk IDs; Risk IDs referenced across all records
- Terminology: Always use "Client" instead of "JV/OICC"
- AI model: gpt-5.2 across all components

### Dive Extraction
- Name parsing: handles "A.Castro", "Diver B.Murphy", "Zach Meador", 2-letter initials
- Matches to crew roster when possible, falls back to diverDisplayName storage
- Auto-creates dive records from log entries with dive operations (LS/RB/LB/RS)

### Directory Structure
```
client/           # React frontend application
  src/
    components/   # UI components including tab views
    hooks/        # React hooks (auth, project context)
    pages/        # Route page components
    lib/          # Utilities and query client
server/           # Express backend
  replit_integrations/  # AI service modules (chat, audio, image)
shared/           # Shared types and database schema
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable

### AI Services (Replit AI Integrations)
- **OpenAI API**: Accessed via custom base URL and API key
  - Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Used for: Chat completions, log drafting, speech-to-text, text-to-speech, image generation

### Session Storage
- **express-session**: In-memory by default, requires `SESSION_SECRET` environment variable
- **connect-pg-simple**: Available for PostgreSQL session storage

### Key NPM Packages
- **drizzle-orm/drizzle-kit**: Database ORM and migration tooling
- **@tanstack/react-query**: Async state management
- **passport/passport-local**: Authentication
- **zod/drizzle-zod**: Schema validation
- **date-fns**: Date manipulation