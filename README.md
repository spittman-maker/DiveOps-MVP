<p align="center">
<img src="https://raw.githubusercontent.com/spittman-maker/DiveOps-MVP/main/docs/assets/diveops-banner.png" alt="DiveOps Banner" width="900"/>
</p>

<h1 align="center">DiveOps</h1>

<p align="center">
<strong>Operational Command Platform for Commercial Diving Teams</strong>
</p>

<p align="center">
DiveOps transforms dive operations into a <strong>real-time digital command center for subsea workforces.</strong>
</p>

<p align="center">

![Node](https://img.shields.io/badge/node-20+-green)
![React](https://img.shields.io/badge/react-19-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)
![Postgres](https://img.shields.io/badge/postgres-15+-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![License](https://img.shields.io/badge/license-MIT-black)

</p>

---

# Why DiveOps Exists

Commercial diving operations operate in **high-risk, coordination-heavy environments** where operational clarity directly impacts safety and mission success.

Most dive teams still rely on:

* spreadsheets
* whiteboards
* paper dive logs
* disconnected tools

These workflows create serious problems:

* fragmented operational awareness
* lost operational history
* difficult compliance reporting
* limited decision support
* poor equipment traceability

DiveOps replaces these with a **centralized digital operational backbone for subsea teams.**

The long-term vision is to build the **operating system for subsea operations worldwide.**

---

# Platform Overview

<table>
<tr>
<td width="33%">

### Operations Management

Plan and coordinate dive missions with full operational visibility.

• mission planning
• team assignment
• vessel coordination
• operational dashboards

</td>
<td width="33%">

### Personnel Management

Track diver readiness and certifications.

• diver profiles
• medical clearance tracking
• crew availability
• certification verification

</td>
<td width="33%">

### Equipment Management

Maintain full equipment lifecycle visibility.

• inventory tracking
• mission assignments
• maintenance tracking
• readiness status

</td>
</tr>

<tr>
<td width="33%">

### Environmental Intelligence

Operational awareness powered by live weather data.

• forecasts
• dive conditions
• environmental planning

</td>
<td width="33%">

### Operational Reporting

Generate structured operational records.

• dive logs
• mission reports
• equipment usage summaries

</td>
<td width="33%">

### AI Operational Assistant

AI-powered support for operations teams.

• report summarization
• operational insights
• documentation assistance

</td>
</tr>
</table>

---

# System Context

```mermaid
flowchart LR
diver[Diver]
supervisor[Dive Supervisor]
admin[Operations Admin]

platform[DiveOps Platform]

weather[Weather API]
ai[AI Services]

diver --> platform
supervisor --> platform
admin --> platform

platform --> weather
platform --> ai
```

---

# Container Architecture

```mermaid
flowchart TB
user[Operations User]

web[Web Client<br>React + Vite]

api[API Server<br>Node + Express]

db[(PostgreSQL Database)]

cache[(Redis Cache)]

user --> web
web --> api
api --> db
api --> cache
```

---

# Component Architecture

```mermaid
flowchart LR
api[API Server]

auth[Auth Module]
ops[Operations Module]
equipment[Equipment Module]
personnel[Personnel Module]
reports[Reporting Module]

db[(Database)]

api --> auth
api --> ops
api --> equipment
api --> personnel
api --> reports

auth --> db
ops --> db
equipment --> db
personnel --> db
reports --> db
```

---

# Deployment Architecture

```mermaid
flowchart TB
users[Users]

cdn[CDN / Edge]

web[Web Client]

apiCluster[API Server Cluster]

postgres[(PostgreSQL)]

redis[(Redis Cache)]

weather[Weather API]

ai[OpenAI API]

users --> cdn
cdn --> web
web --> apiCluster

apiCluster --> postgres
apiCluster --> redis

apiCluster --> weather
apiCluster --> ai
```

---

# Observability Stack

DiveOps includes a **production-grade monitoring stack**.

| Component      | Tool               |
| -------------- | ------------------ |
| Logging        | Pino               |
| Metrics        | Prometheus         |
| Visualization  | Grafana            |
| Error Tracking | Sentry             |
| Health Checks  | Express middleware |

Operational endpoints

```
/metrics
/healthz
```

---

# Database Model

```mermaid
erDiagram

USERS ||--o{ OPERATIONS : manages
USERS ||--o{ DIVERS : profile

OPERATIONS ||--o{ DIVE_TEAMS : contains
OPERATIONS ||--o{ EQUIPMENT_ASSIGNMENTS : requires

DIVERS ||--o{ CERTIFICATIONS : holds

EQUIPMENT ||--o{ EQUIPMENT_ASSIGNMENTS : used_in
EQUIPMENT ||--o{ MAINTENANCE_LOGS : tracked_by

OPERATIONS ||--o{ REPORTS : generates
```

---

# API Documentation

Base URL

```
/api
```

### Authentication

```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
```

### Divers

```
GET /api/divers
POST /api/divers
GET /api/divers/:id
PUT /api/divers/:id
```

### Equipment

```
GET /api/equipment
POST /api/equipment
PUT /api/equipment/:id
```

### Operations

```
GET /api/operations
POST /api/operations
GET /api/operations/:id
PUT /api/operations/:id
```

### Weather

```
GET /api/weather/current
GET /api/weather/forecast
```

---

# Reliability Architecture

```mermaid
flowchart TB
users[Operators]

web[Web Client]

api[API Cluster]

primary[(Primary Database)]

replica[(Read Replica)]

cache[(Redis Cache)]

users --> web
web --> api

api --> primary
primary --> replica

api --> cache
```

Key reliability features

* stateless API services
* database replication
* container orchestration
* caching layer

---

# Scalability Model

```mermaid
flowchart LR
Users --> LoadBalancer

LoadBalancer --> API1
LoadBalancer --> API2
LoadBalancer --> API3

API1 --> DB
API2 --> DB
API3 --> DB
```

| Layer    | Strategy           |
| -------- | ------------------ |
| Web      | CDN distribution   |
| API      | horizontal scaling |
| Database | read replicas      |
| Caching  | Redis cluster      |

---

# Security Model

DiveOps includes multiple security layers.

### Authentication

* session authentication
* role-based access control

### Data Protection

* TLS encryption
* encrypted secrets

### Operational Security

* audit logging
* access control policies

---

# System Design Deep Dive

## Request Lifecycle

```mermaid
flowchart LR
Client --> API

API --> Auth

Auth --> Services

Services --> DB

Services --> External

External --> Services

Services --> API

API --> Client
```

---

## Operational Event Flow

```mermaid
flowchart TB
Mission[Create Dive Mission]

Team[Assign Dive Team]

Equipment[Assign Equipment]

Weather[Check Conditions]

Execution[Execute Operation]

Report[Generate Report]

Mission --> Team
Team --> Equipment
Equipment --> Weather
Weather --> Execution
Execution --> Report
```

---

# Development

Clone repository

```
git clone https://github.com/spittman-maker/DiveOps-MVP.git
cd DiveOps-MVP
```

Install dependencies

```
npm install
```

Create environment file

```
cp .env.example .env
```

Run development servers

```
npm run dev
npm run dev:client
```

Application runs at

```
http://localhost:5000
```

---

# Testing

Run tests

```
npm run test
```

Run coverage

```
npm run test:coverage
```

---

# Deployment

Docker example

```
docker build -t diveops .
docker run -p 5000:5000 diveops
```

Supported environments

* Docker
* AWS ECS
* Kubernetes
* VPS

---

# Roadmap

Planned platform expansions

* mobile dive operations app
* dive computer integrations
* fleet management
* predictive equipment maintenance
* regulatory compliance automation
* AI operational copilots
* subsea analytics

---

# Organization

**Precision Subsea Group LLC**

Commercial diving technology platform.

---

# License

MIT
Patent Pending 
Trademark
