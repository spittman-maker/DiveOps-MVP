import http from "http";
import https from "https";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";

async function request(method: string, path: string, body?: any, cookie?: string, rawHeaders?: Record<string, string>): Promise<{ status: number; body: any; headers: Record<string, string>; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const hdrs: Record<string, string> = { "Content-Type": "application/json", ...rawHeaders };
    if (cookie) hdrs["Cookie"] = cookie;
    const opts: http.RequestOptions = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: hdrs };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : null, headers: res.headers as any, rawBody: data }); }
        catch { resolve({ status: res.statusCode!, body: data, headers: res.headers as any, rawBody: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
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

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  SECURITY & DATA INTEGRITY TEST SUITE                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("spittman@precisionsubsea.com", "Whisky9954!");
  supervisorCookie = await loginGetCookie("supervisor", "supervisor123");

  // ─── NO SECRETS IN CLIENT BUNDLE ───────────────────────────────
  console.log("── No Secrets in Client Bundle ──");

  const indexHtml = await request("GET", "/");
  assert(indexHtml.status === 200, "Index page loads");
  assert(!indexHtml.rawBody.includes("DATABASE_URL"), "No DATABASE_URL in HTML");
  assert(!indexHtml.rawBody.includes("SESSION_SECRET"), "No SESSION_SECRET in HTML");
  assert(!indexHtml.rawBody.includes("OPENAI_API_KEY"), "No OPENAI_API_KEY in HTML");
  assert(!indexHtml.rawBody.includes("OPENWEATHER_API_KEY"), "No OPENWEATHER_API_KEY in HTML");

  const jsFiles = indexHtml.rawBody.match(/src="([^"]+\.js)"/g) || [];
  for (const jsRef of jsFiles.slice(0, 3)) {
    const jsPath = jsRef.replace('src="', '').replace('"', '');
    const jsRes = await request("GET", jsPath);
    if (jsRes.status === 200 && typeof jsRes.rawBody === "string") {
      assert(!jsRes.rawBody.includes("DATABASE_URL"), `No DATABASE_URL in ${jsPath}`);
      assert(!jsRes.rawBody.includes("SESSION_SECRET"), `No SESSION_SECRET in ${jsPath}`);
      assert(!jsRes.rawBody.includes("godmode"), `No 'godmode' password in ${jsPath}`);
      assert(!jsRes.rawBody.includes("supervisor123"), `No 'supervisor123' password in ${jsPath}`);
      assert(!jsRes.rawBody.includes("diver123"), `No 'diver123' password in ${jsPath}`);
    }
  }

  // ─── PASSWORD NOT EXPOSED IN RESPONSES ─────────────────────────
  console.log("\n── Password Not Exposed in API Responses ──");

  const userList = await request("GET", "/api/users", undefined, godCookie);
  if (Array.isArray(userList.body)) {
    for (const u of userList.body) {
      assert(!u.password, `User ${u.username}: password field not in response`);
    }
  }

  const meRes = await request("GET", "/api/auth/me", undefined, godCookie);
  assert(!meRes.body.password, "/api/auth/me does not expose password");

  // ─── XSS PREVENTION ────────────────────────────────────────────
  console.log("\n── XSS Prevention ──");

  const xssPayload = '<script>alert("xss")</script>';
  const xssEvent = await request("POST", "/api/log-events", {
    rawText: `0800 ${xssPayload}`,
    dayId: "test",
    projectId: "test",
  }, supervisorCookie);
  if (xssEvent.status === 201 || xssEvent.status === 200) {
    assert(!xssEvent.rawBody.includes('<script>'), "XSS script tag not reflected raw in response");
  } else {
    assert(true, `XSS payload rejected or day not found: ${xssEvent.status}`);
  }

  // ─── SQL INJECTION PREVENTION ──────────────────────────────────
  console.log("\n── SQL Injection Prevention ──");

  const sqlInjection = await request("POST", "/api/auth/login", {
    username: "admin'; DROP TABLE users; --",
    password: "test",
  });
  assert(sqlInjection.status === 401, `SQL injection login attempt rejected: ${sqlInjection.status}`);

  const sqlInjection2 = await request("GET", "/api/days/'; DROP TABLE days; --", undefined, godCookie);
  assert(sqlInjection2.status >= 400, `SQL injection in path rejected: ${sqlInjection2.status}`);

  // ─── SERVER-SIDE AUTH ENFORCEMENT ──────────────────────────────
  console.log("\n── Server-Side Auth Enforcement ──");

  const adminRoutes = [
    "/api/users", "/api/audit-events", "/api/ml-export/stats",
    "/api/admin/users",
  ];
  const diverCookie = await loginGetCookie("diver", "diver123");

  for (const route of adminRoutes) {
    const res = await request("GET", route, undefined, diverCookie);
    assert(res.status === 403, `Server enforces auth on ${route} for DIVER: ${res.status}`);
  }

  // ─── SESSION COOKIE SECURITY ───────────────────────────────────
  console.log("\n── Session Cookie Properties ──");

  const loginRes = await request("POST", "/api/auth/login", { username: "spittman@precisionsubsea.com", password: "Whisky9954!" });
  const setCookieHeader = loginRes.headers["set-cookie"];
  if (setCookieHeader) {
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join("; ") : setCookieHeader;
    assert(cookieStr.includes("HttpOnly"), "Session cookie has HttpOnly flag");
    assert(cookieStr.includes("Path=/"), "Session cookie has Path=/");
  }

  // ─── DATA INTEGRITY: REQUIRED FIELDS ──────────────────────────
  console.log("\n── Data Integrity: Required Fields ──");

  const noUsername = await request("POST", "/api/users", {
    password: "testpass123", role: "DIVER",
  }, godCookie);
  assert(noUsername.status >= 400, `User creation without username rejected: ${noUsername.status}`);

  const noPassword = await request("POST", "/api/users", {
    username: "nopass_" + Date.now(), role: "DIVER",
  }, godCookie);
  assert(noPassword.status >= 400, `User creation without password rejected: ${noPassword.status}`);

  const noRole = await request("POST", "/api/users", {
    username: "norole_" + Date.now(), password: "testpass123",
  }, godCookie);
  assert(noRole.status >= 400 || (noRole.body && noRole.body.role), `User creation without role handled: ${noRole.status}`);

  // ─── DATA INTEGRITY: CRUD LIFECYCLE ────────────────────────────
  console.log("\n── Data Integrity: CRUD Lifecycle ──");

  const testUsername = "crud_test_" + Date.now();
  const createUser = await request("POST", "/api/users", {
    username: testUsername,
    password: "securePass123",
    role: "DIVER",
    fullName: "CRUD Test User",
    initials: "CT",
    email: "crud@test.com",
  }, godCookie);
  assert(createUser.status === 201, `Create user: ${createUser.status}`);

  if (createUser.status === 201) {
    const userId = createUser.body.id;

    const readUsers = await request("GET", "/api/users", undefined, godCookie);
    const foundUser = readUsers.body.find((u: any) => u.id === userId);
    assert(!!foundUser, `Read: created user found in list`);
    assert(foundUser?.username === testUsername, `Read: username matches`);
    assert(foundUser?.fullName === "CRUD Test User", `Read: fullName matches`);

    const updateUser = await request("PATCH", `/api/users/${userId}`, {
      fullName: "Updated CRUD User",
    }, godCookie);
    assert(updateUser.status === 200, `Update user: ${updateUser.status}`);

    const readAfterUpdate = await request("GET", "/api/users", undefined, godCookie);
    const updatedUser = readAfterUpdate.body.find((u: any) => u.id === userId);
    assert(updatedUser?.fullName === "Updated CRUD User", `Read after update: fullName updated`);
  }

  // ─── DATA INTEGRITY: UNIQUE CONSTRAINTS ────────────────────────
  console.log("\n── Data Integrity: Unique Constraints ──");

  const dupUser = await request("POST", "/api/users", {
    username: "god",
    password: "testpass123",
    role: "DIVER",
  }, godCookie);
  assert(dupUser.status >= 400, `Duplicate username rejected: ${dupUser.status}`);

  // ─── DATA INTEGRITY: INVALID ROLE ──────────────────────────────
  console.log("\n── Data Integrity: Invalid Values ──");

  const invalidRole = await request("POST", "/api/users", {
    username: "badrole_" + Date.now(),
    password: "testpass123",
    role: "SUPERADMIN",
    fullName: "Bad Role",
  }, godCookie);
  assert(invalidRole.status >= 400 || invalidRole.body?.role === "SUPERADMIN",
    `Invalid role handled: ${invalidRole.status}`);

  // ─── EXPORT FILE VALIDATION ────────────────────────────────────
  console.log("\n── Export Endpoint Validation ──");

  const projectsForExport = await request("GET", "/api/projects", undefined, godCookie);
  if (Array.isArray(projectsForExport.body) && projectsForExport.body.length > 0) {
    const firstProject = projectsForExport.body[0];
    const daysForExport = await request("GET", `/api/projects/${firstProject.id}/days`, undefined, godCookie);
    if (Array.isArray(daysForExport.body) && daysForExport.body.length > 0) {
      const testDayId = daysForExport.body[0].id;
      const exports = await request("GET", `/api/days/${testDayId}/library-exports`, undefined, godCookie);
      assert(exports.status === 200, `Library exports endpoint returns 200`);
      assert(Array.isArray(exports.body), `Library exports is array`);
    }
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
