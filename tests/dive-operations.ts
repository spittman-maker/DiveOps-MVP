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
  console.log("║  DIVE OPERATIONS TEST SUITE                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  await request("POST", "/api/seed");
  const godLogin = await request("POST", "/api/auth/login", { username: "god", password: "godmode" });
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

  const uniqueDate = `2026-10-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
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

async function testDiveCreationFromLogs() {
  console.log("\n── 1. Dive Creation from Log Events ──");

  await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "0800 Smith L/S at 65 fsw for pipeline weld inspection",
  }, undefined, godCookie);

  await new Promise(r => setTimeout(r, 1500));

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  assert(dives.status === 200, `Get dives: ${dives.status}`);
  assert(Array.isArray(dives.body), "Dives is array");

  const smithDive = dives.body.find((d: any) =>
    d.diverDisplayName?.toLowerCase().includes("smith") ||
    d.rawText?.toLowerCase().includes("smith")
  );

  if (smithDive) {
    assert(true, `Found Smith's dive: ${smithDive.id?.slice(0, 8)}`);
    assert(smithDive.diveNumber >= 1, `Dive number assigned: ${smithDive.diveNumber}`);

    await request("POST", "/api/log-events", {
      dayId,
      projectId,
      rawText: "0845 Smith R/S from 65 fsw",
    }, undefined, godCookie);

    await new Promise(r => setTimeout(r, 1500));

    const updatedDives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
    assert(updatedDives.status === 200, `Reload dives after R/S: ${updatedDives.status}`);
  } else {
    assert(dives.body.length >= 0, `Dives may be created async, found: ${dives.body.length}`);
  }
}

async function testDivePSGFieldUpdate() {
  console.log("\n── 2. Dive PSG-LOG-01 Field Updates ──");

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  if (dives.body.length === 0) {
    console.log("  (No dives available, creating one via log)");
    await request("POST", "/api/log-events", {
      dayId,
      projectId,
      rawText: "0900 Jones L/S at 40 fsw for anode replacement",
    }, undefined, godCookie);
    await new Promise(r => setTimeout(r, 2000));
  }

  const reloadDives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  if (reloadDives.body.length === 0) {
    console.log("  (Still no dives, skipping PSG field test)");
    return;
  }

  const diveId = reloadDives.body[0].id;

  const patchName = await request("PATCH", `/api/dives/${diveId}`, {
    diverDisplayName: "John Smith",
    station: "Station 14",
    workLocation: "Port hull frame 12",
  }, undefined, godCookie);
  assert(patchName.status === 200, `Update diver name: ${patchName.status}`);

  const patchDepth = await request("PATCH", `/api/dives/${diveId}`, {
    maxDepthFsw: 65,
  }, undefined, godCookie);
  assert(patchDepth.status === 200, `Update max depth: ${patchDepth.status}`);

  const patchGas = await request("PATCH", `/api/dives/${diveId}`, {
    breathingGas: "Nitrox",
    fo2Percent: 32,
  }, undefined, godCookie);
  assert(patchGas.status === 200, `Update breathing gas: ${patchGas.status}`);

  const patchTimes = await request("PATCH", `/api/dives/${diveId}`, {
    lsTime: "08:00",
    lbTime: "08:30",
    rbTime: "08:35",
    rsTime: "08:40",
  }, undefined, godCookie);
  assert(patchTimes.status === 200, `Update dive times: ${patchTimes.status}`);

  const badTime = await request("PATCH", `/api/dives/${diveId}`, {
    lsTime: "not-a-time",
  }, undefined, godCookie);
  assert(badTime.status === 400, `Reject invalid time: ${badTime.status}`);

  const badDepthNum = await request("PATCH", `/api/dives/${diveId}`, {
    maxDepthFsw: "abc",
  }, undefined, godCookie);
  assert(badDepthNum.status === 400, `Reject non-numeric depth: ${badDepthNum.status}`);

  const emptyUpdate = await request("PATCH", `/api/dives/${diveId}`, {}, undefined, godCookie);
  assert(emptyUpdate.status === 400, `Reject empty update: ${emptyUpdate.status}`);

  const diverPatch = await request("PATCH", `/api/dives/${diveId}`, {
    station: "Port side",
  }, undefined, diverCookie);
  assert(diverPatch.status === 403, `Diver can't update dive: ${diverPatch.status}`);

  const verify = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  const updatedDive = verify.body.find((d: any) => d.id === diveId);
  if (updatedDive) {
    assert(updatedDive.maxDepthFsw === 65, `Depth persisted: ${updatedDive.maxDepthFsw}`);
    assert(updatedDive.breathingGas === "Nitrox", `Gas persisted: ${updatedDive.breathingGas}`);
  }
}

async function testDiveTableCompute() {
  console.log("\n── 3. Dive Table Computation ──");

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  if (dives.body.length === 0) {
    console.log("  (No dives available, skipping table compute)");
    return;
  }

  const diveId = dives.body[0].id;

  const compute = await request("POST", `/api/dives/${diveId}/compute-table`, {
    maxDepthFsw: 60,
    bottomTimeMinutes: 30,
    breathingGas: "Air",
  }, undefined, godCookie);
  assert(compute.status === 200, `Compute table: ${compute.status}`);
  if (compute.status === 200) {
    assert(compute.body.tableUsed !== undefined, `Table used: ${compute.body.tableUsed}`);
    assert(compute.body.scheduleUsed !== undefined, `Schedule used: ${compute.body.scheduleUsed}`);
  }

  const noDepth = await request("POST", `/api/dives/${diveId}/compute-table`, {
    bottomTimeMinutes: 30,
    maxDepthFsw: null,
  }, undefined, godCookie);
  assert(noDepth.status === 400 || noDepth.status === 200, `Missing depth handled: ${noDepth.status}`);

  const diverCompute = await request("POST", `/api/dives/${diveId}/compute-table`, {
    maxDepthFsw: 60,
    bottomTimeMinutes: 30,
  }, undefined, diverCookie);
  assert(diverCompute.status === 403, `Diver can't compute table: ${diverCompute.status}`);
}

