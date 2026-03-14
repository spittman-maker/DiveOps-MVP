import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageMock, isEnabledMock } = vi.hoisted(() => ({
  storageMock: {
    getProject: vi.fn(),
    getProjectMembers: vi.fn(),
    getDay: vi.fn(),
  },
  isEnabledMock: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: storageMock,
}));

vi.mock("../../server/feature-flags", () => ({
  isEnabled: isEnabledMock,
}));

import { requireProjectAccess, requireDayAccess } from "../../server/authz";

type Role = "GOD" | "ADMIN" | "SUPERVISOR" | "DIVER";

function makeReq({ role, companyId, userId, params }: { role: Role; companyId?: string; userId?: string; params: Record<string, string> }) {
  return {
    params,
    user: { id: userId ?? "u-1", role, companyId },
    isAuthenticated: () => true,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authz tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEnabledMock.mockReturnValue(true);
  });

  it("blocks supervisor from accessing project in another company", async () => {
    const req = makeReq({ role: "SUPERVISOR", companyId: "company-a", params: { projectId: "proj-1" } });
    const res = makeRes();
    const next = vi.fn();

    storageMock.getProject.mockResolvedValue({ id: "proj-1", companyId: "company-b" });

    await requireProjectAccess()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Forbidden: project belongs to a different company" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows admin for same-company project without membership check", async () => {
    const req = makeReq({ role: "ADMIN", companyId: "company-a", params: { projectId: "proj-1" } });
    const res = makeRes();
    const next = vi.fn();

    storageMock.getProject.mockResolvedValue({ id: "proj-1", companyId: "company-a" });

    await requireProjectAccess()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(storageMock.getProjectMembers).not.toHaveBeenCalled();
  });

  it("requires diver membership even for same-company project", async () => {
    const req = makeReq({ role: "DIVER", companyId: "company-a", userId: "diver-1", params: { projectId: "proj-1" } });
    const res = makeRes();
    const next = vi.fn();

    storageMock.getProject.mockResolvedValue({ id: "proj-1", companyId: "company-a" });
    storageMock.getProjectMembers.mockResolvedValue([{ userId: "someone-else" }]);

    await requireProjectAccess()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not a member of this project" });
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks day access when day project belongs to another company", async () => {
    const req = makeReq({ role: "SUPERVISOR", companyId: "company-a", params: { dayId: "day-1" } });
    const res = makeRes();
    const next = vi.fn();

    storageMock.getDay.mockResolvedValue({ id: "day-1", projectId: "proj-2" });
    storageMock.getProject.mockResolvedValue({ id: "proj-2", companyId: "company-b" });

    await requireDayAccess()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Forbidden: project belongs to a different company" });
    expect(next).not.toHaveBeenCalled();
  });

  it("permits GOD cross-company access", async () => {
    const req = makeReq({ role: "GOD", params: { dayId: "day-1" } });
    const res = makeRes();
    const next = vi.fn();

    await requireDayAccess()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(storageMock.getDay).not.toHaveBeenCalled();
  });
});
