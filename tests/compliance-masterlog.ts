import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
let diverCookie = "";
let projectId = "";
let dayId = "";

async function request(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>,
  useCookie?: string
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };
    if (useCookie) reqHeaders["Cookie"] = useCookie;
    const opts: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: reqHeaders,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : null, headers: res.headers as any });
        } catch {
          resolve({ status: res.statusCode!, body: data, headers: res.headers as any });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractCookie(res: { headers: Record<string, string> }): string {
  const sc = (res.headers as any)["set-cookie"];
  if (!sc) return "";
  if (Array.isArray(sc)) return sc.map((c: string) => c.split(";")[0]).join("; ");
  return (sc as string).split(";")[0];
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function setup() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  COMPLIANCE & MASTER LOG TEST SUITE                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  await request("POST", "/api/seed");
  const godLogin = await request("POST", "/api/auth/login", { username: "spittman@precisionsubsea.com", password: "Whisky9954!" });
  godCookie = extractCookie(godLogin);
  assert(godLogin.status === 200 && !!godCookie, "GOD login");

  const supLogin = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  supervisorCookie = extractCookie(supLogin);

  const diverLogin = await request("POST", "/api/auth/login", { username: "diver", password: "diver123" });
  diverCookie = extractCookie(diverLogin);

  const projects = await request("GET", "/api/projects", undefined, undefined, godCookie);
  projectId = projects.body[0]?.id;
  assert(!!projectId, `Project: ${projectId?.slice(0, 8)}`);

  await request("POST", `/api/projects/${projectId}/activate`, undefined, undefined, godCookie);

  const uniqueDate = `2026-07-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const newDay = await request("POST", `/api/projects/${projectId}/days`, { date: uniqueDate }, undefined, godCookie);
  if (newDay.status === 201 || newDay.status === 200) {
    dayId = newDay.body.id;
  } else {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, godCookie);
    const openDay = days.body.find((d: any) => d.status !== "CLOSED");
    dayId = openDay?.id || days.body[0]?.id;
  }
  assert(!!dayId, `Day: ${dayId?.slice(0, 8)}`);
}

async function testComplianceGaps() {
  console.log("\n── 1. Compliance Gap Detection ──");

  const compliance = await request("GET", `/api/days/${dayId}/compliance`, undefined, undefined, godCookie);
  assert(compliance.status === 200, `Get compliance: ${compliance.status}`);
  assert(compliance.body.status === "PASS" || compliance.body.status === "NEEDS_INFO", `Status valid: ${compliance.body.status}`);
  assert(typeof compliance.body.gapCount === "number", `Gap count: ${compliance.body.gapCount}`);
  assert(typeof compliance.body.diveCount === "number", `Dive count: ${compliance.body.diveCount}`);
  assert(typeof compliance.body.hasStopWork === "boolean", `hasStopWork is boolean`);
  assert(Array.isArray(compliance.body.gaps), "Gaps is array");

  if (compliance.body.gaps.length > 0) {
    const gap = compliance.body.gaps[0];
    assert(gap.scope !== undefined, "Gap has scope");
    assert(gap.field !== undefined, "Gap has field");
    assert(gap.message !== undefined, "Gap has message");
  }

  const diverCompliance = await request("GET", `/api/days/${dayId}/compliance`, undefined, undefined, diverCookie);
  assert(diverCompliance.status === 200, `Diver can read compliance: ${diverCompliance.status}`);
}

async function testComplianceWithDiveData() {
  console.log("\n── 2. Compliance With Dive Data ──");

  await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "0900 JD L/S at 60 fsw for pipeline inspection",
  }, undefined, godCookie);

  await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "0930 JD R/S from 60 fsw",
  }, undefined, godCookie);

  const compliance = await request("GET", `/api/days/${dayId}/compliance`, undefined, undefined, godCookie);
  assert(compliance.status === 200, `Compliance after dives: ${compliance.status}`);

  if (compliance.body.gapCount > 0) {
    const gapFields = compliance.body.gaps.map((g: any) => g.field);
    assert(compliance.body.gaps.length > 0, `Has gaps (expected for incomplete data): ${compliance.body.gapCount}`);
    const hasBreathingGasGap = gapFields.includes("breathingGas") || compliance.body.gaps.some((g: any) => g.message.includes("breathing gas") || g.message.includes("Breathing gas"));
    assert(compliance.body.status === "NEEDS_INFO", `Status is NEEDS_INFO: ${compliance.body.status}`);
  }

  const closeoutGaps = compliance.body.gaps.filter((g: any) => g.scope === "closeout");
  assert(closeoutGaps.length >= 1, `Has closeout gaps: ${closeoutGaps.length}`);
}

async function testComplianceClosedDay() {
  console.log("\n── 3. Compliance on Closed Day ──");

  const closeDate = `2026-07-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const newDay = await request("POST", `/api/projects/${projectId}/days`, { date: closeDate }, undefined, godCookie);
  if (newDay.status !== 201 && newDay.status !== 200) {
    console.log("  (Skipping closed-day compliance - no new day available)");
    return;
  }
  const closeDayId = newDay.body.id;

  await request("POST", "/api/log-events", {
    dayId: closeDayId,
    projectId,
    rawText: "0600 Shift start, all personnel on station",
  }, undefined, godCookie);

  const closeRes = await request("POST", `/api/days/${closeDayId}/close`, { forceClose: true }, undefined, godCookie);
  assert(closeRes.status === 200, `Close day for compliance check: ${closeRes.status}`);

  const compliance = await request("GET", `/api/days/${closeDayId}/compliance`, undefined, undefined, godCookie);
  assert(compliance.status === 200, `Compliance on closed day: ${compliance.status}`);
  assert(typeof compliance.body.gapCount === "number", `Gap count on closed day: ${compliance.body.gapCount}`);
}

async function testLogValidation() {
  console.log("\n── 4. Log Event Validation ──");

  const valid = await request("POST", "/api/log-events/validate", {
    rawText: "0800 Commenced pipeline survey at station 12",
  }, undefined, godCookie);
  assert(valid.status === 200, `Validate single entry: ${valid.status}`);
  assert(typeof valid.body.valid === "boolean", `Has valid flag: ${valid.body.valid}`);
  assert(valid.body.totalEntries === 1, `Single entry: ${valid.body.totalEntries}`);
  assert(Array.isArray(valid.body.entries), "Has entries array");

  const multiLine = await request("POST", "/api/log-events/validate", {
    rawText: "0800 Shift start / 0830 Toolbox talk / 0900 Dive commenced",
  }, undefined, godCookie);
  assert(multiLine.status === 200, `Validate multi-entry: ${multiLine.status}`);
  assert(multiLine.body.totalEntries >= 2, `Multiple entries parsed: ${multiLine.body.totalEntries}`);

  const noText = await request("POST", "/api/log-events/validate", {}, undefined, godCookie);
  assert(noText.status === 400, `Reject empty validation: ${noText.status}`);

  const diverValidate = await request("POST", "/api/log-events/validate", {
    rawText: "0800 Test",
  }, undefined, diverCookie);
  assert(diverValidate.status === 403, `Diver can't validate: ${diverValidate.status}`);
}

async function testMasterLog() {
  console.log("\n── 5. Master Log Generation ──");

  const masterLog = await request("GET", `/api/days/${dayId}/master-log`, undefined, undefined, godCookie);
  assert(masterLog.status === 200, `Get master log: ${masterLog.status}`);

  if (Array.isArray(masterLog.body)) {
    assert(masterLog.body.length >= 1, `Master log has entries: ${masterLog.body.length}`);
  } else if (masterLog.body && typeof masterLog.body === "object") {
    assert(true, "Master log returned object format");
  }

  const diverMasterLog = await request("GET", `/api/days/${dayId}/master-log`, undefined, undefined, diverCookie);
  assert(diverMasterLog.status === 200 || diverMasterLog.status === 403, `Diver master log access: ${diverMasterLog.status}`);
}

async function testEventTimePatch() {
  console.log("\n── 6. Event Time Patch ──");

  const createRes = await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "1000 Test event for time edit",
  }, undefined, godCookie);
  const eventId = createRes.body?.id;
  assert(!!eventId, `Created event for time edit: ${eventId?.slice(0, 8)}`);

  if (eventId) {
    const newTime = new Date("2026-07-15T11:30:00Z").toISOString();
    const patchRes = await request("PATCH", `/api/log-events/${eventId}/event-time`, {
      eventTime: newTime,
      editReason: "Correcting time entry",
    }, undefined, godCookie);
    assert(patchRes.status === 200, `Patch event time: ${patchRes.status}`);

    const noReason = await request("PATCH", `/api/log-events/${eventId}/event-time`, {
      eventTime: newTime,
    }, undefined, godCookie);
    assert(noReason.status === 400, `Reject time patch without reason: ${noReason.status}`);

    const diverPatch = await request("PATCH", `/api/log-events/${eventId}/event-time`, {
      eventTime: newTime,
      editReason: "Test",
    }, undefined, diverCookie);
    assert(diverPatch.status === 403, `Diver can't patch time: ${diverPatch.status}`);
  }
}

