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
  console.log("║  LOG EVENT CRUD & OPTIMISTIC LOCKING TEST SUITE              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("spittman@precisionsubsea.com", "Whisky9954!");
  supervisorCookie = await loginGetCookie("supervisor", "supervisor123");

  const proj = await request("POST", "/api/projects", {
    name: `LogEvent Test ${Date.now()}`,
    clientName: "LogEvent Client",
  }, godCookie);
  projectId = proj.body?.id;
  assert(!!projectId, "Project created");

  const days = await request("GET", `/api/projects/${projectId}/days`, undefined, supervisorCookie);
  dayId = Array.isArray(days.body) && days.body.length > 0 ? days.body[0].id : null;
  assert(!!dayId, "Day available");
  if (!dayId) { process.exit(1); }

  // ─── 1. CREATE LOG EVENT ──────────────────────────────────
  console.log("── 1. Create Log Events ──");

  const ev1 = await request("POST", "/api/log-events", {
    rawText: "0700 Diver SMITH entered water for inspection",
    dayId, projectId,
  }, supervisorCookie);
  assert(ev1.status === 201 || ev1.status === 200, `Event created: ${ev1.status}`);
  const eventId = ev1.body?.id;
  assert(!!eventId, "Event has ID");
  assert(ev1.body?.rawText?.includes("SMITH"), "Event rawText preserved");
  assert(ev1.body?.dayId === dayId, "Event dayId correct");
  assert(ev1.body?.projectId === projectId, "Event projectId correct");

  // ─── 2. EVENT WITH STATION ────────────────────────────────
  console.log("\n── 2. Event with Station ──");

  const evStation = await request("POST", "/api/log-events", {
    rawText: "0715 Visibility check at station 1",
    dayId, projectId,
    station: "Station 1",
  }, supervisorCookie);
  assert(evStation.status === 201 || evStation.status === 200, `Station event: ${evStation.status}`);
  assert(evStation.body?.station === "Station 1", `Station preserved: ${evStation.body?.station}`);

  // ─── 3. EVENT WITH TIME OVERRIDE ──────────────────────────
  console.log("\n── 3. Event with Time Override ──");

  const pastTime = new Date();
  pastTime.setHours(pastTime.getHours() - 2);
  const evOverride = await request("POST", "/api/log-events", {
    rawText: "0500 Pre-dawn equipment check",
    dayId, projectId,
    eventTimeOverride: pastTime.toISOString(),
  }, supervisorCookie);
  assert(evOverride.status === 201 || evOverride.status === 200, `Time override event: ${evOverride.status}`);

  // ─── 4. VALIDATION ────────────────────────────────────────
  console.log("\n── 4. Input Validation ──");

  const emptyText = await request("POST", "/api/log-events", {
    rawText: "",
    dayId, projectId,
  }, supervisorCookie);
  assert(emptyText.status >= 400, `Empty rawText rejected: ${emptyText.status}`);

  const missingDay = await request("POST", "/api/log-events", {
    rawText: "0800 Missing dayId",
    projectId,
  }, supervisorCookie);
  assert(missingDay.status >= 400, `Missing dayId rejected: ${missingDay.status}`);

  const missingProject = await request("POST", "/api/log-events", {
    rawText: "0800 Missing projectId",
    dayId,
  }, supervisorCookie);
  assert(missingProject.status >= 400, `Missing projectId rejected: ${missingProject.status}`);

  // ─── 5. EDIT LOG EVENT ────────────────────────────────────
  console.log("\n── 5. Edit Log Event ──");

  if (eventId) {
    const edit = await request("PATCH", `/api/log-events/${eventId}`, {
      rawText: "0700 Diver SMITH entered water for hull inspection - CORRECTED",
      editReason: "Added detail",
      version: ev1.body?.version || 1,
    }, supervisorCookie);
    assert(edit.status === 200, `Edit event: ${edit.status}`);
    assert(edit.body?.rawText?.includes("CORRECTED"), "Edit applied correctly");

    const newVersion = edit.body?.version;
    assert(typeof newVersion === "number" && newVersion > (ev1.body?.version || 1), `Version incremented: ${newVersion}`);

    // ─── 6. OPTIMISTIC LOCKING - VERSION CONFLICT ───────────
    console.log("\n── 6. Optimistic Locking ──");

    const staleEdit = await request("PATCH", `/api/log-events/${eventId}`, {
      rawText: "0700 Stale edit should fail",
      editReason: "Stale version",
      version: ev1.body?.version || 1,
    }, supervisorCookie);
    assert(staleEdit.status === 409 || staleEdit.status === 500 || staleEdit.body?.message?.includes("VERSION_CONFLICT"),
      `Stale version rejected (${staleEdit.status}): ${staleEdit.body?.message || ""}`);

    // ─── 7. EDIT WITH CORRECT VERSION ────────────────────────
    console.log("\n── 7. Edit with Correct Version ──");

    const goodEdit = await request("PATCH", `/api/log-events/${eventId}`, {
      rawText: "0700 Diver SMITH entered water for hull inspection - FINAL",
      editReason: "Final correction",
      version: newVersion,
    }, supervisorCookie);
    assert(goodEdit.status === 200, `Correct version edit succeeds: ${goodEdit.status}`);
  }

  // ─── 8. EDIT EVENT TIME ───────────────────────────────────
  console.log("\n── 8. Edit Event Time ──");

  if (eventId) {
    const newTime = new Date();
    newTime.setHours(8, 30, 0, 0);
    const timeEdit = await request("PATCH", `/api/log-events/${eventId}/event-time`, {
      eventTime: newTime.toISOString(),
      editReason: "Corrected timestamp",
    }, supervisorCookie);
    assert(timeEdit.status === 200, `Event time edit: ${timeEdit.status}`);
  }

  // ─── 9. EDIT WITHOUT REASON ───────────────────────────────
  console.log("\n── 9. Edit Requires Reason ──");

  if (eventId) {
    const noReason = await request("PATCH", `/api/log-events/${eventId}/event-time`, {
      eventTime: new Date().toISOString(),
    }, supervisorCookie);
    assert(noReason.status >= 400, `Edit without reason rejected: ${noReason.status}`);
  }

  // ─── 10. RETRIEVE EVENTS ─────────────────────────────────
  console.log("\n── 10. Event Retrieval ──");

  const allEvents = await request("GET", `/api/days/${dayId}/log-events`, undefined, supervisorCookie);
  assert(allEvents.status === 200, `Get all events: ${allEvents.status}`);
  assert(Array.isArray(allEvents.body), "Events is array");
  assert(allEvents.body.length >= 3, `At least 3 events created: ${allEvents.body.length}`);

  for (const ev of allEvents.body) {
    assert(typeof ev.id === "string", `Event ${ev.id?.substring(0, 8)} has string ID`);
    assert(typeof ev.rawText === "string", `Event ${ev.id?.substring(0, 8)} has rawText`);
    assert(typeof ev.version === "number", `Event ${ev.id?.substring(0, 8)} has version number`);
  }

  // ─── 11. RETRY RENDER ─────────────────────────────────────
  console.log("\n── 11. Retry AI Render ──");

  if (eventId) {
    const retry = await request("POST", `/api/log-events/${eventId}/retry-render`, {}, supervisorCookie);
    assert(retry.status === 200 || retry.status === 202, `Retry render: ${retry.status}`);
  }

  // ─── 12. VALIDATE ENDPOINT ────────────────────────────────
  console.log("\n── 12. Validate Endpoint ──");

  const validate = await request("POST", "/api/log-events/validate", {
    rawText: "0900 Test validation entry for checking",
    dayId, projectId,
  }, supervisorCookie);
  assert(validate.status === 200, `Validate endpoint: ${validate.status}`);

  // ─── 13. EDIT ON CLOSED DAY ───────────────────────────────
  console.log("\n── 13. Edit on Closed Day ──");

  const closeDay = await request("POST", `/api/days/${dayId}/close`, {
    forceClose: true,
  }, supervisorCookie);
  assert(closeDay.status === 200, `Close day for edit test: ${closeDay.status}`);

  if (eventId) {
    const closedEdit = await request("PATCH", `/api/log-events/${eventId}`, {
      rawText: "Supervisor edit on closed day should fail",
      editReason: "Test",
    }, supervisorCookie);
    assert(closedEdit.status === 403, `Supervisor cannot edit on closed day: ${closedEdit.status}`);

    const godEdit = await request("PATCH", `/api/log-events/${eventId}`, {
      rawText: "GOD can edit on closed day",
      editReason: "GOD override",
    }, godCookie);
    assert(godEdit.status === 200, `GOD can edit on closed day: ${godEdit.status}`);
  }

  // ─── 14. NONEXISTENT EVENT ────────────────────────────────
  console.log("\n── 14. Error Handling ──");

  const badEvent = await request("PATCH", "/api/log-events/nonexistent-uuid", {
    rawText: "test",
    editReason: "test",
  }, godCookie);
  assert(badEvent.status === 404, `Edit nonexistent event: ${badEvent.status}`);

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
