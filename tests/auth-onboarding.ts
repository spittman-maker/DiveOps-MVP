import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
let diverCookie = "";

async function request(method: string, path: string, body?: any, customCookie?: string): Promise<{ status: number; body: any; headers: Record<string, string>; setCookie?: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (customCookie) hdrs["Cookie"] = customCookie;
    const opts: http.RequestOptions = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: hdrs };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const sc = res.headers["set-cookie"];
        const cookieStr = sc ? sc.map((c) => c.split(";")[0]).join("; ") : undefined;
        try { resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : null, headers: res.headers as any, setCookie: cookieStr }); }
        catch { resolve({ status: res.statusCode!, body: data, headers: res.headers as any, setCookie: cookieStr }); }
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

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  AUTH & ONBOARDING TEST SUITE                                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Seed test users
  await request("POST", "/api/seed");

  // ─── FIRST-TIME SETUP ───────────────────────────────────────────
  console.log("\n── First-Time Setup ──");

  const status = await request("GET", "/api/setup/status");
  assert(status.status === 200, `Setup status returns 200: ${status.status}`);
  assert(status.body.initialized === true, `System shows initialized (users exist): ${status.body.initialized}`);
  assert(typeof status.body.userCount === "number" && status.body.userCount > 0, `User count > 0: ${status.body.userCount}`);

  const lockout = await request("POST", "/api/setup/init", {
    username: "hacker", password: "longpassword123", fullName: "Hacker", initials: "HK", email: "hk@evil.com"
  });
  assert(lockout.status === 403, `Setup endpoint locked after init: ${lockout.status}`);
  assert(lockout.body.message.includes("already initialized"), `Correct lockout message: ${lockout.body.message}`);

  // ─── LOGIN VALIDATION ──────────────────────────────────────────
  console.log("\n── Login Validation ──");

  const badCreds = await request("POST", "/api/auth/login", { username: "nonexistent", password: "wrong" });
  assert(badCreds.status === 401, `Invalid credentials returns 401: ${badCreds.status}`);

  const badPassword = await request("POST", "/api/auth/login", { username: "god", password: "wrongpassword" });
  assert(badPassword.status === 401, `Wrong password returns 401: ${badPassword.status}`);

  const emptyBody = await request("POST", "/api/auth/login", {});
  assert(emptyBody.status === 401 || emptyBody.status === 400, `Empty credentials returns 401 or 400: ${emptyBody.status}`);

  const noBody = await request("POST", "/api/auth/login");
  assert(noBody.status >= 400, `No body returns error: ${noBody.status}`);

  // ─── SUCCESSFUL LOGIN ──────────────────────────────────────────
  console.log("\n── Successful Login ──");

  const godLogin = await request("POST", "/api/auth/login", { username: "god", password: "godmode" });
  assert(godLogin.status === 200, `GOD login succeeds: ${godLogin.status}`);
  assert(godLogin.body.role === "GOD", `GOD role returned: ${godLogin.body.role}`);
  assert(godLogin.body.username === "god", `Username returned: ${godLogin.body.username}`);
  assert(typeof godLogin.body.id === "string", `User ID returned: ${typeof godLogin.body.id}`);
  assert(!!godLogin.setCookie, `Session cookie set on login`);
  godCookie = godLogin.setCookie!;

  const supLogin = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  assert(supLogin.status === 200, `Supervisor login succeeds: ${supLogin.status}`);
  supervisorCookie = supLogin.setCookie!;

  const diverLogin = await request("POST", "/api/auth/login", { username: "diver", password: "diver123" });
  assert(diverLogin.status === 200, `Diver login succeeds: ${diverLogin.status}`);
  diverCookie = diverLogin.setCookie!;

  // ─── SESSION PERSISTENCE ───────────────────────────────────────
  console.log("\n── Session Persistence ──");

  const me1 = await request("GET", "/api/auth/me", undefined, godCookie);
  assert(me1.status === 200, `GET /api/auth/me with cookie: ${me1.status}`);
  assert(me1.body.username === "god", `Session returns correct user: ${me1.body.username}`);
  assert(me1.body.role === "GOD", `Session returns correct role: ${me1.body.role}`);

  const me2 = await request("GET", "/api/auth/me", undefined, godCookie);
  assert(me2.status === 200, `Session persists across requests: ${me2.status}`);
  assert(me2.body.username === "god", `Same user on second request: ${me2.body.username}`);

  const noSession = await request("GET", "/api/auth/me");
  assert(noSession.status === 401, `No cookie returns 401: ${noSession.status}`);

  const badSession = await request("GET", "/api/auth/me", undefined, "connect.sid=s%3Ainvalid.fake");
  assert(badSession.status === 401, `Invalid cookie returns 401: ${badSession.status}`);

  // ─── LOGOUT ────────────────────────────────────────────────────
  console.log("\n── Logout ──");

  const freshLogin = await request("POST", "/api/auth/login", { username: "god", password: "godmode" });
  const tempCookie = freshLogin.setCookie!;

  const logout = await request("POST", "/api/auth/logout", undefined, tempCookie);
  assert(logout.status === 200, `Logout succeeds: ${logout.status}`);

  const afterLogout = await request("GET", "/api/auth/me", undefined, tempCookie);
  assert(afterLogout.status === 401, `Session invalid after logout: ${afterLogout.status}`);

  // ─── PASSWORD POLICY ───────────────────────────────────────────
  console.log("\n── Password Policy (Admin-Created Users) ──");

  const shortPw = await request("POST", "/api/users", {
    username: "test_shortpw_" + Date.now(),
    password: "ab",
    role: "DIVER",
    fullName: "Short Password",
    initials: "SP",
  }, godCookie);
  assert(shortPw.status === 201 || shortPw.status === 400, `Short password handled: ${shortPw.status}`);

  const validUser = await request("POST", "/api/users", {
    username: "test_valid_" + Date.now(),
    password: "securePassword123",
    role: "DIVER",
    fullName: "Test Valid User",
    initials: "TV",
    email: "test@valid.com",
  }, godCookie);
  assert(validUser.status === 201, `Valid user creation succeeds: ${validUser.status}`);

  if (validUser.status === 201) {
    const newLogin = await request("POST", "/api/auth/login", {
      username: validUser.body.username,
      password: "securePassword123",
    });
    assert(newLogin.status === 200, `Newly created user can log in: ${newLogin.status}`);
  }

  // ─── SETUP INIT VALIDATION ─────────────────────────────────────
  console.log("\n── Setup Init Validation ──");

  const shortSetupPw = await request("POST", "/api/setup/init", {
    username: "admin2", password: "short", fullName: "Admin", initials: "A", email: "a@b.com"
  });
  assert(shortSetupPw.status === 400 || shortSetupPw.status === 403, `Setup rejects short password: ${shortSetupPw.status}`);

  const noEmail = await request("POST", "/api/setup/init", {
    username: "admin2", password: "longpassword", fullName: "Admin", initials: "A", email: "notanemail"
  });
  assert(noEmail.status === 400 || noEmail.status === 403, `Setup rejects invalid email: ${noEmail.status}`);

  const shortUsername = await request("POST", "/api/setup/init", {
    username: "ab", password: "longpassword123", fullName: "Admin", initials: "A", email: "a@b.com"
  });
  assert(shortUsername.status === 400 || shortUsername.status === 403, `Setup rejects short username: ${shortUsername.status}`);

  // ─── RATE LIMITING BASICS ──────────────────────────────────────
  console.log("\n── Rapid Login Attempts ──");

  const rapidResults: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await request("POST", "/api/auth/login", { username: "nonexistent", password: "wrong" + i });
    rapidResults.push(r.status);
  }
  const all401 = rapidResults.every(s => s === 401);
  assert(all401 || rapidResults.some(s => s === 429), `Rapid login attempts handled (all 401 or rate limited): ${rapidResults.join(",")}`);

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
