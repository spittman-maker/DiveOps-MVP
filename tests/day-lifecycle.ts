import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
let diverCookie = "";
let projectId = "";

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

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  DAY LIFECYCLE & INVARIANTS TEST SUITE                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("god", "godmode");
  supervisorCookie = await loginGetCookie("supervisor", "supervisor123");
  diverCookie = await loginGetCookie("diver", "diver123");

  // Create a fresh project
  const proj = await request("POST", "/api/projects", {
    name: `Lifecycle Test ${Date.now()}`,
    clientName: "Lifecycle Client",
  }, godCookie);
  projectId = proj.body?.id;
  assert(!!projectId, "Test project created");

  // ─── 1. DAY AUTO-CREATION ────────────────────────────────────
  console.log("── 1. Day Auto-Creation ──");

  const days1 = await request("GET", `/api/projects/${projectId}/days`, undefined, supervisorCookie);
  assert(days1.status === 200, `Supervisor can access days: ${days1.status}`);
  const dayId1 = Array.isArray(days1.body) && days1.body.length > 0 ? days1.body[0].id : null;
  assert(!!dayId1, "Day auto-created for supervisor");

  if (!dayId1) { console.error("Cannot continue without day"); process.exit(1); }

  const day1 = await request("GET", `/api/days/${dayId1}`, undefined, supervisorCookie);
  assert(day1.body?.status === "DRAFT" || day1.body?.status === "ACTIVE", `New day starts as DRAFT/ACTIVE: ${day1.body?.status}`);

  // ─── 2. LOG EVENTS ON OPEN DAY ──────────────────────────────
  console.log("\n── 2. Log Events on Open Day ──");

  const ev1 = await request("POST", "/api/log-events", {
    rawText: "0600 Day started, all personnel mustered",
    dayId: dayId1, projectId,
  }, supervisorCookie);
  assert(ev1.status === 201 || ev1.status === 200, `Supervisor can log on open day: ${ev1.status}`);

  const ev2 = await request("POST", "/api/log-events", {
    rawText: "0615 Toolbox talk completed",
    dayId: dayId1, projectId,
  }, godCookie);
  assert(ev2.status === 201 || ev2.status === 200, `GOD can log on open day: ${ev2.status}`);

  // Diver cannot log
  const evDiver = await request("POST", "/api/log-events", {
    rawText: "0620 Diver trying to log",
    dayId: dayId1, projectId,
  }, diverCookie);
  assert(evDiver.status === 403 || evDiver.status === 401, `Diver cannot create log events: ${evDiver.status}`);

  // ─── 3. SIMPLE CLOSE (without export) ───────────────────────
  console.log("\n── 3. Day Close ──");

  const close1 = await request("POST", `/api/days/${dayId1}/close`, {
    forceClose: true,
    closeoutData: { scopeStatus: "Complete" },
  }, supervisorCookie);
  assert(close1.status === 200, `Day close: ${close1.status}`);

  const closedDay = await request("GET", `/api/days/${dayId1}`, undefined, supervisorCookie);
  assert(closedDay.body?.status === "CLOSED", `Day is CLOSED after close: ${closedDay.body?.status}`);

  // ─── 4. CLOSED DAY BLOCKS EVENTS ───────────────────────────
  console.log("\n── 4. Closed Day Blocks Writes ──");

  const blocked = await request("POST", "/api/log-events", {
    rawText: "0700 Should be blocked",
    dayId: dayId1, projectId,
  }, supervisorCookie);
  assert(blocked.status === 403, `Supervisor blocked on closed day: ${blocked.status}`);

  // GOD override
  const godOverride = await request("POST", "/api/log-events", {
    rawText: "0700 GOD override on closed day",
    dayId: dayId1, projectId,
  }, godCookie);
  assert(godOverride.status === 201 || godOverride.status === 200, `GOD can write to closed day: ${godOverride.status}`);

  // ─── 5. REOPEN DAY ─────────────────────────────────────────
  console.log("\n── 5. Day Reopen ──");

  const reopen = await request("POST", `/api/days/${dayId1}/reopen`, {}, supervisorCookie);
  assert(reopen.status === 200, `Day reopen: ${reopen.status}`);

  const reopenedDay = await request("GET", `/api/days/${dayId1}`, undefined, supervisorCookie);
  assert(reopenedDay.body?.status !== "CLOSED", `Day is no longer CLOSED after reopen: ${reopenedDay.body?.status}`);

  // ─── 6. WRITE AFTER REOPEN ─────────────────────────────────
  console.log("\n── 6. Write After Reopen ──");

  const postReopen = await request("POST", "/api/log-events", {
    rawText: "0800 Post-reopen entry by supervisor",
    dayId: dayId1, projectId,
  }, supervisorCookie);
  assert(postReopen.status === 201 || postReopen.status === 200, `Supervisor writes after reopen: ${postReopen.status}`);

  // ─── 7. RE-CLOSE AND EXPORT ────────────────────────────────
  console.log("\n── 7. Re-Close and Export ──");

  const reClose = await request("POST", `/api/days/${dayId1}/close-and-export`, {
    closeoutData: {
      scopeStatus: "Complete",
      documentationStatus: "All current",
      seiAdvisories: "None",
      standingRisks: "None",
      deviations: "None",
      outstandingIssues: "None",
      nextShiftWork: "Continue ops",
    },
  }, supervisorCookie);
  assert(reClose.status === 200, `Re-close with export: ${reClose.status}`);

  const finalDay = await request("GET", `/api/days/${dayId1}`, undefined, supervisorCookie);
  assert(finalDay.body?.status === "CLOSED", `Final day status is CLOSED: ${finalDay.body?.status}`);

  // ─── 8. REOPEN INVALID STATE ───────────────────────────────
  console.log("\n── 8. Reopen Invalid States ──");

  // Reopen first
  await request("POST", `/api/days/${dayId1}/reopen`, {}, supervisorCookie);

  // Try reopen on already-open day
  const reopenOpen = await request("POST", `/api/days/${dayId1}/reopen`, {}, supervisorCookie);
  assert(reopenOpen.status === 400, `Reopen on non-closed day returns 400: ${reopenOpen.status}`);

  // ─── 9. DAY STATUS ENDPOINT ────────────────────────────────
  console.log("\n── 9. Day Status Endpoint ──");

  const status = await request("GET", `/api/days/${dayId1}/status`, undefined, supervisorCookie);
  assert(status.status === 200, `Day status: ${status.status}`);

  // ─── 10. COMPLIANCE CHECK ─────────────────────────────────
  console.log("\n── 10. Compliance Gaps ──");

  const compliance = await request("GET", `/api/days/${dayId1}/compliance`, undefined, supervisorCookie);
  assert(compliance.status === 200, `Compliance endpoint: ${compliance.status}`);

  // ─── 11. DAY SUMMARY ──────────────────────────────────────
  console.log("\n── 11. Day Summary ──");

  const summary = await request("GET", `/api/days/${dayId1}/summary`, undefined, supervisorCookie);
  assert(summary.status === 200 || summary.status === 404, `Day summary: ${summary.status} (404 if no summary generated yet)`);

  // ─── 12. BREATHING GAS UPDATE ─────────────────────────────
  console.log("\n── 12. Day Metadata Updates ──");

  const gasUpdate = await request("PATCH", `/api/days/${dayId1}/breathing-gas`, {
    breathingGas: "Surface-supplied air",
  }, supervisorCookie);
  assert(gasUpdate.status === 200, `Breathing gas update: ${gasUpdate.status}`);

  // ─── 13. DAY UPDATE ───────────────────────────────────────
  console.log("\n── 13. Day Patch ──");

  const dayPatch = await request("PATCH", `/api/days/${dayId1}`, {
    notes: "Test notes for lifecycle test",
  }, supervisorCookie);
  assert(dayPatch.status === 200, `Day patch: ${dayPatch.status}`);

  // ─── 14. NONEXISTENT DAY ──────────────────────────────────
  console.log("\n── 14. Error Handling ──");

  const badDay = await request("GET", "/api/days/nonexistent-uuid-12345", undefined, godCookie);
  assert(badDay.status === 404, `Nonexistent day returns 404: ${badDay.status}`);

  const badClose = await request("POST", "/api/days/nonexistent-uuid-12345/close", {}, godCookie);
  assert(badClose.status === 404 || badClose.status === 422, `Close nonexistent day returns error: ${badClose.status}`);

  const badReopen = await request("POST", "/api/days/nonexistent-uuid-12345/reopen", {}, godCookie);
  assert(badReopen.status === 404, `Reopen nonexistent day returns 404: ${badReopen.status}`);

  // ─── RESULTS ──────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("  FAILURES:");
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log("════════════════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
