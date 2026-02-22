import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
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

async function run() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  CORE WORKFLOW E2E TEST SUITE                                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("spittman@precisionsubsea.com", "Whisky9954!");
  supervisorCookie = await loginGetCookie("supervisor", "supervisor123");

  // ─── 1. CREATE PROJECT ───────────────────────────────────────────
  console.log("── 1. Project Creation ──");

  const proj = await request("POST", "/api/projects", {
    name: `Workflow Test ${Date.now()}`,
    clientName: "Test Client",
    jobsiteName: "Test Jobsite",
  }, godCookie);
  assert(proj.status === 201 || proj.status === 200, `Create project: ${proj.status}`);
  assert(!!proj.body?.id, "Project has ID");
  projectId = proj.body?.id;

  // ─── 2. CREATE/GET DAY ──────────────────────────────────────────
  console.log("\n── 2. Day Creation ──");

  const days = await request("GET", `/api/projects/${projectId}/days`, undefined, supervisorCookie);
  assert(days.status === 200, `Get days: ${days.status}`);
  if (Array.isArray(days.body) && days.body.length > 0) {
    dayId = days.body[0].id;
    assert(!!dayId, "Day auto-created on first access");
  } else {
    const newDay = await request("POST", `/api/projects/${projectId}/days`, {
      date: new Date().toISOString().split("T")[0],
      shift: "1",
    }, supervisorCookie);
    assert(newDay.status === 201 || newDay.status === 200, `Create day: ${newDay.status}`);
    dayId = newDay.body?.id;
  }
  assert(!!dayId, "Day ID obtained");

  const dayStatus = await request("GET", `/api/days/${dayId}/status`, undefined, supervisorCookie);
  assert(dayStatus.status === 200, `Day status endpoint: ${dayStatus.status}`);

  // ─── 3. CREATE LOG EVENTS ──────────────────────────────────────
  console.log("\n── 3. Log Event Creation ──");

  const logEntries = [
    "0615 All hands muster, toolbox talk completed. Weather clear, seas calm 1-2ft.",
    "0700 Diver JONES entered water at Station 1 for hull inspection. LS 0700.",
    "0730 Client rep SMITH directed: Extend inspection to include rudder assembly.",
    "0800 Diver JONES reports visibility 15ft, no significant marine growth on hull.",
    "0830 Risk identified: Overhead obstruction at frame 47, restricted egress path.",
    "0900 Diver JONES on bottom at 45 FSW. RB 0900.",
  ];

  const eventIds: string[] = [];
  for (const rawText of logEntries) {
    const ev = await request("POST", "/api/log-events", {
      rawText,
      dayId,
      projectId,
    }, supervisorCookie);
    assert(ev.status === 201 || ev.status === 200, `Log event created: "${rawText.substring(0, 40)}..."`);
    if (ev.body?.id) eventIds.push(ev.body.id);
  }
  assert(eventIds.length === logEntries.length, `All ${logEntries.length} events created (got ${eventIds.length})`);

  // ─── 4. VERIFY LOG EVENTS PERSISTED ───────────────────────────
  console.log("\n── 4. Log Event Retrieval ──");

  const allEvents = await request("GET", `/api/days/${dayId}/log-events`, undefined, supervisorCookie);
  assert(allEvents.status === 200, `Get log events: ${allEvents.status}`);
  assert(Array.isArray(allEvents.body), "Log events is array");
  const ourEvents = allEvents.body.filter((e: any) => eventIds.includes(e.id));
  assert(ourEvents.length === eventIds.length, `All ${eventIds.length} events retrievable (got ${ourEvents.length})`);

  for (const ev of ourEvents) {
    assert(typeof ev.rawText === "string" && ev.rawText.length > 0, `Event ${ev.id.substring(0, 8)} has rawText`);
    assert(ev.dayId === dayId, `Event ${ev.id.substring(0, 8)} belongs to correct day`);
    assert(ev.projectId === projectId, `Event ${ev.id.substring(0, 8)} belongs to correct project`);
  }

  // ─── 5. MASTER LOG GENERATION ─────────────────────────────────
  console.log("\n── 5. Master Log ──");

  const masterLog = await request("GET", `/api/days/${dayId}/master-log`, undefined, supervisorCookie);
  assert(masterLog.status === 200, `Master log endpoint: ${masterLog.status}`);
  assert(masterLog.body !== null, "Master log returns data");

  // ─── 6. DIVE EXTRACTION ───────────────────────────────────────
  console.log("\n── 6. Dive Data ──");

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, supervisorCookie);
  assert(dives.status === 200, `Dives endpoint: ${dives.status}`);
  assert(Array.isArray(dives.body), "Dives is array");

  // ─── 7. RISK ITEMS ────────────────────────────────────────────
  console.log("\n── 7. Risk Items ──");

  const risks = await request("GET", `/api/days/${dayId}/risks`, undefined, supervisorCookie);
  assert(risks.status === 200, `Risk items endpoint: ${risks.status}`);
  assert(Array.isArray(risks.body), "Risk items is array");

  const projectRisks = await request("GET", `/api/projects/${projectId}/risks`, undefined, supervisorCookie);
  assert(projectRisks.status === 200, `Project risks endpoint: ${projectRisks.status}`);
  assert(Array.isArray(projectRisks.body), "Project risks is array");

  // ─── 8. CLOSE AND EXPORT ──────────────────────────────────────
  console.log("\n── 8. Close and Export Pipeline ──");

  const closeResult = await request("POST", `/api/days/${dayId}/close-and-export`, {
    closeoutData: {
      scopeStatus: "Complete",
      documentationStatus: "All current",
      seiAdvisories: "None",
      standingRisks: "None open",
      deviations: "None",
      outstandingIssues: "None",
      nextShiftWork: "Continue hull inspection",
    },
  }, supervisorCookie);
  assert(closeResult.status === 200, `Close and export: ${closeResult.status}`);
  if (closeResult.body) {
    assert(closeResult.body.day !== undefined, "Close returns day object");
    if (closeResult.body.day) {
      assert(closeResult.body.day.status === "CLOSED", `Day status is CLOSED: ${closeResult.body.day?.status}`);
    }
  }

  // ─── 9. VERIFY CLOSED STATE ───────────────────────────────────
  console.log("\n── 9. Closed State Verification ──");

  const closedDay = await request("GET", `/api/days/${dayId}`, undefined, supervisorCookie);
  assert(closedDay.status === 200, `Get closed day: ${closedDay.status}`);
  assert(closedDay.body?.status === "CLOSED", `Day confirmed CLOSED: ${closedDay.body?.status}`);

  const exports = await request("GET", `/api/days/${dayId}/library-exports`, undefined, supervisorCookie);
  assert(exports.status === 200, `Library exports: ${exports.status}`);
  assert(Array.isArray(exports.body), "Exports is array");

  // ─── 10. RE-CLOSE IS IDEMPOTENT ───────────────────────────────
  console.log("\n── 10. Re-Close Idempotency ──");

  const reClose = await request("POST", `/api/days/${dayId}/close-and-export`, {}, supervisorCookie);
  assert(reClose.status === 200, `Re-close returns 200: ${reClose.status}`);
  if (reClose.body) {
    assert(reClose.body.alreadyClosed === true, `Re-close reports alreadyClosed: ${reClose.body.alreadyClosed}`);
  }

  // ─── 11. CLOSED DAY BLOCKS EDITS (non-GOD) ───────────────────
  console.log("\n── 11. Closed Day Edit Blocking ──");

  const blockedEvent = await request("POST", "/api/log-events", {
    rawText: "0930 This should be blocked",
    dayId,
    projectId,
  }, supervisorCookie);
  assert(blockedEvent.status === 403, `Supervisor blocked from writing to closed day: ${blockedEvent.status}`);

  // GOD can still write
  const godEvent = await request("POST", "/api/log-events", {
    rawText: "0930 GOD override entry on closed day",
    dayId,
    projectId,
  }, godCookie);
  assert(godEvent.status === 201 || godEvent.status === 200, `GOD can write to closed day: ${godEvent.status}`);

  // ─── 12. AUDIT TRAIL ─────────────────────────────────────────
  console.log("\n── 12. Audit Trail ──");

  const audits = await request("GET", "/api/audit-events", undefined, godCookie);
  assert(audits.status === 200, `Audit events: ${audits.status}`);
  assert(Array.isArray(audits.body), "Audit events is array");
  assert(audits.body.length > 0, "Audit events recorded during workflow");

  // ─── 13. DASHBOARD STATS ─────────────────────────────────────
  console.log("\n── 13. Dashboard Integration ──");

  const stats = await request("GET", "/api/dashboard/stats", undefined, supervisorCookie);
  assert(stats.status === 200, `Dashboard stats: ${stats.status}`);

  const recentLogs = await request("GET", "/api/dashboard/recent-logs", undefined, supervisorCookie);
  assert(recentLogs.status === 200, `Recent logs: ${recentLogs.status}`);

  // ─── RESULTS ──────────────────────────────────────────────────
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
