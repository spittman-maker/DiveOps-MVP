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
        const setCookie = res.headers["set-cookie"];
        try {
          resolve({
            status: res.statusCode!,
            body: data ? JSON.parse(data) : null,
            headers: res.headers as any,
          });
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
  console.log("║  DASHBOARD & STATS TEST SUITE                                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  await request("POST", "/api/seed");

  const godLogin = await request("POST", "/api/auth/login", { username: "spittman@precisionsubsea.com", password: "Whisky9954!" });
  godCookie = extractCookie(godLogin);
  assert(godLogin.status === 200 && !!godCookie, "GOD login");

  const supLogin = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  supervisorCookie = extractCookie(supLogin);
  assert(supLogin.status === 200 && !!supervisorCookie, "Supervisor login");

  const diverLogin = await request("POST", "/api/auth/login", { username: "diver", password: "diver123" });
  diverCookie = extractCookie(diverLogin);

  const projects = await request("GET", "/api/projects", undefined, undefined, godCookie);
  projectId = projects.body[0]?.id;
  assert(!!projectId, `Project available: ${projectId?.slice(0, 8)}`);

  await request("POST", `/api/projects/${projectId}/activate`, undefined, undefined, godCookie);

  const uniqueDate = `2026-06-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
  const newDay = await request("POST", `/api/projects/${projectId}/days`, { date: uniqueDate }, undefined, godCookie);
  if (newDay.status === 201 || newDay.status === 200) {
    dayId = newDay.body.id;
  } else {
    const days = await request("GET", `/api/projects/${projectId}/days`, undefined, undefined, godCookie);
    const openDay = days.body.find((d: any) => d.status !== "CLOSED");
    dayId = openDay?.id || days.body[0]?.id;
  }
  assert(!!dayId, `Day available: ${dayId?.slice(0, 8)}`);
}

async function testDashboardLayout() {
  console.log("\n── 1. Dashboard Layout ──");

  const defaultLayout = await request("GET", "/api/dashboard/layout", undefined, undefined, godCookie);
  assert(defaultLayout.status === 200, `Get default layout: ${defaultLayout.status}`);
  assert(Array.isArray(defaultLayout.body.widgets), "Default layout has widgets array");
  assert(defaultLayout.body.widgets.length >= 1, `Default has ${defaultLayout.body.widgets.length} widgets`);

  const customLayout = {
    widgets: [
      { id: "w1", type: "daily_summary", title: "Summary", x: 0, y: 0, w: 3, h: 2 },
      { id: "w2", type: "safety_incidents", title: "Safety", x: 3, y: 0, w: 1, h: 1 },
    ],
    version: 2,
  };
  const saveRes = await request("POST", "/api/dashboard/layout", customLayout, undefined, godCookie);
  assert(saveRes.status === 200, `Save custom layout: ${saveRes.status}`);
  assert(saveRes.body.success === true, "Save returns success: true");

  const reloadLayout = await request("GET", "/api/dashboard/layout", undefined, undefined, godCookie);
  assert(reloadLayout.status === 200, `Reload saved layout: ${reloadLayout.status}`);
  assert(reloadLayout.body.widgets.length === 2, `Saved layout has 2 widgets: ${reloadLayout.body.widgets?.length}`);
  assert(reloadLayout.body.widgets[0].type === "daily_summary", "First widget type preserved");

  const badLayout = await request("POST", "/api/dashboard/layout", { noWidgets: true }, undefined, godCookie);
  assert(badLayout.status === 400, `Reject invalid layout: ${badLayout.status}`);

  const supLayout = await request("GET", "/api/dashboard/layout", undefined, undefined, supervisorCookie);
  assert(supLayout.status === 200, `Supervisor gets own layout: ${supLayout.status}`);

  const diverLayout = await request("GET", "/api/dashboard/layout", undefined, undefined, diverCookie);
  assert(diverLayout.status === 200, `Diver can read layout: ${diverLayout.status}`);
}

async function testDashboardStats() {
  console.log("\n── 2. Dashboard Stats ──");

  await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "0800 Deployed ROV for pipeline inspection",
  }, undefined, godCookie);

  await request("POST", "/api/log-events", {
    dayId,
    projectId,
    rawText: "0830 JD L/S at 60 fsw for hull cleaning",
  }, undefined, godCookie);

  const stats = await request("GET", "/api/dashboard/stats", undefined, undefined, godCookie);
  assert(stats.status === 200, `Get stats: ${stats.status}`);
  assert(typeof stats.body.totalDives === "number", `totalDives is number: ${stats.body.totalDives}`);
  assert(typeof stats.body.logEntriesToday === "number", `logEntriesToday is number: ${stats.body.logEntriesToday}`);
  assert(typeof stats.body.openRisks === "number", `openRisks is number: ${stats.body.openRisks}`);
  assert(typeof stats.body.safetyIncidents === "number", `safetyIncidents is number: ${stats.body.safetyIncidents}`);

  const supStats = await request("GET", "/api/dashboard/stats", undefined, undefined, supervisorCookie);
  assert(supStats.status === 200, `Supervisor can get stats: ${supStats.status}`);

  const diverStats = await request("GET", "/api/dashboard/stats", undefined, undefined, diverCookie);
  assert(diverStats.status === 200, `Diver can get stats: ${diverStats.status}`);
}

async function testRecentLogs() {
  console.log("\n── 3. Recent Logs Feed ──");

  const recent = await request("GET", "/api/dashboard/recent-logs", undefined, undefined, godCookie);
  assert(recent.status === 200, `Get recent logs: ${recent.status}`);
  assert(Array.isArray(recent.body), "Recent logs is array");

  if (recent.body.length > 0) {
    const log = recent.body[0];
    assert(log.id !== undefined, "Log has id");
    assert(log.rawText !== undefined, "Log has rawText");
    assert(log.captureTime !== undefined, "Log has captureTime");
    assert(log.category !== undefined, "Log has category");
  }

  assert(recent.body.length <= 8, `Max 8 recent logs: ${recent.body.length}`);

  const supRecent = await request("GET", "/api/dashboard/recent-logs", undefined, undefined, supervisorCookie);
  assert(supRecent.status === 200, `Supervisor can get recent logs: ${supRecent.status}`);
}

async function testWeatherEndpoint() {
  console.log("\n── 4. Weather API ──");

  const weather = await request("GET", "/api/weather?lat=29.95&lon=-90.07&location=Gulf+of+Mexico", undefined, undefined, godCookie);
  assert(weather.status === 200 || weather.status === 503, `Weather returns 200 or 503 (not configured): ${weather.status}`);

  if (weather.status === 200) {
    assert(typeof weather.body === "object", "Weather returns data object");
  } else {
    assert(weather.body.message !== undefined, "503 indicates not configured");
  }

  const lightning = await request("GET", "/api/weather/lightning?lat=29.95&lon=-90.07", undefined, undefined, godCookie);
  assert(lightning.status === 200 || lightning.status === 503, `Lightning returns 200 or 503: ${lightning.status}`);

  const noAuth = await request("GET", "/api/weather?lat=29.95&lon=-90.07");
  assert(noAuth.status === 401, `Weather requires auth: ${noAuth.status}`);
}

async function testFeatureFlags() {
  console.log("\n── 5. Feature Flags ──");

  const flags = await request("GET", "/api/admin/feature-flags", undefined, undefined, godCookie);
  assert(flags.status === 200, `Get feature flags: ${flags.status}`);
  assert(typeof flags.body === "object", "Flags is an object");

  const setFlag = await request("POST", "/api/admin/feature-flags", {
    flag: "closeDay",
    enabled: false,
  }, undefined, godCookie);
  assert(setFlag.status === 200, `Set flag: ${setFlag.status}`);

  const closeAttempt = await request("POST", `/api/days/${dayId}/close`, { forceClose: true }, undefined, godCookie);
  assert(closeAttempt.status === 503, `Close blocked by feature flag: ${closeAttempt.status}`);

  const resetFlags = await request("POST", "/api/admin/feature-flags/reset", undefined, undefined, godCookie);
  assert(resetFlags.status === 200, `Reset flags: ${resetFlags.status}`);

  const supFlags = await request("GET", "/api/admin/feature-flags", undefined, undefined, supervisorCookie);
  assert(supFlags.status === 403, `Supervisor can't manage flags: ${supFlags.status}`);

  const diverFlags = await request("GET", "/api/admin/feature-flags", undefined, undefined, diverCookie);
  assert(diverFlags.status === 403, `Diver can't manage flags: ${diverFlags.status}`);
}

async function testBreathingGas() {
  console.log("\n── 6. Breathing Gas Configuration ──");

  const setGas = await request("PATCH", `/api/days/${dayId}/breathing-gas`, {
    breathingGas: "Air",
  }, undefined, godCookie);
  assert(setGas.status === 200, `Set breathing gas: ${setGas.status}`);
  assert(setGas.body.day !== undefined, "Response includes day");
  assert(typeof setGas.body.propagatedTo === "number", `Propagated count: ${setGas.body.propagatedTo}`);

  const setNitrox = await request("PATCH", `/api/days/${dayId}/breathing-gas`, {
    breathingGas: "Nitrox",
    fo2Percent: 32,
  }, undefined, godCookie);
  assert(setNitrox.status === 200, `Set Nitrox: ${setNitrox.status}`);

  const diverGas = await request("PATCH", `/api/days/${dayId}/breathing-gas`, {
    breathingGas: "HeO2",
  }, undefined, diverCookie);
  assert(diverGas.status === 403, `Diver can't set gas: ${diverGas.status}`);

  const supGas = await request("PATCH", `/api/days/${dayId}/breathing-gas`, {
    breathingGas: "Air",
  }, undefined, supervisorCookie);
  assert(supGas.status === 200, `Supervisor can set gas: ${supGas.status}`);
}

async function testDaySummary() {
  console.log("\n── 7. Day Summary & Status ──");

  const status = await request("GET", `/api/days/${dayId}/status`, undefined, undefined, godCookie);
  assert(status.status === 200, `Get day status: ${status.status}`);
  assert(status.body.status !== undefined, `Status field present: ${status.body.status}`);

  const summary = await request("GET", `/api/days/${dayId}/summary`, undefined, undefined, godCookie);
  assert(summary.status === 200 || summary.status === 404, `Get day summary: ${summary.status}`);

  const diverStatus = await request("GET", `/api/days/${dayId}/status`, undefined, undefined, diverCookie);
  assert(diverStatus.status === 200, `Diver can read status: ${diverStatus.status}`);
}

async function run() {
  await setup();
  await testDashboardLayout();
  await testDashboardStats();
  await testRecentLogs();
  await testWeatherEndpoint();
  await testFeatureFlags();
  await testBreathingGas();
  await testDaySummary();

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
