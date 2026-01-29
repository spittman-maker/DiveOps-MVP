# DiveOps™ - Subsea Operations Management System

## Overview

DiveOps™ is an enterprise-grade dive operations management system built for Precision Subsea Group LLC. It provides command and control capabilities for subsea diving operations, including real-time logging, dive tracking, safety incident management, and AI-assisted documentation.

The application follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence and OpenAI for AI-powered features like log drafting and chat assistance.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Dives**: Individual dive records with LS/RB/LB/RS timestamps
- **Risk Register**: Safety and operational risk tracking

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