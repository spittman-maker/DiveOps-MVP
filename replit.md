# DiveOps™ - Subsea Operations Management System

## Overview
DiveOps™ is an enterprise-grade dive operations management system for Precision Subsea Group LLC, designed to provide command and control for subsea diving operations. It includes real-time logging, dive tracking, safety incident management, and AI-assisted documentation. The project aims to enhance operational efficiency, ensure compliance with safety standards (specifically U.S. Navy Dive Manual), and leverage AI for intelligent assistance in documentation and operational support. It follows a full-stack TypeScript architecture with a React frontend, Express backend, PostgreSQL database, and integrates OpenAI for advanced AI capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
- **Full-stack TypeScript**: Ensures type safety across frontend and backend.
- **RESTful API**: Standardized communication between client and server.
- **Role-Based Access Control**: Four-tier hierarchy (GOD, ADMIN, SUPERVISOR, DIVER) for secure operations.
- **Compliance Framework**: Strict adherence to U.S. Navy Dive Manual standards for dive planning and safety, with four parallel controlled records for auditing.
- **AI Integration**: Leverages OpenAI for intelligent assistance without compromising safety-critical calculations.

### Frontend
- **Framework**: React 19 with TypeScript.
- **UI/UX**: shadcn/ui components (Radix UI) styled with Tailwind CSS v4, featuring a navy-themed design.
- **State Management**: TanStack React Query v5 for server state.
- **Routing**: Wouter.
- **Data Visualization**: Recharts.
- **Layout**: react-grid-layout for dashboards, react-resizable-panels for split views.
- **Animations**: Framer Motion.

### Backend
- **Runtime**: Node.js with Express 5.
- **Authentication**: Passport.js with local strategy and express-session.
- **Document Export**: Generates compliance documents in Word (docx) and Excel (exceljs) formats.

### Data Layer
- **Database**: PostgreSQL (Neon-backed).
- **ORM**: Drizzle ORM with `snake_case` mapping.
- **Schema**: Defined in `shared/schema.ts`, shared between frontend and backend.

### AI Integration
- **Provider**: OpenAI (gpt-5.2) via Replit AI Integrations.
- **Features**: Log event classification, AI-drafted log lines, chat assistance, voice transcription, text-to-speech, image generation, batch LLM processing.
- **Safety Criticality**: AI is strictly prohibited from inferring or calculating any dive table or decompression data; it may only quote verbatim from the U.S. Navy Dive Manual when dive table information is requested.

### Key Features and Domain Concepts
- **Projects & Days**: Manages dive operation contracts and daily operational periods.
- **Log Events & Dives**: Records timestamped operational entries and individual dive records, including detailed PSG-LOG-01 fields.
- **Risk Register**: Tracks cumulative safety and operational risks with unique RISK-YYYYMMDD-### IDs (locked, tracked by reference only per SOP Phase 3).
- **Client Directive Register**: Logs verbatim client instructions with CD-### IDs, with automatic CONFLICTING DIRECTION / REVERSED DIRECTION tagging per SOP Phase 1.
- **QC Closeout (Phase 4)**: Mandatory closeout form before day close — captures scope/documentation status, SEI advisories, standing risks, deviations, outstanding issues, and planned next-shift work. Data persisted in `days.closeout_data` JSONB.
- **Compliance Records**: Maintains distinct Risk Register, Daily Field/Supervisor Log, ADCI-Compliant Dive Log, and Client Directive Register, ensuring no data invention or unauthorized risk closure.
- **24-Hour Rolling Log**: Operational day runs 0600–0600; night work after midnight logged under prior operational day.
- **PSG-TPL-0001 Export**: Daily Shift Log export follows standardized template with Header, Team & Manning, Rolling Event Log, Deviations, End-of-Shift Closeout, SEI Advisories, Standing Risks, and Sign-off blocks.
- **Cross-Tab Data Flow**: Utilizes TanStack React Query for real-time synchronization of data across different application tabs.
- **Dive Extraction**: Automatically creates dive records from log entries, preserving raw text and handling diver identification.
- **Library & Document Management**: Supports storage of reference documents and exporting daily logs, dive records, and compliance documents.

## External Dependencies

### Database
- **PostgreSQL**: Primary data storage, configured via `DATABASE_URL`.

### AI Services
- **OpenAI API**: Integrated for various AI functionalities through Replit AI Integrations.
  - Environment Variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`.

### Environment Variables
- `DATABASE_URL`
- `SESSION_SECRET`
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `OPENWEATHER_API_KEY` (for weather data)

### Session Storage
- **memorystore**: In-memory session storage.

### Key NPM Packages
- **drizzle-orm**, **drizzle-kit**: ORM and migrations.
- **@tanstack/react-query**: Async state management.
- **passport**, **passport-local**: Authentication.
- **zod**, **drizzle-zod**: Schema validation.
- **date-fns**: Date utilities.
- **react-grid-layout**, **react-resizable-panels**: UI layout.
- **recharts**: Charting.
- **framer-motion**: Animations.
- **docx**, **exceljs**: Document generation.
- **openai**: OpenAI SDK.