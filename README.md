## Platform Engineering

DiveOps includes first-class platform tooling:

- **Generated architecture diagrams** from the codebase
- **Generated database schema visualizations** from Drizzle models
- **OpenAPI-based SDK generation** for TypeScript and Python
- **Production observability stack** with Prometheus + Grafana

### Developer Artifacts

- Architecture docs: `docs/architecture/`
- Database docs: `docs/database/`
- OpenAPI spec: `docs/api/openapi.json`
- SDKs: `sdk/`
- Monitoring: `monitoring/`

![Architecture](https://img.shields.io/badge/architecture-generated-blue)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-green)
![SDKs](https://img.shields.io/badge/SDKs-generated-purple)
![Observability](https://img.shields.io/badge/observability-prometheus%20%2B%20grafana-orange)


DiveOps-MVP/
├── docs/
│   ├── architecture/
│   │   ├── dependency-graph.md
│   │   ├── system-context.md
│   │   ├── containers.md
│   │   └── components.md
│   ├── database/
│   │   ├── schema.md
│   │   └── schema.mmd
│   └── api/
│       ├── openapi.json
│       └── README.md
├── tools/
│   ├── generate-architecture.mjs
│   ├── generate-db-schema.mjs
│   └── postprocess-openapi.mjs
├── sdk/
│   ├── typescript/
│   └── python/
├── monitoring/
│   ├── prometheus.yml
│   ├── grafana/
│   │   ├── provisioning/
│   │   │   ├── datasources/
│   │   │   └── dashboards/
│   │   └── dashboards/
│   └── docker-compose.observability.yml
├── server/
│   ├── docs/
│   │   ├── swagger.ts
│   │   └── openapi-builder.ts
│   └── observability/
│       └── metrics.ts
└── package.json
npm install -D dependency-cruiser
{
  "scripts": {
    "arch:raw": "depcruise --include-only '^server|^client|^shared' --output-type json . > .artifacts/dependency-graph.json",
    "arch:generate": "node tools/generate-architecture.mjs",
    "arch": "npm run arch:raw && npm run arch:generate"
  }
}
import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve(".artifacts/dependency-graph.json");
const outputDir = path.resolve("docs/architecture");

fs.mkdirSync(outputDir, { recursive: true });

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const modules = raw.modules || [];

const normalize = (p) =>
  p
    .replace(process.cwd(), "")
    .replace(/^\.?\//, "")
    .replace(/\\/g, "/");

const include = (name) =>
  name.startsWith("server/") ||
  name.startsWith("client/") ||
  name.startsWith("shared/");

const edges = [];

for (const mod of modules) {
  const from = normalize(mod.source);
  if (!include(from)) continue;

  for (const dep of mod.dependencies || []) {
    const to = normalize(dep.resolved || dep.module || "");
    if (!to || !include(to)) continue;
    edges.push([from, to]);
  }
}

const byTopLevel = (p) => p.split("/")[0];

const uniqueEdges = Array.from(
  new Set(edges.map(([a, b]) => `${a}:::${b}`))
).map((s) => s.split(":::"));

const topLevelEdges = {};
for (const [from, to] of uniqueEdges) {
  const a = byTopLevel(from);
  const b = byTopLevel(to);
  if (a === b) continue;
  const key = `${a}:::${b}`;
  topLevelEdges[key] = [a, b];
}

const mermaidLines = [
  "# Dependency Graph",
  "",
  "```mermaid",
  "flowchart LR"
];

for (const [a, b] of Object.values(topLevelEdges)) {
  mermaidLines.push(`  ${safe(a)} --> ${safe(b)}`);
}

mermaidLines.push("```", "");

fs.writeFileSync(
  path.join(outputDir, "dependency-graph.md"),
  mermaidLines.join("\n")
);

const c4Lines = [
  "# Component View",
  "",
  "```mermaid",
  "flowchart TB",
  "  Client[Client Apps]",
  "  API[API Server]",
  "  Shared[Shared Domain Types]",
  "  DB[(PostgreSQL)]",
  "  External[External Services]",
  "",
  "  Client --> API",
  "  API --> Shared",
  "  API --> DB",
  "  API --> External",
  "```",
  ""
];

fs.writeFileSync(
  path.join(outputDir, "components.md"),
  c4Lines.join("\n")
);

function safe(name) {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}
import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve(".artifacts/dependency-graph.json");
const outputDir = path.resolve("docs/architecture");

fs.mkdirSync(outputDir, { recursive: true });

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const modules = raw.modules || [];

const normalize = (p) =>
  p
    .replace(process.cwd(), "")
    .replace(/^\.?\//, "")
    .replace(/\\/g, "/");

const include = (name) =>
  name.startsWith("server/") ||
  name.startsWith("client/") ||
  name.startsWith("shared/");

const edges = [];

for (const mod of modules) {
  const from = normalize(mod.source);
  if (!include(from)) continue;

  for (const dep of mod.dependencies || []) {
    const to = normalize(dep.resolved || dep.module || "");
    if (!to || !include(to)) continue;
    edges.push([from, to]);
  }
}

const byTopLevel = (p) => p.split("/")[0];

const uniqueEdges = Array.from(
  new Set(edges.map(([a, b]) => `${a}:::${b}`))
).map((s) => s.split(":::"));

const topLevelEdges = {};
for (const [from, to] of uniqueEdges) {
  const a = byTopLevel(from);
  const b = byTopLevel(to);
  if (a === b) continue;
  const key = `${a}:::${b}`;
  topLevelEdges[key] = [a, b];
}

const mermaidLines = [
  "# Dependency Graph",
  "",
  "```mermaid",
  "flowchart LR"
];

for (const [a, b] of Object.values(topLevelEdges)) {
  mermaidLines.push(`  ${safe(a)} --> ${safe(b)}`);
}

mermaidLines.push("```", "");

fs.writeFileSync(
  path.join(outputDir, "dependency-graph.md"),
  mermaidLines.join("\n")
);

const c4Lines = [
  "# Component View",
  "",
  "```mermaid",
  "flowchart TB",
  "  Client[Client Apps]",
  "  API[API Server]",
  "  Shared[Shared Domain Types]",
  "  DB[(PostgreSQL)]",
  "  External[External Services]",
  "",
  "  Client --> API",
  "  API --> Shared",
  "  API --> DB",
  "  API --> External",
  "```",
  ""
];

fs.writeFileSync(
  path.join(outputDir, "components.md"),
  c4Lines.join("\n")
);

function safe(name) {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}
npm run arch
npm install -D ts-morph
{
  "scripts": {
    "db:schema:generate": "node tools/generate-db-schema.mjs"
  }
}
import fs from "node:fs";
import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: false
});

const sourceFiles = project
  .getSourceFiles()
  .filter((f) => /shared\/.*schema.*\.ts$/.test(f.getFilePath().replace(/\\/g, "/")));

const tables = [];
const relations = [];

for (const file of sourceFiles) {
  for (const stmt of file.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      const initializer = decl.getInitializer();
      if (!initializer) continue;

      const text = initializer.getText();
      if (!text.includes("pgTable(")) continue;

      const tableName = decl.getName();
      const call = initializer.asKind(SyntaxKind.CallExpression);
      if (!call) continue;

      const args = call.getArguments();
      const drizzleName = args[0]?.getText()?.replace(/['"`]/g, "") || tableName;
      const colsObj = args[1];

      const columns = [];
      if (colsObj?.asKind(SyntaxKind.ObjectLiteralExpression)) {
        for (const prop of colsObj.getProperties()) {
          if (!prop.asKind(SyntaxKind.PropertyAssignment)) continue;
          const colName = prop.getName();
          const colText = prop.getInitializer()?.getText() || "";

          const typeMatch =
            colText.match(/^(varchar|text|integer|serial|timestamp|boolean|date|jsonb|uuid|numeric)\(/) ||
            colText.match(/\b(varchar|text|integer|serial|timestamp|boolean|date|jsonb|uuid|numeric)\b/);

          const type = typeMatch?.[1] || "unknown";
          columns.push({ name: colName, type });

          const refMatch = colText.match(/references\(\(\)\s*=>\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\)/);
          if (refMatch) {
            relations.push({
              fromTable: drizzleName,
              fromColumn: colName,
              toTableVar: refMatch[1],
              toColumn: refMatch[2]
            });
          }
        }
      }

      tables.push({
        varName: tableName,
        name: drizzleName,
        columns
      });
    }
  }
}

const tableNameByVar = Object.fromEntries(tables.map((t) => [t.varName, t.name]));

const lines = [
  "# Database Schema",
  "",
  "```mermaid",
  "erDiagram"
];

for (const rel of relations) {
  const toName = tableNameByVar[rel.toTableVar] || rel.toTableVar;
  lines.push(`  ${asId(rel.fromTable)} }o--|| ${asId(toName)} : "${rel.fromColumn} -> ${rel.toColumn}"`);
}

for (const table of tables) {
  lines.push(`  ${asId(table.name)} {`);
  for (const col of table.columns) {
    lines.push(`    ${col.type} ${col.name}`);
  }
  lines.push("  }");
}

lines.push("```", "");

fs.mkdirSync("docs/database", { recursive: true });
fs.writeFileSync("docs/database/schema.md", lines.join("\n"));
fs.writeFileSync("docs/database/schema.mmd", lines.slice(2, -1).join("\n"));

function asId(name) {
  return name.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
}
npm run db:schema:generate
npm install -D @openapitools/openapi-generator-cli
{
  "$schema": "node_modules/@openapitools/openapi-generator-cli/config.schema.json",
  "spaces": 2,
  "generator-cli": {
    "version": "latest"
  }
}
{
  "scripts": {
    "openapi:export": "node server/docs/openapi-builder.ts > docs/api/openapi.json",
    "sdk:ts": "openapi-generator-cli generate -i docs/api/openapi.json -g typescript-fetch -o sdk/typescript --additional-properties=npmName=@diveops/sdk,typescriptThreePlus=true,supportsES6=true",
    "sdk:python": "openapi-generator-cli generate -i docs/api/openapi.json -g python -o sdk/python",
    "sdk:generate": "npm run openapi:export && npm run sdk:ts && npm run sdk:python"
  }
}
import swaggerJsdoc from "swagger-jsdoc";

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "DiveOps API",
      version: "1.0.0",
      description: "DiveOps operational platform API"
    },
    servers: [
      { url: "http://localhost:5000" }
    ]
  },
  apis: ["./server/routes/**/*.ts"]
});

process.stdout.write(JSON.stringify(spec, null, 2));
name: API and SDK Validation

on:
  pull_request:
  push:
    branches: [main]

jobs:
  sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run sdk:generate

      - name: Check generated files committed
        run: git diff --exit-code
        npm install prom-client
        import type { Application, Request, Response, NextFunction } from "express";
import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);

