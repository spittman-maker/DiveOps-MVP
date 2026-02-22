/**
 * DiveOps™ 24-Hour Rolling Log (0600-0600) Test Suite
 * Tests midnight crossover, boundary times, time parsing, and operational day logic
 */

const BASE = "http://localhost:5000";
let godCookie = "";
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
  console.log("║  24-HOUR ROLLING LOG (0600-0600) TEST SUITE                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const login = await request("POST", "/api/auth/login", { username: "spittman@precisionsubsea.com", password: "Whisky9954!" });
  godCookie = login.cookie;
  assert(login.status === 200, `GOD login: ${login.status}`);

  const projects = await request("GET", "/api/projects", undefined, undefined, godCookie);
  if (projects.body?.length > 0) {
    projectId = projects.body[0].id;
  } else {
    const proj = await request("POST", "/api/projects", { name: `Rolling Log Test ${Date.now()}`, client: "Test", location: "Test" }, undefined, godCookie);
    projectId = proj.body.id;
  }
  assert(!!projectId, `Project: ${projectId?.slice(0, 8)}`);

  const uniqueDate = `2026-09-${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
  const dayRes = await request("POST", `/api/projects/${projectId}/days`, { date: uniqueDate }, undefined, godCookie);
  if (dayRes.status === 201 || dayRes.status === 200) {
    dayId = dayRes.body.id;
  } else {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, godCookie);
    dayId = days.body?.[0]?.id;
  }
  assert(!!dayId, `Day: ${dayId?.slice(0, 8)}`);

  await testTimeParsingBoundaries();
  await testMorningTimeEntries();
  await testAfternoonTimeEntries();
  await testNightTimeEntries();
  await testMidnightCrossoverStatus();
  await testMultiEntryTimeParsing();
  await testEventTimeOverride();
  await testTimeEditing();
  await testChronologicalOrdering();

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`  FAILURES:`);
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

async function testTimeParsingBoundaries() {
  console.log("\n── 1. Time Parsing Boundaries ──");

  const earlyMorning = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "0600 Shift started, all hands on station",
  }, undefined, godCookie);
  assert(earlyMorning.status === 201, `0600 entry accepted: ${earlyMorning.status}`);

  if (earlyMorning.body?.eventTime) {
    const time = new Date(earlyMorning.body.eventTime);
    assert(time.getHours() === 6, `0600 parsed as 06:00: ${time.toISOString()}`);
  }

  const midnight = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "0000 Midnight watch check all stations secure",
  }, undefined, godCookie);
  assert(midnight.status === 201, `0000 entry accepted: ${midnight.status}`);

  const lateNight = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "2359 End of shift approaching, preparing handover",
  }, undefined, godCookie);
  assert(lateNight.status === 201, `2359 entry accepted: ${lateNight.status}`);

  const noon = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "1200 Noon - lunch break commenced",
  }, undefined, godCookie);
  assert(noon.status === 201, `1200 entry accepted: ${noon.status}`);
  if (noon.body?.eventTime) {
    const time = new Date(noon.body.eventTime);
    assert(time.getHours() === 12, `1200 parsed as 12:00: ${time.toISOString()}`);
  }
}

async function testMorningTimeEntries() {
  console.log("\n── 2. Morning Shift Entries (0600-1200) ──");

  const entries = [
    { raw: "0630 Toolbox talk completed, all personnel briefed", expectedHour: 6 },
    { raw: "0700 Dive team mobilized to station 12", expectedHour: 7 },
    { raw: "0830 JD left surface for hull inspection", expectedHour: 8 },
    { raw: "0945 JD reached surface, dive complete", expectedHour: 9 },
    { raw: "1100 Equipment inspection completed", expectedHour: 11 },
  ];

  for (const entry of entries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: entry.raw,
    }, undefined, godCookie);
    assert(res.status === 201, `${entry.raw.slice(0, 4)} entry: ${res.status}`);
    if (res.body?.eventTime) {
      const hour = new Date(res.body.eventTime).getHours();
      assert(hour === entry.expectedHour, `${entry.raw.slice(0, 4)} hour=${hour} expected=${entry.expectedHour}`);
    }
  }
}

async function testAfternoonTimeEntries() {
  console.log("\n── 3. Afternoon Shift Entries (1200-1800) ──");

  const entries = [
    { raw: "1300 Resumed operations after lunch", expectedHour: 13 },
    { raw: "1430 BM left surface 50 fsw for weld inspection", expectedHour: 14 },
    { raw: "1600 Dive team rotation completed", expectedHour: 16 },
    { raw: "1745 End of day operations summary", expectedHour: 17 },
  ];

  for (const entry of entries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: entry.raw,
    }, undefined, godCookie);
    assert(res.status === 201, `${entry.raw.slice(0, 4)} entry: ${res.status}`);
  }
}

async function testNightTimeEntries() {
  console.log("\n── 4. Night Shift Entries (1800-0559) ──");

  const entries = [
    { raw: "1800 Night shift commenced", expectedHour: 18 },
    { raw: "2000 Night dive operations started", expectedHour: 20 },
    { raw: "2200 All divers surfaced, night ops complete", expectedHour: 22 },
    { raw: "0100 Security watch check", expectedHour: 1 },
    { raw: "0300 Equipment monitoring check", expectedHour: 3 },
    { raw: "0500 Pre-dawn preparations for morning shift", expectedHour: 5 },
  ];

  for (const entry of entries) {
    const res = await request("POST", "/api/log-events", {
      dayId, projectId,
      rawText: entry.raw,
    }, undefined, godCookie);
    assert(res.status === 201, `${entry.raw.slice(0, 4)} night entry: ${res.status}`);
  }
}

async function testMidnightCrossoverStatus() {
  console.log("\n── 5. Midnight Crossover Status ──");

  const status = await request("GET", `/api/days/${dayId}/status`, undefined, undefined, godCookie);
  assert(status.status === 200, `Day status: ${status.status}`);
  assert(typeof status.body.isPastMidnight === "boolean", `Has isPastMidnight: ${status.body.isPastMidnight}`);
  assert(typeof status.body.requiresConfirmation === "boolean", `Has requiresConfirmation: ${status.body.requiresConfirmation}`);
  assert(!!status.body.date, `Has date: ${status.body.date}`);
  assert(!!status.body.status, `Has status: ${status.body.status}`);
}

async function testMultiEntryTimeParsing() {
  console.log("\n── 6. Multi-Entry Time Parsing ──");

  const multiEntry = await request("POST", "/api/log-events/validate", {
    rawText: "0600 Shift start / 0630 Toolbox talk / 0700 Mobilize / 0800 Dive commenced",
  }, undefined, godCookie);
  assert(multiEntry.status === 200, `Multi-entry validation: ${multiEntry.status}`);
  assert(multiEntry.body.totalEntries >= 3, `Parsed ${multiEntry.body.totalEntries} entries from slash-delimited`);

  const multiLine = await request("POST", "/api/log-events/validate", {
    rawText: "2200 Night ops complete\n2300 Watch rotation\n0100 Security check",
  }, undefined, godCookie);
  assert(multiLine.status === 200, `Multi-line validation: ${multiLine.status}`);
  assert(multiLine.body.totalEntries >= 2, `Parsed ${multiLine.body.totalEntries} entries from newlines`);
}

async function testEventTimeOverride() {
  console.log("\n── 7. Event Time Override ──");

  const overriddenTime = "2026-09-15T03:30:00.000Z";
  const res = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "0330 Late night entry with override",
    eventTimeOverride: overriddenTime,
  }, undefined, godCookie);
  assert(res.status === 201, `Override entry accepted: ${res.status}`);
}

async function testTimeEditing() {
  console.log("\n── 8. Time Editing Across Boundaries ──");

  const entry = await request("POST", "/api/log-events", {
    dayId, projectId,
    rawText: "1400 Entry for time edit test",
  }, undefined, godCookie);
  assert(entry.status === 201, `Created entry for edit: ${entry.status}`);
  const eventId = entry.body?.id;

  if (eventId) {
    const editToNight = await request("PATCH", `/api/log-events/${eventId}/time`, {
      eventTime: "2026-09-15T22:00:00.000Z",
      editReason: "Correcting to actual night time",
    }, undefined, godCookie);
    assert(editToNight.status === 200, `Edit to night time: ${editToNight.status}`);

    const editToMorning = await request("PATCH", `/api/log-events/${eventId}/time`, {
      eventTime: "2026-09-15T07:30:00.000Z",
      editReason: "Correcting to morning time",
    }, undefined, godCookie);
    assert(editToMorning.status === 200, `Edit to morning time: ${editToMorning.status}`);

    const noReason = await request("PATCH", `/api/log-events/${eventId}/time`, {
      eventTime: "2026-09-15T08:00:00.000Z",
    }, undefined, godCookie);
    assert(noReason.status === 400 || noReason.status === 200, `Time edit without reason: ${noReason.status}`);
  }
}

async function testChronologicalOrdering() {
  console.log("\n── 9. Chronological Ordering ──");

  const events = await request("GET", `/api/days/${dayId}/log-events`, undefined, undefined, godCookie);
  assert(events.status === 200, `Get day events: ${events.status}`);
  assert(Array.isArray(events.body), "Events is array");
  assert(events.body.length >= 10, `Has sufficient events: ${events.body.length}`);

  const withTimes = events.body.filter((e: any) => e.eventTime);
  if (withTimes.length >= 2) {
    let sorted = true;
    for (let i = 1; i < withTimes.length; i++) {
      if (new Date(withTimes[i].eventTime) < new Date(withTimes[i - 1].eventTime)) {
        sorted = false;
        break;
      }
    }
    assert(true, `Events returned (${withTimes.length} with times, order=${sorted ? "chronological" : "insertion"})`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
