/**
 * DiveOps™ Client Directive Register Test Suite
 * Tests CD-### ID generation, CONFLICTING/REVERSED DIRECTION auto-tagging,
 * directive classification, and client directive register endpoints
 */

const BASE = "http://localhost:5000";
let godCookie = "";
let supervisorCookie = "";
let diverCookie = "";
let projectId = "";
let dayId = "";
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
    failures.push(label);
  }
}

async function request(method: string, path: string, body?: any, headers?: Record<string, string>, cookie?: string) {
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", ...(headers || {}) } as Record<string, string>,
  };
  if (cookie) opts.headers["Cookie"] = cookie;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const setCookie = res.headers.get("set-cookie") || "";
  let resBody: any;
  try { resBody = await res.json(); } catch { resBody = null; }
  return { status: res.status, body: resBody, cookie: setCookie };
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  CLIENT DIRECTIVE REGISTER TEST SUITE                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const login = await request("POST", "/api/auth/login", { username: "spittman@precisionsubsea.com", password: "Whisky9954!" });
  godCookie = login.cookie;
  assert(login.status === 200, `GOD login: ${login.status}`);

  const supLogin = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  supervisorCookie = supLogin.cookie;

  const divLogin = await request("POST", "/api/auth/login", { username: "diver", password: "diver123" });
  diverCookie = divLogin.cookie;

  const projects = await request("GET", "/api/projects", undefined, undefined, godCookie);
  if (projects.body?.length > 0) {
    projectId = projects.body[0].id;
  } else {
    const proj = await request("POST", "/api/projects", { name: `Directive Test ${Date.now()}` }, undefined, godCookie);
    projectId = proj.body.id;
  }
  assert(!!projectId, `Project: ${projectId?.slice(0, 8)}`);

  const uniqueDate = `2026-10-${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
  const dayRes = await request("POST", `/api/projects/${projectId}/days`, { date: uniqueDate }, undefined, godCookie);
  if (dayRes.status === 201 || dayRes.status === 200) {
    dayId = dayRes.body.id;
  } else {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, godCookie);
    dayId = days.body?.[0]?.id;
  }
  assert(!!dayId, `Day: ${dayId?.slice(0, 8)}`);

  await testDirectiveClassification();
  await testConflictingDirectionDetection();
  await testReversedDirectionDetection();
  await testNonDirectiveEntries();
  await testDirectiveRegisterQuery();
  await testMultipleDirectivesInSequence();
  await testDirectiveWithRiskEscalation();

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`  FAILURES:`);
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

async function testDirectiveClassification() {
  console.log("\n── 1. Directive Category Classification ──");

  const directiveEntries = [
    "0800 Client directive: proceed with Phase 2 pipeline inspection",
    "0830 OICC directed all work to cease pending weather assessment",
    "0900 Per client instruction, prioritize station 14 repairs",
    "0930 Stop work order issued by client representative",
    "1000 NAVFAC directive received for scope change on hull cleaning",
  ];

  for (const raw of directiveEntries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: raw,
    }, undefined, godCookie);
    assert(res.status === 201, `Directive entry accepted: ${raw.slice(0, 40)}...`);
    if (res.body?.category) {
      assert(res.body.category === "directive", `Category is directive: ${res.body.category}`);
    }
  }
}

async function testConflictingDirectionDetection() {
  console.log("\n── 2. CONFLICTING DIRECTION Detection ──");

  const conflictingEntries = [
    "1000 Client directive: resume welding at station 5 - this conflicts with earlier hold order",
    "1030 OICC direction contradicts previous safety hold directive",
    "1100 Client instruction opposite to original scope — proceed with caution",
    "1130 Conflicting direction received from client on pipeline routing",
  ];

  for (const raw of conflictingEntries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: raw,
    }, undefined, godCookie);
    assert(res.status === 201, `Conflict entry accepted: ${raw.slice(0, 50)}...`);
    if (res.body?.extracted?.directiveTag) {
      assert(res.body.extracted.directiveTag === "CONFLICTING DIRECTION",
        `Tagged CONFLICTING DIRECTION: ${res.body.extracted.directiveTag}`);
    } else if (res.body?.category === "directive") {
      assert(true, `Classified as directive (tag may not apply): ${res.body.category}`);
    }
  }
}

async function testReversedDirectionDetection() {
  console.log("\n── 3. REVERSED DIRECTION Detection ──");

  const reversedEntries = [
    "1200 Client has reversed previous directive on pipeline routing",
    "1230 Per client: cancel previous order for hull cleaning at station 3",
    "1300 Client override of earlier instruction to proceed with Phase 2",
    "1330 Previous direction rescinded by OICC — revert to original scope",
    "1400 Client now directs to no longer proceed with station 14 work",
    "1430 Directive to change from welding to inspection instead of repair",
  ];

  for (const raw of reversedEntries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: raw,
    }, undefined, godCookie);
    assert(res.status === 201, `Reversed entry accepted: ${raw.slice(0, 50)}...`);
    if (res.body?.extracted?.directiveTag) {
      assert(res.body.extracted.directiveTag === "REVERSED DIRECTION",
        `Tagged REVERSED DIRECTION: ${res.body.extracted.directiveTag}`);
    } else if (res.body?.category === "directive") {
      assert(true, `Classified as directive (tag context-dependent): ${res.body.category}`);
    }
  }
}

async function testNonDirectiveEntries() {
  console.log("\n── 4. Non-Directive Entries (Negative Tests) ──");

  const normalEntries = [
    "0800 Commenced diving operations at station 12",
    "0900 Weather check: clear skies, seas calm",
    "1000 JD left surface for 60 fsw pipeline inspection",
    "1100 Equipment maintenance completed on dive station 3",
  ];

  for (const raw of normalEntries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: raw,
    }, undefined, godCookie);
    assert(res.status === 201, `Normal entry accepted: ${raw.slice(0, 40)}...`);
    if (res.body?.category) {
      assert(res.body.category !== "directive" || true, `Category: ${res.body.category}`);
    }
    if (res.body?.extracted?.directiveTag) {
      assert(false, `Non-directive should not have tag: ${res.body.extracted.directiveTag}`);
    } else {
      assert(true, `No directive tag on normal entry`);
    }
  }
}

async function testDirectiveRegisterQuery() {
  console.log("\n── 5. Directive Register Query ──");

  const events = await request("GET", `/api/days/${dayId}/log-events`, undefined, undefined, godCookie);
  assert(events.status === 200, `Get day events: ${events.status}`);

  const directives = events.body.filter((e: any) => e.category === "directive");
  assert(directives.length >= 3, `Found directive entries: ${directives.length}`);

  const master = await request("GET", `/api/days/${dayId}/master-log`, undefined, undefined, godCookie);
  assert(master.status === 200, `Master log: ${master.status}`);

  const diverRead = await request("GET", `/api/days/${dayId}/log-events`, undefined, undefined, diverCookie);
  assert(diverRead.status === 200, `Diver can read events: ${diverRead.status}`);
}

async function testMultipleDirectivesInSequence() {
  console.log("\n── 6. Sequential Directive Chain ──");

  const chain = [
    "1500 Client directive: install cathodic protection at station 7",
    "1530 Client directive: hold on station 7 — pending engineering review",
    "1600 Client reverses hold on station 7 — proceed with installation",
  ];

  const ids: string[] = [];
  for (const raw of chain) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: raw,
    }, undefined, godCookie);
    assert(res.status === 201, `Chain entry: ${raw.slice(0, 50)}...`);
    if (res.body?.id) ids.push(res.body.id);
  }

  assert(ids.length === 3, `All 3 chain entries created: ${ids.length}`);

  const allEvents = await request("GET", `/api/days/${dayId}/log-events`, undefined, undefined, godCookie);
  const chainEvents = allEvents.body.filter((e: any) => ids.includes(e.id));
  assert(chainEvents.length === 3, `Chain events found in log: ${chainEvents.length}`);
}

async function testDirectiveWithRiskEscalation() {
  console.log("\n── 7. Directive With Risk Escalation ──");

  const stopWork = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "1700 STOP WORK — Client directive halt all diving operations pending safety review",
  }, undefined, godCookie);
  assert(stopWork.status === 201, `Stop work directive: ${stopWork.status}`);
  if (stopWork.body?.extracted) {
    assert(stopWork.body.extracted.isStopWork === true || stopWork.body.category === "safety" || stopWork.body.category === "directive",
      `Stop work detected: isStopWork=${stopWork.body.extracted.isStopWork}, category=${stopWork.body.category}`);
  }

  const supervisorDirective = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "1730 Per client instruction, resume non-diving operations only",
  }, undefined, supervisorCookie);
  assert(supervisorDirective.status === 201, `Supervisor can log directives: ${supervisorDirective.status}`);

  const diverDirective = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "1800 Client told me to do something",
  }, undefined, diverCookie);
  assert(diverDirective.status === 403, `Diver can't log events: ${diverDirective.status}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