export function setupMetrics(app: Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const end = httpRequestDuration.startTimer();
    res.on("finish", () => {
      const route = req.route?.path || req.path || "unknown";
      const labels = {
        method: req.method,
        route: String(route),
        status_code: String(res.statusCode)
      };
      httpRequestsTotal.inc(labels);
      end(labels);
    });
    next();
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
}
import { setupMetrics } from "./observability/metrics";

setupMetrics(app);
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "diveops-api"
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:5000"]
   version: "3.9"

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: diveops-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    restart: unless-stopped

  grafana:
    image: grafana/grafana-enterprise:latest
    container_name: diveops-grafana
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
    restart: unless-stopped
    depends_on:
      - prometheus
      apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    apiVersion: 1

providers:
  - name: DiveOps
    orgId: 1
    folder: DiveOps
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
    {
  "annotations": { "list": [] },
  "editable": true,
  "panels": [
    {
      "type": "timeseries",
      "title": "HTTP Requests / sec",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total[1m]))",
          "legendFormat": "req/s",
          "refId": "A"
        }
      ]
    },
    {
      "type": "timeseries",
      "title": "P95 Latency",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
          "legendFormat": "p95",
          "refId": "B"
        }
      ]
    }
  ],
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["diveops"],
  "templating": { "list": [] },
  "time": { "from": "now-6h", "to": "now" },
  "timezone": "browser",
  "title": "DiveOps Overview",
  "version": 1
}
docker compose -f monitoring/docker-compose.observability.yml up -d
name: Platform Artifacts

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Generate architecture docs
        run: |
          mkdir -p .artifacts
          npm run arch

      - name: Generate database docs
        run: npm run db:schema:generate

      - name: Generate OpenAPI and SDKs
        run: npm run sdk:generate

      - name: Verify committed artifacts are up to date
        run: git diff --exit-code
