import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let projectId = "";
let dayId = "";

async function request(method: string, path: string, body?: any, cookie?: string): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (cookie) hdrs["Cookie"] = cookie;
    const opts: http.RequestOptions = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: hdrs };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : null, headers: res.headers as any }); }
        catch { resolve({ status: res.statusCode!, body: data, headers: res.headers as any }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function loginGetCookie(username: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/auth/login", BASE);
    const opts: http.RequestOptions = {
      method: "POST", hostname: url.hostname, port: url.port, path: url.pathname,
      headers: { "Content-Type": "application/json" }
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const sc = res.headers["set-cookie"];
        if (!sc) reject(new Error(`No cookie for ${username}`));
        else resolve(sc.map(c => c.split(";")[0]).join("; "));
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify({ username, password }));
    req.end();
  });
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ✗ FAIL: ${msg}`); }
}

function assertShape(obj: any, fields: string[], context: string) {
  for (const field of fields) {
    assert(obj && obj[field] !== undefined, `${context} has required field '${field}'`);
  }
}

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  API CONTRACT TEST SUITE                                     ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("spittman@precisionsubsea.com", "Whisky9954!");

  // ─── AUTH RESPONSE CONTRACTS ────────────────────────────────────
  console.log("── Auth Response Contracts ──");

  const login = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  assertShape(login.body, ["id", "username", "role"], "Login response");
  assert(typeof login.body.id === "string", "Login id is string");
  assert(typeof login.body.username === "string", "Login username is string");
  assert(["GOD", "ADMIN", "SUPERVISOR", "DIVER"].includes(login.body.role), `Login role is valid enum: ${login.body.role}`);

  const me = await request("GET", "/api/auth/me", undefined, godCookie);
  assertShape(me.body, ["id", "username", "role"], "/api/auth/me response");
  assert(typeof me.body.id === "string", "Me id is string");

  // ─── ERROR FORMAT CONSISTENCY ──────────────────────────────────
  console.log("\n── Error Format Consistency ──");

  const errors = [
    { method: "GET", path: "/api/auth/me", desc: "Unauthenticated", expectedStatus: 401 },
    { method: "POST", path: "/api/projects", body: { name: "x" }, desc: "DIVER create project", cookie: undefined as string | undefined },
    { method: "GET", path: "/api/days/nonexistent-uuid", desc: "Not found day", cookie: undefined as string | undefined },
  ];

  const diverCookie = await loginGetCookie("diver", "diver123");
  errors[1].cookie = diverCookie;
  errors[2].cookie = godCookie;

  for (const err of errors) {
    const res = await request(err.method, err.path, (err as any).body, (err as any).cookie || undefined);
    if (res.status >= 400) {
      assert(typeof res.body === "object" && res.body !== null, `${err.desc}: error response is JSON object`);
      assert(typeof res.body.message === "string", `${err.desc}: error has 'message' string field`);
    }
  }

  // ─── SETUP STATUS CONTRACT ─────────────────────────────────────
  console.log("\n── Setup Status Contract ──");

  const setupStatus = await request("GET", "/api/setup/status");
  assertShape(setupStatus.body, ["initialized", "userCount"], "Setup status");
  assert(typeof setupStatus.body.initialized === "boolean", "initialized is boolean");
  assert(typeof setupStatus.body.userCount === "number", "userCount is number");

  // ─── PROJECT RESPONSE CONTRACT ─────────────────────────────────
  console.log("\n── Project Response Contract ──");

  const projects = await request("GET", "/api/projects", undefined, godCookie);
  assert(Array.isArray(projects.body), "Projects is array");
  if (projects.body.length > 0) {
    const p = projects.body[0];
    assertShape(p, ["id", "name"], "Project");
    assert(typeof p.id === "string", "Project id is string");
    assert(typeof p.name === "string", "Project name is string");
    projectId = p.id;
  }

  // ─── DASHBOARD STATS CONTRACT ──────────────────────────────────
  console.log("\n── Dashboard Stats Contract ──");

  const stats = await request("GET", "/api/dashboard/stats", undefined, godCookie);
  assert(stats.status === 200, `Dashboard stats returns 200: ${stats.status}`);
  assertShape(stats.body, ["totalDives", "safetyIncidents", "openRisks", "logEntriesToday"], "Dashboard stats");
  assert(typeof stats.body.totalDives === "number", "totalDives is number");
  assert(typeof stats.body.safetyIncidents === "number", "safetyIncidents is number");
  assert(typeof stats.body.openRisks === "number", "openRisks is number");
  assert(typeof stats.body.logEntriesToday === "number", "logEntriesToday is number");

  // ─── DAY RESPONSE CONTRACT ─────────────────────────────────────
  console.log("\n── Day Response Contract ──");

  if (projectId) {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, godCookie);
    assert(Array.isArray(days.body), "Days is array");
    if (days.body.length > 0) {
      const d = days.body[0];
      assertShape(d, ["id", "projectId", "status", "date"], "Day");
      assert(["ACTIVE", "CLOSED", "LOCKED"].includes(d.status), `Day status is valid: ${d.status}`);
      dayId = d.id;
    }
  }

  // ─── LOG EVENT RESPONSE CONTRACT ───────────────────────────────
  console.log("\n── Log Event Response Contract ──");

  if (dayId) {
    const events = await request("GET", `/api/days/${dayId}/log-events`, undefined, godCookie);
    assert(Array.isArray(events.body), "Log events is array");
    if (events.body.length > 0) {
      const e = events.body[0];
      assertShape(e, ["id", "dayId", "rawText"], "Log event");
      assert(typeof e.id === "string", "Event id is string");
      assert(typeof e.rawText === "string", "Event rawText is string");
      assert(typeof e.dayId === "string", "Event dayId is string");
    }
  }

  // ─── USER LIST CONTRACT ────────────────────────────────────────
  console.log("\n── User List Contract ──");

  const users = await request("GET", "/api/users", undefined, godCookie);
  assert(Array.isArray(users.body), "Users is array");
  if (users.body.length > 0) {
    const u = users.body[0];
    assertShape(u, ["id", "username", "role"], "User");
    const hasPassword = users.body.some((usr: any) => usr.password !== undefined && usr.password !== null);
    assert(!hasPassword, "No user response contains password field");
  }

  // ─── FACILITY CONTRACT ─────────────────────────────────────────
  console.log("\n── Facility Contract ──");

  const facilities = await request("GET", "/api/directory-facilities", undefined, godCookie);
  assert(Array.isArray(facilities.body), "Facilities is array");

  // ─── LIBRARY CONTRACT ──────────────────────────────────────────
  console.log("\n── Library Contract ──");

  const library = await request("GET", "/api/library", undefined, godCookie);
  assert(Array.isArray(library.body), "Library is array");

  // ─── RISK REGISTER CONTRACT ────────────────────────────────────
  console.log("\n── Risk Register Contract ──");

  if (projectId) {
    const risks = await request("GET", `/api/projects/${projectId}/risks`, undefined, godCookie);
    assert(risks.status === 200, `Risk register returns 200: ${risks.status}`);
    assert(Array.isArray(risks.body), "Risks is array");
    if (risks.body.length > 0) {
      const r = risks.body[0];
      assertShape(r, ["id", "riskId", "description", "status"], "Risk item");
    }
  }

  // ─── AUDIT EVENTS CONTRACT ─────────────────────────────────────
  console.log("\n── Audit Events Contract ──");

  const audit = await request("GET", "/api/audit-events", undefined, godCookie);
  assert(audit.status === 200, `Audit events returns 200: ${audit.status}`);
  assert(Array.isArray(audit.body), "Audit events is array");
  if (audit.body.length > 0) {
    const a = audit.body[0];
    assertShape(a, ["id", "action", "userId"], "Audit event");
  }

  // ─── CONTENT-TYPE HEADERS ──────────────────────────────────────
  console.log("\n── Content-Type Headers ──");

  const jsonRoutes = [
    "/api/setup/status",
    "/api/auth/me",
    "/api/projects",
    "/api/dashboard/stats",
  ];

  for (const path of jsonRoutes) {
    const res = await request("GET", path, undefined, godCookie);
    const ct = res.headers["content-type"] || "";
    assert(ct.includes("application/json"), `${path} returns JSON content-type: ${ct}`);
  }

  // ─── RESULTS ───────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("  FAILURES:");
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log("════════════════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error("Test runner error:", err); process.exit(1); });
