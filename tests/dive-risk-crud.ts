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
  console.log("║  DIVE EXTRACTION & RISK REGISTER CRUD TEST SUITE             ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  await request("POST", "/api/seed");
  godCookie = await loginGetCookie("spittman@precisionsubsea.com", "Whisky9954!");
  supervisorCookie = await loginGetCookie("supervisor", "supervisor123");

  const proj = await request("POST", "/api/projects", {
    name: `DiveRisk Test ${Date.now()}`,
    clientName: "DiveRisk Client",
  }, godCookie);
  projectId = proj.body?.id;

  const days = await request("GET", `/api/projects/${projectId}/days`, undefined, supervisorCookie);
  dayId = Array.isArray(days.body) && days.body.length > 0 ? days.body[0].id : null;
  assert(!!dayId, "Day available");
  if (!dayId) { process.exit(1); }

  // ─── 1. CREATE DIVE-RELATED LOG EVENTS ────────────────────
  console.log("── 1. Dive-Related Log Events ──");

  const diveEntries = [
    "0700 Diver JOHNSON entered water at Station 1. LS 0700.",
    "0715 Diver JOHNSON on bottom at 35 FSW.",
    "0800 Diver JOHNSON reports debris field at grid B4. Visibility 10ft.",
    "0830 Diver JOHNSON left bottom. LB 0830.",
    "0845 Diver JOHNSON on surface. RS 0845.",
    "0900 Diver WILLIAMS entered water at Station 2. LS 0900.",
    "0930 Diver WILLIAMS on bottom at 42 FSW.",
  ];

  for (const rawText of diveEntries) {
    const ev = await request("POST", "/api/log-events", { rawText, dayId, projectId }, supervisorCookie);
    assert(ev.status === 201 || ev.status === 200, `Dive event logged: ${rawText.substring(0, 35)}...`);
  }

  // ─── 2. RETRIEVE DIVES ────────────────────────────────────
  console.log("\n── 2. Dive Retrieval ──");

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, supervisorCookie);
  assert(dives.status === 200, `Get dives: ${dives.status}`);
  assert(Array.isArray(dives.body), "Dives is array");

  if (dives.body.length > 0) {
    const dive = dives.body[0];
    assert(typeof dive.id === "string", "Dive has ID");
    assert(typeof dive.dayId === "string", "Dive has dayId");

    // ─── 3. UPDATE DIVE ────────────────────────────────────
    console.log("\n── 3. Dive Update ──");

    const diveUpdate = await request("PATCH", `/api/dives/${dive.id}`, {
      maxDepthFsw: 45,
      bottomTime: 30,
    }, supervisorCookie);
    assert(diveUpdate.status === 200, `Update dive: ${diveUpdate.status}`);

    // ─── 4. DIVE DETAILS ───────────────────────────────────
    console.log("\n── 4. Dive Details ──");

    const details = await request("GET", `/api/dives/${dive.id}/details`, undefined, supervisorCookie);
    assert(details.status === 200 || details.status === 404, `Dive details: ${details.status}`);

    // ─── 5. RE-EXTRACT DIVES ───────────────────────────────
    console.log("\n── 5. Re-Extract Dives ──");

    const reExtract = await request("POST", `/api/days/${dayId}/re-extract-dives`, {}, supervisorCookie);
    assert(reExtract.status === 200, `Re-extract dives: ${reExtract.status}`);
  }

  // ─── 6. CREATE RISK ITEMS ────────────────────────────────
  console.log("\n── 6. Risk Creation ──");

  const risk1 = await request("POST", "/api/risks", {
    dayId,
    projectId,
    description: "Overhead obstruction at frame 47 restricting diver egress",
    category: "safety",
    initialRiskLevel: "high",
    affectedTask: "Hull inspection",
    owner: "Dive Supervisor",
  }, supervisorCookie);
  assert(risk1.status === 201 || risk1.status === 200, `Create risk: ${risk1.status}`);
  const riskId = risk1.body?.id;
  assert(!!riskId, "Risk has ID");
  assert(!!risk1.body?.riskId, `Risk has formatted riskId: ${risk1.body?.riskId}`);
  assert(risk1.body?.status === "open", `Risk status is open: ${risk1.body?.status}`);
  assert(risk1.body?.description?.includes("frame 47"), "Risk description preserved");

  const risk2 = await request("POST", "/api/risks", {
    dayId,
    projectId,
    description: "Strong current detected at Station 2, exceeding 1.5 knots",
    category: "environmental",
    initialRiskLevel: "med",
    owner: "Dive Supervisor",
  }, supervisorCookie);
  assert(risk2.status === 201 || risk2.status === 200, `Create second risk: ${risk2.status}`);
  assert(risk2.body?.riskId !== risk1.body?.riskId, "Risk IDs are unique");

  // ─── 7. RETRIEVE RISKS ───────────────────────────────────
  console.log("\n── 7. Risk Retrieval ──");

  const dayRisks = await request("GET", `/api/days/${dayId}/risks`, undefined, supervisorCookie);
  assert(dayRisks.status === 200, `Get day risks: ${dayRisks.status}`);
  assert(Array.isArray(dayRisks.body), "Day risks is array");
  assert(dayRisks.body.length >= 2, `At least 2 risks on day: ${dayRisks.body.length}`);

  const projRisks = await request("GET", `/api/projects/${projectId}/risks`, undefined, supervisorCookie);
  assert(projRisks.status === 200, `Get project risks: ${projRisks.status}`);
  assert(Array.isArray(projRisks.body), "Project risks is array");

  const singleRisk = await request("GET", `/api/risks/${riskId}`, undefined, supervisorCookie);
  assert(singleRisk.status === 200, `Get single risk: ${singleRisk.status}`);
  assert(singleRisk.body?.id === riskId, "Single risk ID matches");

  // ─── 8. UPDATE RISK ──────────────────────────────────────
  console.log("\n── 8. Risk Update ──");

  if (riskId) {
    const mitigate = await request("PATCH", `/api/risks/${riskId}`, {
      status: "mitigated",
      mitigation: "Installed guide wire and secondary egress route marked",
      editReason: "Mitigation implemented",
    }, supervisorCookie);
    assert(mitigate.status === 200, `Mitigate risk: ${mitigate.status}`);
    assert(mitigate.body?.status === "mitigated", `Risk status updated: ${mitigate.body?.status}`);
    assert(mitigate.body?.mitigation?.includes("guide wire"), "Mitigation text preserved");

    const close = await request("PATCH", `/api/risks/${riskId}`, {
      status: "closed",
      closureAuthority: "Dive Supervisor",
      editReason: "Risk resolved after inspection",
    }, supervisorCookie);
    assert(close.status === 200, `Close risk: ${close.status}`);
    assert(close.body?.status === "closed", `Risk closed: ${close.body?.status}`);
  }

  // ─── 9. RISK VALIDATION ──────────────────────────────────
  console.log("\n── 9. Risk Validation ──");

  const noDesc = await request("POST", "/api/risks", {
    dayId, projectId,
  }, supervisorCookie);
  assert(noDesc.status >= 400, `Risk without description rejected: ${noDesc.status}`);

  const noDayId = await request("POST", "/api/risks", {
    projectId,
    description: "Missing dayId",
  }, supervisorCookie);
  assert(noDayId.status >= 400, `Risk without dayId rejected: ${noDayId.status}`);

  const updateNoReason = await request("PATCH", `/api/risks/${riskId}`, {
    status: "open",
  }, supervisorCookie);
  assert(updateNoReason.status >= 400, `Risk update without editReason rejected: ${updateNoReason.status}`);

  // ─── 10. NONEXISTENT RISK ────────────────────────────────
  console.log("\n── 10. Error Handling ──");

  const badRisk = await request("GET", "/api/risks/nonexistent-uuid", undefined, supervisorCookie);
  assert(badRisk.status === 404, `Nonexistent risk: ${badRisk.status}`);

  const badUpdate = await request("PATCH", "/api/risks/nonexistent-uuid", {
    status: "closed",
    editReason: "test",
  }, supervisorCookie);
  assert(badUpdate.status === 404, `Update nonexistent risk: ${badUpdate.status}`);

  // ─── 11. RISK FIELD INTEGRITY ─────────────────────────────
  console.log("\n── 11. Risk Field Integrity ──");

  const allRisks = await request("GET", `/api/days/${dayId}/risks`, undefined, supervisorCookie);
  for (const r of allRisks.body) {
    assert(typeof r.id === "string", `Risk ${r.riskId || r.id?.substring(0, 8)} has string id`);
    assert(typeof r.riskId === "string", `Risk ${r.riskId} has formatted riskId`);
    assert(typeof r.description === "string", `Risk ${r.riskId} has description`);
    assert(["open", "mitigated", "closed"].includes(r.status), `Risk ${r.riskId} has valid status: ${r.status}`);
    assert(r.dayId === dayId, `Risk ${r.riskId} belongs to correct day`);
    assert(r.projectId === projectId, `Risk ${r.riskId} belongs to correct project`);
  }

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
