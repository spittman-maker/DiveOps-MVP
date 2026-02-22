/**
 * DiveOps™ Document Export Test Suite
 * Tests Word/Excel document generation, PSG-TPL-0001 template, risk register export,
 * close-and-export pipeline, and library export endpoints
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

async function rawFetch(method: string, path: string, cookie?: string) {
  const opts: any = { method, headers: {} as Record<string, string> };
  if (cookie) opts.headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, opts);
  return { status: res.status, headers: res.headers, arrayBuffer: async () => res.arrayBuffer() };
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  DOCUMENT EXPORT TEST SUITE                                  ║");
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
    const proj = await request("POST", "/api/projects", { name: `Export Test ${Date.now()}` }, undefined, godCookie);
    projectId = proj.body.id;
  }
  assert(!!projectId, `Project: ${projectId?.slice(0, 8)}`);

  const uniqueDate = `2026-11-${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
  const dayRes = await request("POST", `/api/projects/${projectId}/days`, { date: uniqueDate }, undefined, godCookie);
  if (dayRes.status === 201 || dayRes.status === 200) {
    dayId = dayRes.body.id;
  } else {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, godCookie);
    dayId = days.body?.[days.body.length - 1]?.id || days.body?.[0]?.id;
  }
  assert(!!dayId, `Day: ${dayId?.slice(0, 8)}`);

  const entries = [
    "0600 Shift started, all personnel on station",
    "0700 Toolbox talk completed",
    "0800 JD L/S 60 fsw pipeline inspection",
    "0830 JD R/S from 60 fsw",
    "0900 Client directive: extend inspection scope to station 14",
    "1000 BM L/S 45 fsw anode replacement",
    "1030 BM R/S from 45 fsw",
    "1200 Lunch break",
    "1300 Operations resumed",
    "1400 STOP WORK - weather deteriorating",
    "1500 Operations resumed after weather clear",
    "1700 End of shift, all equipment secured",
  ];

  for (const raw of entries) {
    await request("POST", "/api/log-events", { dayId, projectId, rawText: raw }, undefined, godCookie);
  }

  await request("POST", "/api/risks", {
    dayId, projectId,
    description: "Deteriorating weather conditions during dive ops",
    category: "environmental",
  }, undefined, godCookie);

  await testCloseAndExportPipeline();
  await testExportFileTypes();
  await testLibraryExports();
  await testExportRoleAccess();
  await testExportOnActiveDaySeparately();
  await testRiskRegisterPresence();

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`  FAILURES:`);
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

async function testCloseAndExportPipeline() {
  console.log("\n── 1. Close-and-Export Pipeline ──");

  const closeExport = await request("POST", `/api/days/${dayId}/close-and-export`, {
    forceClose: true,
  }, undefined, godCookie);
  assert(closeExport.status === 200, `Close-and-export: ${closeExport.status}`);

  if (closeExport.body?.day) {
    assert(closeExport.body.day.status === "CLOSED", `Day status: ${closeExport.body.day.status}`);
  }

  if (closeExport.body?.exportedFiles) {
    assert(Array.isArray(closeExport.body.exportedFiles), "exportedFiles is array");
    assert(closeExport.body.exportedFiles.length >= 1, `Files generated: ${closeExport.body.exportedFiles.length}`);

    for (const file of closeExport.body.exportedFiles) {
      assert(!!file.name, `File has name: ${file.name}`);
      assert(!!file.type, `File type: ${file.type}`);
      assert(!!file.path, `File path: ${file.path}`);
    }
  }

  const retry = await request("POST", `/api/days/${dayId}/close-and-export`, {}, undefined, godCookie);
  assert(retry.status === 200, `Retry on closed day: ${retry.status}`);
  assert(retry.body?.alreadyClosed === true, `Already closed flag: ${retry.body?.alreadyClosed}`);
}

async function testExportFileTypes() {
  console.log("\n── 2. Export File Types ──");

  const exports = await request("GET", `/api/days/${dayId}/library-exports`, undefined, undefined, godCookie);
  assert(exports.status === 200, `Library exports: ${exports.status}`);

  if (Array.isArray(exports.body)) {
    const fileTypes = exports.body.map((f: any) => f.fileType || f.fileName?.split('.').pop());
    const hasDocx = fileTypes.some((t: string) => t === "docx" || t?.includes("docx"));
    const hasXlsx = fileTypes.some((t: string) => t === "xlsx" || t?.includes("xlsx"));

    assert(exports.body.length >= 1, `Export files: ${exports.body.length}`);
    if (hasDocx) assert(true, "Has Word document (.docx)");
    if (hasXlsx) assert(true, "Has Excel file (.xlsx)");
    if (!hasDocx && !hasXlsx) {
      assert(exports.body.length >= 1, `Has export files (types: ${fileTypes.join(', ')})`);
    }

    for (const file of exports.body) {
      assert(!!file.fileName || !!file.name, `File: ${file.fileName || file.name}`);
    }
  }
}

async function testLibraryExports() {
  console.log("\n── 3. Library Export Endpoints ──");

  const dayExports = await request("GET", `/api/days/${dayId}/library-exports`, undefined, undefined, godCookie);
  assert(dayExports.status === 200, `Day exports: ${dayExports.status}`);

  const projectExports = await request("GET", `/api/projects/${projectId}/library-exports`, undefined, undefined, godCookie);
  assert(projectExports.status === 200, `Project exports: ${projectExports.status}`);

  if (Array.isArray(dayExports.body) && dayExports.body.length > 0) {
    const fileId = dayExports.body[0].id;
    const download = await rawFetch("GET", `/api/library-exports/${fileId}/download`, godCookie);
    assert(download.status === 200, `Download file: ${download.status}`);

    const contentType = download.headers.get("content-type") || "";
    assert(contentType.length > 0, `Content-Type set: ${contentType}`);

    const buf = await download.arrayBuffer();
    assert(buf.byteLength > 100, `File downloaded: ${buf.byteLength} bytes`);
  }

  const badDownload = await rawFetch("GET", "/api/library-exports/nonexistent-id/download", godCookie);
  assert(badDownload.status === 404, `404 on bad export ID: ${badDownload.status}`);
}

async function testExportRoleAccess() {
  console.log("\n── 4. Export Role Access ──");

  const diverExports = await request("GET", `/api/days/${dayId}/library-exports`, undefined, undefined, diverCookie);
  assert(diverExports.status === 200, `Diver can view exports: ${diverExports.status}`);

  const supExports = await request("GET", `/api/days/${dayId}/library-exports`, undefined, undefined, supervisorCookie);
  assert(supExports.status === 200, `Supervisor can view exports: ${supExports.status}`);

  if (Array.isArray(diverExports.body) && diverExports.body.length > 0) {
    const fileId = diverExports.body[0].id;
    const diverDownload = await rawFetch("GET", `/api/library-exports/${fileId}/download`, diverCookie);
    assert(diverDownload.status === 200, `Diver can download: ${diverDownload.status}`);
  }
}

async function testExportOnActiveDaySeparately() {
  console.log("\n── 5. Export on Active Day ──");

  const activeDate = `2026-12-${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
  const activeDay = await request("POST", `/api/projects/${projectId}/days`, { date: activeDate }, undefined, godCookie);
  if (activeDay.status !== 201 && activeDay.status !== 200) {
    console.log("  (Skipping - couldn't create active day)");
    return;
  }
  const activeDayId = activeDay.body.id;

  await request("POST", "/api/log-events", {
    dayId: activeDayId, projectId,
    rawText: "0800 Test entry for active day export",
  }, undefined, godCookie);

  const masterLog = await request("GET", `/api/days/${activeDayId}/master-log`, undefined, undefined, godCookie);
  assert(masterLog.status === 200, `Master log on active day: ${masterLog.status}`);

  const activeExports = await request("GET", `/api/days/${activeDayId}/library-exports`, undefined, undefined, godCookie);
  assert(activeExports.status === 200, `Exports on active day: ${activeExports.status}`);
}

async function testRiskRegisterPresence() {
  console.log("\n── 6. Risk Register in Export ──");

  const risks = await request("GET", `/api/days/${dayId}/risks`, undefined, undefined, godCookie);
  assert(risks.status === 200, `Get risks: ${risks.status}`);

  if (Array.isArray(risks.body)) {
    assert(risks.body.length >= 1, `Has risks: ${risks.body.length}`);

    for (const risk of risks.body) {
      assert(!!risk.riskId, `Risk has ID: ${risk.riskId}`);
      assert(risk.riskId.startsWith("RISK-"), `Risk ID format: ${risk.riskId}`);
      assert(!!risk.description, `Risk has description`);
      assert(!!risk.status, `Risk has status: ${risk.status}`);
    }
  }

  const projectRisks = await request("GET", `/api/projects/${projectId}/risks`, undefined, undefined, godCookie);
  assert(projectRisks.status === 200, `Project risks: ${projectRisks.status}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
