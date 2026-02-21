import http from "http";

const BASE = "http://localhost:5000";

async function request(method: string, path: string, body?: any, cookie?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (cookie) hdrs["Cookie"] = cookie;
    const opts: http.RequestOptions = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: hdrs };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode!, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
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

async function login(username: string, password: string): Promise<string> {
  const res = await request("POST", "/api/auth/login", { username, password });
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${res.status}`);
  return "";
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

type Permission = "ALLOW" | "DENY";
interface RouteRule {
  method: string;
  path: string;
  body?: any;
  requiresAuth: boolean;
  allowedRoles: string[];
  description: string;
}

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  PERMISSIONS MATRIX TEST SUITE                               ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");

  const godCookie = await loginGetCookie("god", "godmode");
  const supervisorCookie = await loginGetCookie("supervisor", "supervisor123");
  const diverCookie = await loginGetCookie("diver", "diver123");

  const cookies: Record<string, string> = {
    GOD: godCookie,
    SUPERVISOR: supervisorCookie,
    DIVER: diverCookie,
  };

  const ALL_ROLES = ["GOD", "SUPERVISOR", "DIVER"];

  const routes: RouteRule[] = [
    { method: "GET", path: "/api/auth/me", requiresAuth: true, allowedRoles: ALL_ROLES, description: "Get current user" },
    { method: "GET", path: "/api/projects", requiresAuth: true, allowedRoles: ALL_ROLES, description: "List projects" },
    { method: "POST", path: "/api/projects", body: { name: "PermTest", clientName: "Test" }, requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "Create project" },
    { method: "GET", path: "/api/dashboard/stats", requiresAuth: true, allowedRoles: ALL_ROLES, description: "Dashboard stats" },
    { method: "GET", path: "/api/users", requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "List users" },
    { method: "POST", path: "/api/users", body: { username: "perm_test_" + Date.now(), password: "testpass123", role: "DIVER", fullName: "Perm Test" }, requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "Create user" },
    { method: "GET", path: "/api/admin/users", requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "Admin list users" },
    { method: "GET", path: "/api/audit-events", requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "Audit events" },
    { method: "GET", path: "/api/ml-export/stats", requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "ML export stats" },
    { method: "GET", path: "/api/directory-facilities", requiresAuth: true, allowedRoles: ALL_ROLES, description: "Directory facilities" },
    { method: "POST", path: "/api/directory-facilities", body: { name: "Test Chamber", type: "chamber", phone: "555-0000", lat: "0", lng: "0" }, requiresAuth: true, allowedRoles: ["GOD", "ADMIN"], description: "Create facility" },
    { method: "GET", path: "/api/library", requiresAuth: true, allowedRoles: ALL_ROLES, description: "Library list" },
    { method: "GET", path: "/api/setup/status", requiresAuth: false, allowedRoles: ALL_ROLES, description: "Setup status (public)" },
  ];

  // ─── UNAUTHENTICATED ACCESS ────────────────────────────────────
  console.log("── Unauthenticated Access ──");

  for (const route of routes) {
    const res = await request(route.method, route.path, route.body);
    if (route.requiresAuth) {
      assert(res.status === 401, `${route.method} ${route.path} unauthenticated → 401: got ${res.status}`);
    } else {
      assert(res.status === 200 || res.status === 304, `${route.method} ${route.path} public → 200: got ${res.status}`);
    }
  }

  // ─── ROLE-BASED ACCESS ─────────────────────────────────────────
  console.log("\n── Role-Based Access Matrix ──");

  for (const route of routes) {
    if (!route.requiresAuth) continue;

    for (const role of ALL_ROLES) {
      const cookie = cookies[role];
      const res = await request(route.method, route.path, route.body, cookie);
      const shouldAllow = route.allowedRoles.includes(role);

      if (shouldAllow) {
        assert(res.status !== 401 && res.status !== 403,
          `${role} → ${route.method} ${route.path} (${route.description}): ALLOWED (${res.status})`);
      } else {
        assert(res.status === 403,
          `${role} → ${route.method} ${route.path} (${route.description}): DENIED → 403 (got ${res.status})`);
      }
    }
  }

  // ─── 401 vs 403 DISTINCTION ────────────────────────────────────
  console.log("\n── 401 vs 403 Distinction ──");

  const protectedRoutes = [
    { method: "GET", path: "/api/users" },
    { method: "GET", path: "/api/audit-events" },
    { method: "POST", path: "/api/projects", body: { name: "test" } },
  ];

  for (const route of protectedRoutes) {
    const noAuth = await request(route.method, route.path, route.body);
    assert(noAuth.status === 401, `${route.method} ${route.path} no auth → 401 (not 403): ${noAuth.status}`);

    const withDiver = await request(route.method, route.path, route.body, diverCookie);
    assert(withDiver.status === 403, `${route.method} ${route.path} DIVER → 403 (not 401): ${withDiver.status}`);
  }

  // ─── DIVER WRITE RESTRICTIONS ──────────────────────────────────
  console.log("\n── DIVER Write Restrictions ──");

  const diverDenied = [
    { method: "POST", path: "/api/projects", body: { name: "Diver Project" }, desc: "Create project" },
    { method: "POST", path: "/api/users", body: { username: "diver_user", password: "pass123", role: "DIVER" }, desc: "Create user" },
    { method: "POST", path: "/api/directory-facilities", body: { name: "Diver Facility", type: "chamber" }, desc: "Create facility" },
  ];

  for (const route of diverDenied) {
    const res = await request(route.method, route.path, route.body, diverCookie);
    assert(res.status === 403, `DIVER cannot ${route.desc}: ${res.status}`);
  }

  // ─── SUPERVISOR RESTRICTIONS ───────────────────────────────────
  console.log("\n── SUPERVISOR Restrictions ──");

  const supDenied = [
    { method: "GET", path: "/api/users", desc: "List users (admin only)" },
    { method: "GET", path: "/api/audit-events", desc: "Audit events (admin only)" },
    { method: "POST", path: "/api/projects", body: { name: "Sup Project" }, desc: "Create project (admin only)" },
  ];

  for (const route of supDenied) {
    const res = await request(route.method, route.path, route.body, supervisorCookie);
    assert(res.status === 403, `SUPERVISOR cannot ${route.desc}: ${res.status}`);
  }

  // ─── SUPERVISOR CAN DO ─────────────────────────────────────────
  console.log("\n── SUPERVISOR Allowed Operations ──");

  const supAllowed = [
    { method: "GET", path: "/api/projects", desc: "List projects" },
    { method: "GET", path: "/api/dashboard/stats", desc: "Dashboard stats" },
    { method: "GET", path: "/api/directory-facilities", desc: "Directory facilities" },
    { method: "GET", path: "/api/library", desc: "Library" },
  ];

  for (const route of supAllowed) {
    const res = await request(route.method, route.path, undefined, supervisorCookie);
    assert(res.status === 200, `SUPERVISOR can ${route.desc}: ${res.status}`);
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