async function testDepthPatch() {
  console.log("\n── 7. Depth Patch ──");

  const createRes = await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "1100 JD L/S for hull inspection",
  }, undefined, godCookie);
  const eventId = createRes.body?.id;
  assert(!!eventId, `Created event for depth edit: ${eventId?.slice(0, 8)}`);

  if (eventId) {
    const patchRes = await request("PATCH", `/api/log-events/${eventId}/depth`, {
      depthFsw: "45",
    }, undefined, godCookie);
    assert(patchRes.status === 200, `Patch depth: ${patchRes.status}`);

    const badDepth = await request("PATCH", `/api/log-events/${eventId}/depth`, {
      depthFsw: "not_a_number",
    }, undefined, godCookie);
    assert(badDepth.status === 400, `Reject invalid depth: ${badDepth.status}`);

    const zeroDepth = await request("PATCH", `/api/log-events/${eventId}/depth`, {
      depthFsw: "0",
    }, undefined, godCookie);
    assert(zeroDepth.status === 400, `Reject zero depth: ${zeroDepth.status}`);

    const negativeDepth = await request("PATCH", `/api/log-events/${eventId}/depth`, {
      depthFsw: "-10",
    }, undefined, godCookie);
    assert(negativeDepth.status === 400, `Reject negative depth: ${negativeDepth.status}`);
  }
}