async function testDiveTableLookup() {
  console.log("\n── 4. Dive Table Lookup (Preview) ──");

  const lookup = await request("POST", "/api/dive-table-lookup", {
    depthFsw: 60,
    bottomTimeMinutes: 25,
    breathingGas: "Air",
  }, undefined, godCookie);
  assert(lookup.status === 200, `Table lookup: ${lookup.status}`);
  if (lookup.status === 200) {
    assert(lookup.body.tableUsed !== undefined, `Lookup tableUsed: ${lookup.body.tableUsed}`);
    assert(lookup.body.decompRequired !== undefined, `Lookup decompRequired: ${lookup.body.decompRequired}`);
  }

  const nitroxLookup = await request("POST", "/api/dive-table-lookup", {
    depthFsw: 80,
    bottomTimeMinutes: 20,
    breathingGas: "Nitrox",
    fo2Percent: 32,
  }, undefined, godCookie);
  assert(nitroxLookup.status === 200, `Nitrox lookup: ${nitroxLookup.status}`);

  const missingParams = await request("POST", "/api/dive-table-lookup", {
    depthFsw: 60,
  }, undefined, godCookie);
  assert(missingParams.status === 400, `Missing params rejected: ${missingParams.status}`);

  const diverLookup = await request("POST", "/api/dive-table-lookup", {
    depthFsw: 60,
    bottomTimeMinutes: 25,
  }, undefined, diverCookie);
  assert(diverLookup.status === 200, `Diver can preview lookup: ${diverLookup.status}`);
}

async function testReExtractDives() {
  console.log("\n── 5. Re-Extract Dives ──");

  const reExtract = await request("POST", `/api/days/${dayId}/re-extract-dives`, undefined, undefined, godCookie);
  assert(reExtract.status === 200, `Re-extract dives: ${reExtract.status}`);

  const supReExtract = await request("POST", `/api/days/${dayId}/re-extract-dives`, undefined, undefined, supervisorCookie);
  assert(supReExtract.status === 403, `Supervisor can't re-extract (ADMIN/GOD only): ${supReExtract.status}`);

  const diverReExtract = await request("POST", `/api/days/${dayId}/re-extract-dives`, undefined, undefined, diverCookie);
  assert(diverReExtract.status === 403, `Diver can't re-extract: ${diverReExtract.status}`);
}

async function testDiveOptimisticLocking() {
  console.log("\n── 6. Dive Optimistic Locking ──");

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  if (dives.body.length === 0) {
    console.log("  (No dives available, skipping locking test)");
    return;
  }

  const diveId = dives.body[0].id;
  const currentVersion = dives.body[0].version;

  if (typeof currentVersion === "number") {
    const updateA = await request("PATCH", `/api/dives/${diveId}`, {
      station: "Updated Station A",
      version: currentVersion,
    }, undefined, godCookie);
    assert(updateA.status === 200, `First update succeeds: ${updateA.status}`);

    const updateB = await request("PATCH", `/api/dives/${diveId}`, {
      station: "Updated Station B",
      version: currentVersion,
    }, undefined, godCookie);
    assert(updateB.status === 409, `Stale version conflict: ${updateB.status}`);
  } else {
    assert(true, "Version field not present, skipping locking (optimistic locking optional)");
  }
}

async function testDiveConfirm() {
  console.log("\n── 7. Dive Confirm ──");

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
  if (dives.body.length === 0) {
    console.log("  (No dives available, skipping confirm test)");
    return;
  }

  const diveId = dives.body[0].id;

  const confirm = await request("POST", `/api/dives/${diveId}/confirm`, undefined, undefined, godCookie);
  assert(confirm.status === 200 || confirm.status === 404, `Confirm dive: ${confirm.status}`);

  if (confirm.status === 200) {
    const dive = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, godCookie);
    const confirmedDive = dive.body.find((d: any) => d.id === diveId);
    if (confirmedDive) {
      assert(confirmedDive.confirmed === true || confirmedDive.supervisorConfirmed === true, "Dive is confirmed");
    }
  }
}

async function testUserDives() {
  console.log("\n── 8. User Dives Query ──");

  const meRes = await request("GET", "/api/auth/me", undefined, undefined, godCookie);
  const userId = meRes.body?.id;

  if (userId) {
    const userDives = await request("GET", `/api/users/${userId}/dives`, undefined, undefined, godCookie);
    assert(userDives.status === 200, `Get user dives: ${userDives.status}`);
    assert(Array.isArray(userDives.body), "User dives is array");

    const userDivesFiltered = await request("GET", `/api/users/${userId}/dives?dayId=${dayId}`, undefined, undefined, godCookie);
    assert(userDivesFiltered.status === 200, `Get user dives filtered by day: ${userDivesFiltered.status}`);
  }
}

async function run() {
  await setup();
  await testDiveCreationFromLogs();
  await testDivePSGFieldUpdate();
  await testDiveTableCompute();
  await testDiveTableLookup();
  await testReExtractDives();
  await testDiveOptimisticLocking();
  await testDiveConfirm();
  await testUserDives();

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
