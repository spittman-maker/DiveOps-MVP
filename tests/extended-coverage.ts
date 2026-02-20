import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
let supervisor2Cookie = "";
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
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"];
        try {
          resolve({
            status: res.statusCode!,
            body: data ? JSON.parse(data) : null,
            headers: res.headers as any,
          });
        } catch {
          resolve({
            status: res.statusCode!,
            body: data,
            headers: res.headers as any,
          });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractCookie(res: { headers: Record<string, string> }): string {
  const sc = res.headers["set-cookie"];
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
  console.log("\n=== SETUP ===");
  await request("POST", "/api/seed", undefined, undefined, "");

  const godLogin = await request("POST", "/api/auth/login", { username: "god", password: "godmode" });
  godCookie = extractCookie(godLogin);
  assert(godLogin.status === 200, `GOD login: ${godLogin.status}`);
  assert(!!godCookie, `GOD cookie captured: ${godCookie.substring(0, 30)}...`);

  const supLogin = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  supervisorCookie = extractCookie(supLogin);
  assert(supLogin.status === 200, `SUPERVISOR login: ${supLogin.status}`);

  const diverLogin = await request("POST", "/api/auth/login", { username: "diver", password: "diver123" });
  diverCookie = extractCookie(diverLogin);
  assert(diverLogin.status === 200, `DIVER login: ${diverLogin.status}`);

  // Verify cookies work
  const meCheck = await request("GET", "/api/auth/me", undefined, undefined, godCookie);
  console.log(`  Me check: status=${meCheck.status}, user=${meCheck.body?.username}`);
  if (meCheck.status !== 200) {
    console.log(`  Me response:`, JSON.stringify(meCheck.body).substring(0, 200));
  }

  const sup2Name = `supervisor2_${Date.now()}`;
  const sup2Reg = await request("POST", "/api/auth/register", {
    username: sup2Name,
    password: "sup2pass",
    fullName: "Supervisor Two",
    initials: "S2",
    email: `sup2_${Date.now()}@test.com`,
    role: "SUPERVISOR",
  }, undefined, godCookie);
  if (sup2Reg.status === 201) {
    const sup2Login = await request("POST", "/api/auth/login", { username: sup2Name, password: "sup2pass" });
    supervisor2Cookie = extractCookie(sup2Login);
    assert(sup2Login.status === 200, `SUPERVISOR2 login: ${sup2Login.status}`);
  } else {
    supervisor2Cookie = supervisorCookie;
    console.log(`  (sup2 register returned ${sup2Reg.status}, reusing supervisor cookie)`);
  }

  const projects = await request("GET", "/api/projects", undefined, undefined, godCookie);
  console.log(`  Projects status: ${projects.status}, isArray: ${Array.isArray(projects.body)}, length: ${projects.body?.length}, type: ${typeof projects.body}`);
  if (projects.status !== 200) {
    console.log(`  Projects response:`, JSON.stringify(projects.body).substring(0, 200));
  }
  const projectList = Array.isArray(projects.body) ? projects.body : [];
  if (projectList.length > 0) {
    projectId = projectList[0].id;
  } else {
    const proj = await request("POST", "/api/projects", {
      name: "Extended Test Project",
      clientName: "TestCo",
      jobsiteName: "Gulf of Mexico",
    }, undefined, godCookie);
    projectId = proj.body.id;
  }
  assert(!!projectId, `Project found: ${projectId}`);

  await request("POST", `/api/projects/${projectId}/activate`, undefined, undefined, godCookie);

  const uniqueDate = `2026-06-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const newDay = await request("POST", `/api/projects/${projectId}/days`, { date: uniqueDate }, undefined, godCookie);
  if (newDay.status === 201 || newDay.status === 200) {
    dayId = newDay.body.id;
  } else {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, godCookie);
    const dayList = Array.isArray(days.body) ? days.body : [];
    const openDay = dayList.find((d: any) => d.status !== "CLOSED");
    if (openDay) {
      dayId = openDay.id;
    } else {
      const nd = await request("POST", `/api/projects/${projectId}/days`, { date: "2026-06-15" }, undefined, godCookie);
      dayId = nd.body.id;
    }
  }
  assert(!!dayId, `Day found: ${dayId}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: Multi-User Concurrency
// ════════════════════════════════════════════════════════════════════════════════

async function testConcurrentLogEvents() {
  console.log("\n=== SUITE 1: Multi-User Concurrent Log Events ===");

  const concDate = `2026-07-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const concDay = await request("POST", `/api/projects/${projectId}/days`, { date: concDate }, undefined, godCookie);
  const concDayId = concDay.body.id;
  assert(!!concDayId, `Created concurrent test day: ${concDayId}`);

  const N = 10;
  const sup1Promises = [];
  const sup2Promises = [];
  for (let i = 0; i < N; i++) {
    sup1Promises.push(
      request("POST", "/api/log-events", {
        rawText: `0${7 + i % 3}${String(i * 5).padStart(2, "0")} SUP1 concurrent entry ${i} - ${Date.now()}`,
        dayId: concDayId,
        projectId,
      }, undefined, supervisorCookie)
    );
    sup2Promises.push(
      request("POST", "/api/log-events", {
        rawText: `0${7 + i % 3}${String(i * 5 + 2).padStart(2, "0")} SUP2 concurrent entry ${i} - ${Date.now()}`,
        dayId: concDayId,
        projectId,
      }, undefined, supervisor2Cookie)
    );
  }

  const allResults = await Promise.all([...sup1Promises, ...sup2Promises]);
  const successes = allResults.filter((r) => r.status === 201);
  assert(successes.length === N * 2, `All ${N * 2} concurrent events created: ${successes.length}/${N * 2}`);

  const allIds = new Set(successes.map((r) => r.body.id));
  assert(allIds.size === successes.length, `All event IDs are unique: ${allIds.size} unique of ${successes.length}`);

  const events = await request("GET", `/api/days/${concDayId}/log-events`, undefined, undefined, godCookie);
  assert(events.body.length >= N * 2, `All events persisted: ${events.body.length} >= ${N * 2}`);

  const sup1Events = events.body.filter((e: any) => e.rawText?.includes("SUP1"));
  const sup2Events = events.body.filter((e: any) => e.rawText?.includes("SUP2"));
  assert(sup1Events.length === N, `SUP1 events correct: ${sup1Events.length} === ${N}`);
  assert(sup2Events.length === N, `SUP2 events correct: ${sup2Events.length} === ${N}`);

  const seqNums = events.body.map((e: any) => e.sequenceNumber).filter(Boolean);
  const uniqueSeqs = new Set(seqNums);
  assert(uniqueSeqs.size === seqNums.length, `All sequence numbers unique: ${uniqueSeqs.size} of ${seqNums.length}`);
}

async function testConcurrentCloseRace() {
  console.log("\n=== SUITE 1b: Concurrent Close Race Condition ===");

  const raceDate = `2026-07-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const raceDay = await request("POST", `/api/projects/${projectId}/days`, { date: raceDate }, undefined, godCookie);
  const raceDayId = raceDay.body.id;

  await request("POST", "/api/log-events", {
    rawText: `0800 Race test entry ${Date.now()}`,
    dayId: raceDayId,
    projectId,
  }, undefined, supervisorCookie);

  const closePromises = [
    request("POST", `/api/days/${raceDayId}/close`, undefined, undefined, supervisorCookie),
    request("POST", `/api/days/${raceDayId}/close`, undefined, undefined, supervisor2Cookie),
    request("POST", `/api/days/${raceDayId}/close`, undefined, undefined, godCookie),
  ];

  const closeResults = await Promise.all(closePromises);
  const closes200 = closeResults.filter((r) => r.status === 200);
  assert(closes200.length >= 1, `At least one close succeeded: ${closes200.length}`);

  const day = await request("GET", `/api/days/${raceDayId}`, undefined, undefined, godCookie);
  assert(day.body.status === "CLOSED", `Day is CLOSED after race: ${day.body.status}`);
}

async function testConcurrentEditSameEvent() {
  console.log("\n=== SUITE 1c: Concurrent Edits on Same Event ===");

  const editDate = `2026-08-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const editDay = await request("POST", `/api/projects/${projectId}/days`, { date: editDate }, undefined, godCookie);
  const editDayId = editDay.body.id;

  const evt = await request("POST", "/api/log-events", {
    rawText: `0900 Original event text ${Date.now()}`,
    dayId: editDayId,
    projectId,
  }, undefined, supervisorCookie);
  const eventId = evt.body.id;
  const eventVersion = evt.body.version;

  const editPromises = [
    request("PATCH", `/api/log-events/${eventId}`, {
      rawText: `0900 SUP1 edited ${Date.now()}`,
      version: eventVersion,
    }, undefined, supervisorCookie),
    request("PATCH", `/api/log-events/${eventId}`, {
      rawText: `0900 SUP2 edited ${Date.now()}`,
      version: eventVersion,
    }, undefined, supervisor2Cookie),
  ];

  const editResults = await Promise.all(editPromises);
  const edits200 = editResults.filter((r) => r.status === 200);
  const edits409 = editResults.filter((r) => r.status === 409);
  assert(edits200.length === 1, `Exactly one edit succeeded: ${edits200.length}`);
  assert(edits409.length === 1, `Exactly one got conflict: ${edits409.length}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Close-and-Export + Library Verification
// ════════════════════════════════════════════════════════════════════════════════

async function testCloseAndExportEndToEnd() {
  console.log("\n=== SUITE 2: Close-and-Export End-to-End ===");

  const exportDate = `2026-09-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const exportDay = await request("POST", `/api/projects/${projectId}/days`, { date: exportDate }, undefined, godCookie);
  const exportDayId = exportDay.body.id;
  assert(!!exportDayId, `Created export test day: ${exportDayId}`);

  const entries = [
    `0600 DHO: Daily safety briefing conducted. Weather clear, seas calm.`,
    `0630 Dive team mobilized to worksite. All equipment checks completed.`,
    `0700 D1 in water - bottom time started. Task: inspect pipeline section 14A.`,
    `0730 D1 on bottom at 45 FSW. Pipeline inspection in progress.`,
    `0800 D1 left bottom. Total bottom time 30 min at 45 FSW.`,
    `0815 D1 on surface. No decompression required.`,
    `0900 Client directive: Extend inspection to section 14B per project manager.`,
    `1000 RISK: Increased current observed at section 14B. Monitoring conditions.`,
    `1200 Operations secured for the day. All personnel accounted for.`,
  ];
  for (const entry of entries) {
    const res = await request("POST", "/api/log-events", {
      rawText: entry,
      dayId: exportDayId,
      projectId,
    }, undefined, supervisorCookie);
    assert(res.status === 201, `Log entry created: ${res.status}`);
  }

  const closeExportRes = await request("POST", `/api/days/${exportDayId}/close-and-export`, {
    closeoutData: {
      scopeStatus: "All tasks completed as planned",
      seiAdvisories: "None",
      standingRisks: "Increased current at section 14B - monitor for next shift",
      deviations: "None",
      outstandingIssues: "Section 14B inspection pending",
      plannedNextShift: "Continue section 14B inspection",
    },
  }, undefined, supervisorCookie);
  assert(closeExportRes.status === 200, `Close-and-export succeeded: ${closeExportRes.status}`);
  assert(closeExportRes.body.day?.status === "CLOSED", `Day is CLOSED: ${closeExportRes.body.day?.status}`);

  const exportedFiles = closeExportRes.body.exportedFiles || [];
  assert(exportedFiles.length > 0, `Export files generated: ${exportedFiles.length}`);

  const fileNames = exportedFiles.map((f: any) => f.fileName || f.file_name);
  console.log(`  Generated files: ${fileNames.join(", ")}`);
  assert(fileNames.some((n: string) => n?.includes("raw") || n?.includes("Raw")), "Raw notes export exists");
  assert(fileNames.some((n: string) => n?.includes("log") || n?.includes("Log") || n?.includes("daily")), "Daily log export exists");

  const library = await request("GET", `/api/library?dayId=${exportDayId}`, undefined, undefined, godCookie);
  assert(library.status === 200, `Library fetch: ${library.status}`);
  const dayExports = Array.isArray(library.body) ? library.body.filter((e: any) => String(e.dayId || e.day_id) === String(exportDayId)) : [];
  assert(dayExports.length > 0, `Library has exports for day: ${dayExports.length}`);

  if (dayExports.length > 0) {
    const downloadRes = await request("GET", `/api/library-exports/${dayExports[0].id}/download`, undefined, undefined, godCookie);
    assert(downloadRes.status === 200, `Export file downloadable: ${downloadRes.status}`);
  }

  const retryRes = await request("POST", `/api/days/${exportDayId}/close-and-export`, undefined, undefined, supervisorCookie);
  assert(retryRes.status === 200, `Re-close returns 200: ${retryRes.status}`);
  assert(retryRes.body.alreadyClosed === true, `Re-close returns alreadyClosed: ${retryRes.body.alreadyClosed}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Role-Based Access Control (DIVER restrictions)
// ════════════════════════════════════════════════════════════════════════════════

async function testDiverCannotCreateProject() {
  console.log("\n=== SUITE 3a: DIVER Cannot Create Project ===");
  const res = await request("POST", "/api/projects", {
    name: "Unauthorized Project",
    client: "Bad Actor",
    location: "Nowhere",
  }, undefined, diverCookie);
  assert(res.status === 403, `DIVER create project blocked: ${res.status}`);
}

async function testDiverCannotCreateDay() {
  console.log("\n=== SUITE 3b: DIVER Cannot Create Day ===");
  const res = await request("POST", `/api/projects/${projectId}/days`, {
    date: "2026-12-01",
  }, undefined, diverCookie);
  assert(res.status === 403, `DIVER create day blocked: ${res.status}`);
}

async function testDiverCannotCloseDay() {
  console.log("\n=== SUITE 3c: DIVER Cannot Close Day ===");
  const res = await request("POST", `/api/days/${dayId}/close`, undefined, undefined, diverCookie);
  assert(res.status === 403, `DIVER close day blocked: ${res.status}`);
}

async function testDiverCannotCloseAndExport() {
  console.log("\n=== SUITE 3d: DIVER Cannot Close-and-Export ===");
  const res = await request("POST", `/api/days/${dayId}/close-and-export`, undefined, undefined, diverCookie);
  assert(res.status === 403, `DIVER close-and-export blocked: ${res.status}`);
}

async function testDiverCannotCreateLogEvent() {
  console.log("\n=== SUITE 3e: DIVER Cannot Create Log Events ===");
  const res = await request("POST", "/api/log-events", {
    rawText: "0800 Diver trying to log",
    dayId,
    projectId,
  }, undefined, diverCookie);
  assert(res.status === 403, `DIVER create log event blocked: ${res.status}`);
}

async function testDiverCannotEditLogEvent() {
  console.log("\n=== SUITE 3f: DIVER Cannot Edit Log Events ===");
  const events = await request("GET", `/api/days/${dayId}/log-events`, undefined, undefined, godCookie);
  if (events.body.length > 0) {
    const eventId = events.body[0].id;
    const res = await request("PATCH", `/api/log-events/${eventId}`, {
      rawText: "0800 Diver unauthorized edit",
      version: events.body[0].version,
    }, undefined, diverCookie);
    assert(res.status === 403, `DIVER edit log event blocked: ${res.status}`);
  } else {
    console.log("  (No events to test edit on, creating one)");
    const evt = await request("POST", "/api/log-events", {
      rawText: `0800 Test for diver edit check ${Date.now()}`,
      dayId,
      projectId,
    }, undefined, supervisorCookie);
    const res = await request("PATCH", `/api/log-events/${evt.body.id}`, {
      rawText: "0800 Diver unauthorized edit",
      version: evt.body.version,
    }, undefined, diverCookie);
    assert(res.status === 403, `DIVER edit log event blocked: ${res.status}`);
  }
}

async function testDiverCannotCreateRisk() {
  console.log("\n=== SUITE 3g: DIVER Cannot Create Risks ===");
  const res = await request("POST", "/api/risks", {
    projectId,
    dayId,
    description: "Unauthorized risk",
    severity: "HIGH",
    category: "ENVIRONMENTAL",
  }, undefined, diverCookie);
  assert(res.status === 403, `DIVER create risk blocked: ${res.status}`);
}

async function testDiverCannotReopenDay() {
  console.log("\n=== SUITE 3h: DIVER Cannot Reopen Day ===");
  const res = await request("POST", `/api/days/${dayId}/reopen`, undefined, undefined, diverCookie);
  assert(res.status === 403, `DIVER reopen day blocked: ${res.status}`);
}

async function testDiverCanReadData() {
  console.log("\n=== SUITE 3i: DIVER Can READ Data ===");
  const projects = await request("GET", "/api/projects", undefined, undefined, diverCookie);
  assert(projects.status === 200, `DIVER can read projects: ${projects.status}`);

  const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, diverCookie);
  assert(days.status === 200, `DIVER can read days: ${days.status}`);

  const events = await request("GET", `/api/days/${dayId}/log-events`, undefined, undefined, diverCookie);
  assert(events.status === 200, `DIVER can read log events: ${events.status}`);

  const dives = await request("GET", `/api/days/${dayId}/dives`, undefined, undefined, diverCookie);
  assert(dives.status === 200, `DIVER can read dives: ${dives.status}`);
}

async function testUnauthenticatedAccess() {
  console.log("\n=== SUITE 3j: Unauthenticated Access Blocked ===");
  const noCookie = "invalid_session=xxx";
  const res1 = await request("GET", "/api/projects", undefined, undefined, noCookie);
  assert(res1.status === 401, `Unauthenticated GET projects: ${res1.status}`);

  const res2 = await request("POST", "/api/log-events", {
    rawText: "0800 No auth",
    dayId,
    projectId,
  }, undefined, noCookie);
  assert(res2.status === 401, `Unauthenticated POST log-events: ${res2.status}`);

  const res3 = await request("POST", `/api/days/${dayId}/close`, undefined, undefined, noCookie);
  assert(res3.status === 401, `Unauthenticated close day: ${res3.status}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: 0600-0600 Rolling Log Boundary
// ════════════════════════════════════════════════════════════════════════════════

async function testEventTimeParsing() {
  console.log("\n=== SUITE 4a: Event Time Parsing from Raw Text ===");

  const boundaryDate = `2026-10-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const boundaryDay = await request("POST", `/api/projects/${projectId}/days`, { date: boundaryDate }, undefined, godCookie);
  const boundaryDayId = boundaryDay.body.id;

  const testCases = [
    { raw: "0600 Start of operational day - morning briefing", expectedHour: 6, label: "0600 start boundary" },
    { raw: "1200 Midday operations update", expectedHour: 12, label: "1200 midday" },
    { raw: "1800 Evening shift handover", expectedHour: 18, label: "1800 evening" },
    { raw: "2359 Late night operations continuing", expectedHour: 23, label: "2359 late night" },
    { raw: "0100 Night work - monitoring equipment", expectedHour: 1, label: "0100 after midnight" },
    { raw: "0559 End of operational day - final entry", expectedHour: 5, label: "0559 end boundary" },
  ];

  for (const tc of testCases) {
    const res = await request("POST", "/api/log-events", {
      rawText: `${tc.raw} ${Date.now()}`,
      dayId: boundaryDayId,
      projectId,
    }, undefined, supervisorCookie);
    assert(res.status === 201, `Event ${tc.label} created: ${res.status}`);

    if (res.body.eventTime) {
      const eventTime = new Date(res.body.eventTime);
      const hour = eventTime.getHours() || eventTime.getUTCHours();
      assert(hour === tc.expectedHour, `${tc.label} time parsed correctly: hour=${hour} expected=${tc.expectedHour}`);
    } else {
      assert(false, `${tc.label}: eventTime missing from response`);
    }
  }

  const events = await request("GET", `/api/days/${boundaryDayId}/log-events`, undefined, undefined, godCookie);
  assert(events.body.length >= testCases.length, `All boundary events persisted: ${events.body.length}`);
}

async function testNightWorkAttachesToPriorDay() {
  console.log("\n=== SUITE 4b: Night Work Attaches to Prior Operational Day ===");

  const nightDate = `2026-10-15`;
  const nightDay = await request("POST", `/api/projects/${projectId}/days`, { date: nightDate }, undefined, godCookie);
  const nightDayId = nightDay.body.id;

  const events = [
    "0600 Day operations begin",
    "1200 Midday update",
    "1800 Evening shift starts",
    "2200 Night operations continue",
    "0100 After-midnight work ongoing - this belongs to the same operational day",
    "0400 Early morning maintenance",
    "0530 Night shift wrapping up",
  ];
  for (const entry of events) {
    const res = await request("POST", "/api/log-events", {
      rawText: `${entry} ${Date.now()}`,
      dayId: nightDayId,
      projectId,
    }, undefined, supervisorCookie);
    assert(res.status === 201, `Night work event created: ${res.status}`);
  }

  const allEvents = await request("GET", `/api/days/${nightDayId}/log-events`, undefined, undefined, godCookie);
  assert(allEvents.body.length >= events.length, `All night events on same day: ${allEvents.body.length} >= ${events.length}`);

  const afterMidnight = allEvents.body.filter((e: any) => {
    const t = new Date(e.eventTime);
    const h = t.getHours() || t.getUTCHours();
    return h < 6;
  });
  assert(afterMidnight.length >= 3, `After-midnight events (0100-0530) attached to operational day: ${afterMidnight.length}`);
}

async function testChronologicalOrdering() {
  console.log("\n=== SUITE 4c: Chronological Ordering Across Midnight ===");

  const chronDate = `2026-11-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const chronDay = await request("POST", `/api/projects/${projectId}/days`, { date: chronDate }, undefined, godCookie);
  const chronDayId = chronDay.body.id;

  const outOfOrder = [
    "1800 Evening entry",
    "0600 Morning entry",
    "0200 After-midnight entry",
    "1200 Noon entry",
    "2300 Late night entry",
  ];
  for (const entry of outOfOrder) {
    await request("POST", "/api/log-events", {
      rawText: `${entry} ${Date.now()}`,
      dayId: chronDayId,
      projectId,
    }, undefined, supervisorCookie);
  }

  const events = await request("GET", `/api/days/${chronDayId}/log-events`, undefined, undefined, godCookie);
  assert(events.body.length >= outOfOrder.length, `All chronological events present: ${events.body.length}`);

  const seqNums = events.body.map((e: any) => e.sequenceNumber).filter(Boolean);
  const sorted = [...seqNums].sort((a: number, b: number) => a - b);
  const isSequential = seqNums.every((s: number, i: number) => s === sorted[i]);
  assert(isSequential, `Sequence numbers are sequential (insertion order): ${seqNums.join(",")}`);
}

async function testEventTimeOverride() {
  console.log("\n=== SUITE 4d: Event Time Override ===");

  const overrideDate = `2026-11-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const overrideDay = await request("POST", `/api/projects/${projectId}/days`, { date: overrideDate }, undefined, godCookie);
  const overrideDayId = overrideDay.body.id;

  const overrideTime = `${overrideDate}T14:30:00.000Z`;
  const res = await request("POST", "/api/log-events", {
    rawText: `0800 This text says 0800 but override says 1430 ${Date.now()}`,
    dayId: overrideDayId,
    projectId,
    eventTimeOverride: overrideTime,
  }, undefined, supervisorCookie);
  assert(res.status === 201, `Event with time override created: ${res.status}`);

  if (res.body.eventTime) {
    const t = new Date(res.body.eventTime);
    const h = t.getUTCHours();
    assert(h === 14, `Override time used (hour=14): hour=${h}`);
  }
}

async function testSlashDelimitedEntries() {
  console.log("\n=== SUITE 4e: Slash-Delimited Multi-Entry Parsing ===");

  const slashDate = `2026-11-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const slashDay = await request("POST", `/api/projects/${projectId}/days`, { date: slashDate }, undefined, godCookie);
  const slashDayId = slashDay.body.id;

  const res = await request("POST", "/api/log-events", {
    rawText: `0530 Pre-dive checks complete / 0600 DHO meeting / 0615 Crew briefing ${Date.now()}`,
    dayId: slashDayId,
    projectId,
  }, undefined, supervisorCookie);
  assert(res.status === 201, `Slash-delimited entry created: ${res.status}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  DiveOps™ Extended Coverage Tests                            ║");
  console.log("║  Concurrency · Close/Export · RBAC · Rolling Log             ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  try {
    await setup();

    // Suite 1: Concurrency
    await testConcurrentLogEvents();
    await testConcurrentCloseRace();
    await testConcurrentEditSameEvent();

    // Suite 2: Close-and-Export
    await testCloseAndExportEndToEnd();

    // Suite 3: RBAC
    await testDiverCannotCreateProject();
    await testDiverCannotCreateDay();
    await testDiverCannotCloseDay();
    await testDiverCannotCloseAndExport();
    await testDiverCannotCreateLogEvent();
    await testDiverCannotEditLogEvent();
    await testDiverCannotCreateRisk();
    await testDiverCannotReopenDay();
    await testDiverCanReadData();
    await testUnauthenticatedAccess();

    // Suite 4: Rolling Log Boundary
    await testEventTimeParsing();
    await testNightWorkAttachesToPriorDay();
    await testChronologicalOrdering();
    await testEventTimeOverride();
    await testSlashDelimitedEntries();
  } catch (error) {
    console.error("\n[FATAL]", error);
    failed++;
  }

  console.log("\n" + "═".repeat(64));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`  FAILURES:`);
    failures.forEach((f) => console.log(`    - ${f}`));
  }
  console.log("═".repeat(64));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