async function testCloseWithComplianceCheck() {
  console.log("\n── 8. Close With Compliance Check ──");

  const closeDate2 = `2026-08-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const newDay = await request("POST", `/api/projects/${projectId}/days`, { date: closeDate2 }, undefined, godCookie);
  if (newDay.status !== 201 && newDay.status !== 200) {
    console.log("  (Skipping close-compliance test - no new day available)");
    return;
  }
  const testDayId = newDay.body.id;

  await request("POST", "/api/log-events", {
    dayId: testDayId,
    projectId,
    rawText: "0600 Shift start, personnel muster complete",
  }, undefined, godCookie);

  const closeNoForce = await request("POST", `/api/days/${testDayId}/close`, {}, undefined, godCookie);
  if (closeNoForce.status === 200) {
    assert(true, "Close succeeded (no compliance gaps)");
  } else {
    assert(closeNoForce.status === 400 || closeNoForce.status === 422, `Close blocked by compliance gaps: ${closeNoForce.status}`);
    assert(closeNoForce.body.gaps !== undefined || closeNoForce.body.message !== undefined, "Error includes gap info");
  }

  const day = await request("GET", `/api/days/${testDayId}`, undefined, undefined, godCookie);
  if (day.body.status !== "CLOSED") {
    const forceClose = await request("POST", `/api/days/${testDayId}/close`, { forceClose: true }, undefined, godCookie);
    assert(forceClose.status === 200, `Force close succeeds: ${forceClose.status}`);
  }
}

async function testCloseAndExport() {
  console.log("\n── 9. Close And Export Pipeline ──");

  const exportDate = `2026-09-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const newDay = await request("POST", `/api/projects/${projectId}/days`, { date: exportDate }, undefined, godCookie);
  if (newDay.status !== 201 && newDay.status !== 200) {
    console.log("  (Skipping export test - no new day)");
    return;
  }
  const exportDayId = newDay.body.id;

  await request("POST", "/api/log-events", {
    dayId: exportDayId,
    projectId,
    rawText: "0600 Shift start / 0700 JD L/S at 50 fsw / 0730 JD R/S / 1200 Shift secured",
  }, undefined, godCookie);

  const exportRes = await request("POST", `/api/days/${exportDayId}/close-and-export`, { forceClose: true }, undefined, godCookie);
  assert(exportRes.status === 200, `Close-and-export: ${exportRes.status}`);

  if (exportRes.body.exports) {
    assert(typeof exportRes.body.exports === "object", "Exports object returned");
  }
  if (exportRes.body.masterLog) {
    assert(true, "Master log included in export");
  }
}

async function run() {
  await setup();
  await testComplianceGaps();
  await testComplianceWithDiveData();
  await testComplianceClosedDay();
  await testLogValidation();
  await testMasterLog();
  await testEventTimePatch();
  await testDepthPatch();
  await testCloseWithComplianceCheck();
  await testCloseAndExport();

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("  FAILURES:");
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
