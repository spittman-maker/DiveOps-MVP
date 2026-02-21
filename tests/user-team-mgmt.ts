import http from "http";

const BASE = "http://localhost:5000";
let godCookie = "";
let adminCookie = "";
let supervisorCookie = "";
let diverCookie = "";
let projectId = "";

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
  console.log("║  USER & TEAM MANAGEMENT TEST SUITE                           ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  await request("POST", "/api/seed");
  const godLogin = await request("POST", "/api/auth/login", { username: "god", password: "godmode" });
  godCookie = extractCookie(godLogin);
  assert(godLogin.status === 200 && !!godCookie, "GOD login");

  const adminUser = `admin_${Date.now()}`;
  await request("POST", "/api/users", {
    username: adminUser,
    password: "admin123",
    role: "ADMIN",
    fullName: "Test Admin",
  }, undefined, godCookie);
  const adminLogin = await request("POST", "/api/auth/login", { username: adminUser, password: "admin123" });
  adminCookie = extractCookie(adminLogin);
  assert(adminLogin.status === 200 && !!adminCookie, "Admin login");

  const supLogin = await request("POST", "/api/auth/login", { username: "supervisor", password: "supervisor123" });
  supervisorCookie = extractCookie(supLogin);
  assert(supLogin.status === 200 && !!supervisorCookie, "Supervisor login");

  const diverLogin = await request("POST", "/api/auth/login", { username: "diver", password: "diver123" });
  diverCookie = extractCookie(diverLogin);
  assert(diverLogin.status === 200 && !!diverCookie, "Diver login");

  const projects = await request("GET", "/api/projects", undefined, undefined, godCookie);
  projectId = projects.body[0]?.id;
  assert(!!projectId, `Project: ${projectId?.slice(0, 8)}`);
}

async function testListUsers() {
  console.log("\n── 1. List Users ──");

  const godUsers = await request("GET", "/api/users", undefined, undefined, godCookie);
  assert(godUsers.status === 200, `GOD list users: ${godUsers.status}`);
  assert(Array.isArray(godUsers.body), "Users is array");
  assert(godUsers.body.length >= 3, `Has at least 3 users: ${godUsers.body.length}`);

  const noPasswords = godUsers.body.every((u: any) => u.password === undefined);
  assert(noPasswords, "No passwords exposed in list");

  const hasRequiredFields = godUsers.body[0];
  assert(hasRequiredFields.id !== undefined, "User has id");
  assert(hasRequiredFields.username !== undefined, "User has username");
  assert(hasRequiredFields.role !== undefined, "User has role");

  const adminUsers = await request("GET", "/api/users", undefined, undefined, adminCookie);
  assert(adminUsers.status === 200, `Admin list users: ${adminUsers.status}`);

  const supUsers = await request("GET", "/api/users", undefined, undefined, supervisorCookie);
  assert(supUsers.status === 403, `Supervisor can't list users: ${supUsers.status}`);

  const diverUsers = await request("GET", "/api/users", undefined, undefined, diverCookie);
  assert(diverUsers.status === 403, `Diver can't list users: ${diverUsers.status}`);
}

async function testCreateUser() {
  console.log("\n── 2. Create User ──");

  const uniqueName = `testuser_${Date.now()}`;
  const createRes = await request("POST", "/api/users", {
    username: uniqueName,
    password: "test1234",
    role: "DIVER",
    fullName: "Test Diver User",
    initials: "TDU",
  }, undefined, godCookie);
  assert(createRes.status === 201, `Create user: ${createRes.status}`);
  assert(createRes.body.username === uniqueName, `Username correct: ${createRes.body.username}`);
  assert(createRes.body.role === "DIVER", `Role correct: ${createRes.body.role}`);
  assert(createRes.body.password === undefined, "Password not in response");

  const dupRes = await request("POST", "/api/users", {
    username: uniqueName,
    password: "test1234",
    role: "DIVER",
  }, undefined, godCookie);
  assert(dupRes.status === 400, `Duplicate username rejected: ${dupRes.status}`);

  const noPassword = await request("POST", "/api/users", {
    username: `nopass_${Date.now()}`,
    role: "DIVER",
  }, undefined, godCookie);
  assert(noPassword.status === 400, `Missing password rejected: ${noPassword.status}`);

  const supCreate = await request("POST", "/api/users", {
    username: `supcreate_${Date.now()}`,
    password: "test1234",
    role: "DIVER",
  }, undefined, supervisorCookie);
  assert(supCreate.status === 403, `Supervisor can't create: ${supCreate.status}`);

  const adminCreate = await request("POST", "/api/users", {
    username: `admcreate_${Date.now()}`,
    password: "test1234",
    role: "DIVER",
    fullName: "Admin Created User",
  }, undefined, adminCookie);
  assert(adminCreate.status === 201, `Admin can create user: ${adminCreate.status}`);
}

