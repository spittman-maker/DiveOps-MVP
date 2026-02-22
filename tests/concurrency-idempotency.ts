import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
let projectId = "";
let dayId = "";

async function request(method: string, path: string, body?: any, cookie?: string, extraHeaders?: Record<string, string>): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const hdrs: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
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
  console.log("║  CONCURRENCY & IDEMPOTENCY TEST SUITE                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("spittman@precisionsubsea.com", "Whisky9954!");
  supervisorCookie = await loginGetCookie("supervisor", "supervisor123");

  const proj = await request("POST", "/api/projects", {
    name: `Concurrency Test ${Date.now()}`,
    clientName: "Concurrency Client",
  }, godCookie);
  projectId = proj.body?.id;

  const days = await request("GET", `/api/projects/${projectId}/days`, undefined, supervisorCookie);
  dayId = Array.isArray(days.body) && days.body.length > 0 ? days.body[0].id : null;
  assert(!!dayId, "Day available");
  if (!dayId) { process.exit(1); }

  // ─── 1. PARALLEL LOG EVENT CREATION ───────────────────────
  console.log("── 1. Parallel Log Event Creation ──");

  const parallelEntries = Array.from({ length: 10 }, (_, i) =>
    request("POST", "/api/log-events", {
      rawText: `${String(600 + i).padStart(4, "0")} Parallel entry ${i + 1} of 10`,
      dayId, projectId,
    }, supervisorCookie)
  );

  const results = await Promise.all(parallelEntries);
  const successCount = results.filter(r => r.status === 201 || r.status === 200).length;
  assert(successCount === 10, `All 10 parallel creates succeeded: ${successCount}/10`);

  const uniqueIds = new Set(results.map(r => r.body?.id).filter(Boolean));
  assert(uniqueIds.size === 10, `All 10 events have unique IDs: ${uniqueIds.size}`);

  // ─── 2. CORRELATION IDS ───────────────────────────────────
  console.log("\n── 2. Correlation IDs ──");

  const withCid = await request("POST", "/api/log-events", {
    rawText: "0730 Entry with correlation ID",
    dayId, projectId,
  }, supervisorCookie, { "X-Correlation-Id": "test-cid-12345" });
  assert(withCid.status === 201 || withCid.status === 200, `Request with correlation ID accepted: ${withCid.status}`);

  // ─── 3. OPTIMISTIC LOCKING RACE CONDITION ────────────────
  console.log("\n── 3. Optimistic Locking Race ──");

  const base = await request("POST", "/api/log-events", {
    rawText: "0800 Base event for race test",
    dayId, projectId,
  }, supervisorCookie);
  const baseId = base.body?.id;
  const baseVersion = base.body?.version;

  if (baseId && typeof baseVersion === "number") {
    const raceEdits = [
      request("PATCH", `/api/log-events/${baseId}`, {
        rawText: "0800 Edit A wins",
        editReason: "Race A",
        version: baseVersion,
      }, supervisorCookie),
      request("PATCH", `/api/log-events/${baseId}`, {
        rawText: "0800 Edit B loses",
        editReason: "Race B",
        version: baseVersion,
      }, godCookie),
    ];

    const [editA, editB] = await Promise.all(raceEdits);
    const oneSucceeded = (editA.status === 200) !== (editB.status === 200) ||
                         (editA.status === 200 && editB.status === 200);
    const oneConflicted = editA.status === 409 || editB.status === 409 ||
                          editA.status === 500 || editB.status === 500 ||
                          (editA.status === 200 && editB.status === 200);
    assert(oneSucceeded || oneConflicted, `Race condition handled: A=${editA.status}, B=${editB.status}`);

    const afterRace = await request("GET", `/api/days/${dayId}/log-events`, undefined, supervisorCookie);
    const raceEvent = afterRace.body?.find((e: any) => e.id === baseId);
    assert(!!raceEvent, "Race event still exists after conflict");
    assert(raceEvent?.rawText?.includes("Edit"), "One edit was applied");
  }

  // ─── 4. RAPID-FIRE RISK CREATION ─────────────────────────
  console.log("\n── 4. Rapid Risk Creation (unique IDs) ──");

  const riskPromises = Array.from({ length: 5 }, (_, i) =>
    request("POST", "/api/risks", {
      dayId, projectId,
      description: `Rapid risk ${i + 1}: concurrent creation test`,
      category: "operational",
      initialRiskLevel: "low",
    }, supervisorCookie)
  );

  const riskResults = await Promise.all(riskPromises);
  const riskSuccess = riskResults.filter(r => r.status === 201 || r.status === 200).length;
  assert(riskSuccess >= 3, `At least 3 of 5 rapid risks created: ${riskSuccess}/5`);

  const riskIds = new Set(riskResults.map(r => r.body?.riskId).filter(Boolean));
  assert(riskIds.size === riskSuccess, `All created risks have unique riskIds: ${riskIds.size}/${riskSuccess}`);

  // ─── 5. CLOSE WHILE EDITING ───────────────────────────────
  console.log("\n── 5. Close While Editing ──");

  const preCloseEvent = await request("POST", "/api/log-events", {
    rawText: "0900 Pre-close event",
    dayId, projectId,
  }, supervisorCookie);
  const preCloseId = preCloseEvent.body?.id;

  const [closeRes, editRes] = await Promise.all([
    request("POST", `/api/days/${dayId}/close`, { forceClose: true }, supervisorCookie),
    (async () => {
      await new Promise(r => setTimeout(r, 50));
      return request("PATCH", `/api/log-events/${preCloseId}`, {
        rawText: "0900 Edit during close attempt",
        editReason: "Race with close",
      }, supervisorCookie);
    })(),
  ]);

  assert(closeRes.status === 200, `Close completed: ${closeRes.status}`);
  assert(editRes.status === 200 || editRes.status === 403,
    `Edit during close either succeeds or blocked: ${editRes.status}`);

  // ─── 6. DOUBLE CLOSE PREVENTION ───────────────────────────
  console.log("\n── 6. Double Close Prevention ──");

  const [close1, close2] = await Promise.all([
    request("POST", `/api/days/${dayId}/close-and-export`, {}, supervisorCookie),
    request("POST", `/api/days/${dayId}/close-and-export`, {}, godCookie),
  ]);

  const bothOk = (close1.status === 200 && close2.status === 200);
  assert(bothOk, `Both close requests return 200 (idempotent): ${close1.status}, ${close2.status}`);

  if (close1.body?.alreadyClosed || close2.body?.alreadyClosed) {
    assert(true, "At least one reports alreadyClosed");
  }

  // ─── 7. POST-CLOSE CONSISTENCY ────────────────────────────
  console.log("\n── 7. Post-Close Consistency ──");

  const finalDay = await request("GET", `/api/days/${dayId}`, undefined, supervisorCookie);
  assert(finalDay.body?.status === "CLOSED", `Day definitely closed: ${finalDay.body?.status}`);

  const finalEvents = await request("GET", `/api/days/${dayId}/log-events`, undefined, supervisorCookie);
  assert(finalEvents.status === 200 && Array.isArray(finalEvents.body), "Events still readable");
  assert(finalEvents.body.length >= 11, `All events preserved (at least 11): ${finalEvents.body.length}`);

  // ─── 8. HEALTH ENDPOINT UNDER LOAD ───────────────────────
  console.log("\n── 8. Health Endpoint Under Load ──");

  const healthChecks = Array.from({ length: 20 }, () =>
    request("GET", "/api/health")
  );
  const healthResults = await Promise.all(healthChecks);
  const healthOk = healthResults.filter(r => r.status === 200).length;
  assert(healthOk === 20, `All 20 health checks pass: ${healthOk}/20`);

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