async function testUpdateUser() {
  console.log("\n── 3. Update User ──");

  const users = await request("GET", "/api/users", undefined, undefined, godCookie);
  const testUser = users.body.find((u: any) => u.role === "DIVER");
  if (!testUser) {
    console.log("  (No diver user to update, skipping)");
    return;
  }

  const updateRes = await request("PATCH", `/api/users/${testUser.id}`, {
    fullName: "Updated Full Name",
    initials: "UFN",
  }, undefined, godCookie);
  assert(updateRes.status === 200, `Update user: ${updateRes.status}`);
  assert(updateRes.body.fullName === "Updated Full Name", `Name updated: ${updateRes.body.fullName}`);
  assert(updateRes.body.password === undefined, "Password not in update response");

  const updatePassword = await request("PATCH", `/api/users/${testUser.id}`, {
    password: "newPassword123",
  }, undefined, godCookie);
  assert(updatePassword.status === 200, `Update password: ${updatePassword.status}`);

  const notFound = await request("PATCH", `/api/users/nonexistent-id`, {
    fullName: "Test",
  }, undefined, godCookie);
  assert(notFound.status === 404, `Not found user: ${notFound.status}`);

  const diverUpdate = await request("PATCH", `/api/users/${testUser.id}`, {
    fullName: "Hacked",
  }, undefined, diverCookie);
  assert(diverUpdate.status === 403, `Diver can't update users: ${diverUpdate.status}`);
}

async function testProjectMembers() {
  console.log("\n── 4. Project Members ──");

  const members = await request("GET", `/api/projects/${projectId}/members`, undefined, undefined, godCookie);
  assert(members.status === 200, `Get members: ${members.status}`);
  assert(Array.isArray(members.body), "Members is array");

  const diverMembers = await request("GET", `/api/projects/${projectId}/members`, undefined, undefined, diverCookie);
  assert(diverMembers.status === 200, `Diver can read members: ${diverMembers.status}`);

  const users = await request("GET", "/api/users", undefined, undefined, godCookie);
  const diverUser = users.body.find((u: any) => u.username === "diver");

  if (diverUser) {
    const alreadyMember = members.body.some((m: any) => m.userId === diverUser.id);

    if (!alreadyMember) {
      const addMember = await request("POST", `/api/projects/${projectId}/members`, {
        userId: diverUser.id,
        role: "DIVER",
      }, undefined, godCookie);
      assert(addMember.status === 201 || addMember.status === 200, `Add member: ${addMember.status}`);

      const reloadMembers = await request("GET", `/api/projects/${projectId}/members`, undefined, undefined, godCookie);
      const found = reloadMembers.body.some((m: any) => m.userId === diverUser.id);
      assert(found, "New member appears in list");

      const removeMember = await request("DELETE", `/api/projects/${projectId}/members/${diverUser.id}`, undefined, undefined, godCookie);
      assert(removeMember.status === 200, `Remove member: ${removeMember.status}`);
    } else {
      assert(true, "Diver already a member, testing remove");
      const removeMember = await request("DELETE", `/api/projects/${projectId}/members/${diverUser.id}`, undefined, undefined, godCookie);
      assert(removeMember.status === 200 || removeMember.status === 404, `Remove existing member: ${removeMember.status}`);

      const reAdd = await request("POST", `/api/projects/${projectId}/members`, {
        userId: diverUser.id,
        role: "DIVER",
      }, undefined, godCookie);
      assert(reAdd.status === 201 || reAdd.status === 200, `Re-add member: ${reAdd.status}`);
    }
  }

  const diverAdd = await request("POST", `/api/projects/${projectId}/members`, {
    userId: "some-id",
    role: "DIVER",
  }, undefined, diverCookie);
  assert(diverAdd.status === 403, `Diver can't add members: ${diverAdd.status}`);

  const supAdd = await request("POST", `/api/projects/${projectId}/members`, {
    userId: "some-id",
    role: "DIVER",
  }, undefined, supervisorCookie);
  assert(supAdd.status === 403, `Supervisor can't add members: ${supAdd.status}`);
}

async function testProjectCRUD() {
  console.log("\n── 5. Project CRUD ──");

  const list = await request("GET", "/api/projects", undefined, undefined, godCookie);
  assert(list.status === 200, `List projects: ${list.status}`);
  assert(Array.isArray(list.body), "Projects is array");
  assert(list.body.length >= 1, `Has at least 1 project: ${list.body.length}`);

  const uniqueProject = `Test Project ${Date.now()}`;
  const createRes = await request("POST", "/api/projects", {
    name: uniqueProject,
    client: "Test Client Corp",
    location: "Gulf of Mexico",
  }, undefined, godCookie);
  assert(createRes.status === 201 || createRes.status === 200, `Create project: ${createRes.status}`);
  const newProjectId = createRes.body.id;

  const getOne = await request("GET", `/api/projects/${newProjectId}`, undefined, undefined, godCookie);
  assert(getOne.status === 200, `Get single project: ${getOne.status}`);
  assert(getOne.body.name === uniqueProject, `Project name: ${getOne.body.name}`);

  const patchRes = await request("PATCH", `/api/projects/${newProjectId}`, {
    location: "North Sea",
  }, undefined, godCookie);
  assert(patchRes.status === 200, `Update project: ${patchRes.status}`);

  const supCreate = await request("POST", "/api/projects", {
    name: "Sup Project",
    client: "Client",
    location: "Here",
  }, undefined, supervisorCookie);
  assert(supCreate.status === 403, `Supervisor can't create project: ${supCreate.status}`);

  const diverList = await request("GET", "/api/projects", undefined, undefined, diverCookie);
  assert(diverList.status === 200, `Diver can list projects: ${diverList.status}`);
}

async function testSetupEndpoints() {
  console.log("\n── 6. Setup Status ──");

  const status = await request("GET", "/api/setup/status");
  assert(status.status === 200, `Setup status: ${status.status}`);
  assert(typeof status.body.initialized === "boolean" || status.body.needsSetup !== undefined,
    "Setup status has initialization info");
}

async function run() {
  await setup();
  await testListUsers();
  await testCreateUser();
  await testUpdateUser();
  await testProjectMembers();
  await testProjectCRUD();
  await testSetupEndpoints();

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
