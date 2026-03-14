import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { requireProjectAccess } from "../authz";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v;
}

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api
// ────────────────────────────────────────────────────────────────────────────

export const facilitiesRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// DIRECTORY FACILITIES
// ──────────────────────────────────────────────────────────────────────────

facilitiesRouter.get("/directory-facilities", requireAuth, async (req: Request, res: Response) => {
  const facilities = await storage.getAllDirectoryFacilities();
  res.json(facilities);
});

facilitiesRouter.post("/directory-facilities", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    // Provide defaults for lat/lng if not supplied (Bug #4 & #8)
    const body = {
      ...req.body,
      lat: req.body.lat || "0",
      lng: req.body.lng || "0",
      verifiedBy: user.id,
      lastVerifiedAt: new Date(),
    };

    const facility = await storage.createDirectoryFacility(body);
    res.status(201).json(facility);
  } catch (error: any) {
    console.error("Create facility error:", error);
    res.status(500).json({ message: error?.message || "Failed to create facility" });
  }
});

facilitiesRouter.patch("/directory-facilities/:id", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  const user = getUser(req);

  const updated = await storage.updateDirectoryFacility(p(req.params.id), {
    ...req.body,
    verifiedBy: user.id,
    lastVerifiedAt: new Date(),
  });

  if (!updated) return res.status(404).json({ message: "Facility not found" });
  res.json(updated);
});

// ──────────────────────────────────────────────────────────────────────────
// PROJECT DIRECTORY
// ──────────────────────────────────────────────────────────────────────────

facilitiesRouter.get("/projects/:projectId/directory", requireAuth, requireProjectAccess(), async (req: Request, res: Response) => {
  const directory = await storage.getProjectDirectory(p(req.params.projectId));
  res.json(directory || { status: "NEEDS_VERIFICATION" });
});

facilitiesRouter.post("/projects/:projectId/directory/verify", requireRole("ADMIN", "GOD"), requireProjectAccess(), async (req: Request, res: Response) => {
  const user = getUser(req);

  let directory = await storage.getProjectDirectory(p(req.params.projectId));

  if (directory) {
    directory = await storage.updateProjectDirectory(directory.id, {
      ...req.body,
      status: "VERIFIED",
      verifiedBy: user.id,
      verifiedAt: new Date(),
    });
  } else {
    directory = await storage.createProjectDirectory({
      projectId: p(req.params.projectId),
      ...req.body,
      status: "VERIFIED",
      verifiedBy: user.id,
      verifiedAt: new Date(),
    });
  }

  res.json(directory);
});

// ──────────────────────────────────────────────────────────────────────────
// ALIAS ROUTES (for clients that POST to /api/facilities directly)
// ──────────────────────────────────────────────────────────────────────────

facilitiesRouter.post("/facilities", requireRole("ADMIN", "GOD"), async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { name, type, facilityType, address, location, lat, latitude, lng, longitude, phone, hours, notes } = req.body;
    const resolvedType = facilityType || type;
    if (!name || !resolvedType) return res.status(400).json({ message: "name and type (or facilityType) are required" });
    const facility = await storage.createDirectoryFacility({
      name,
      facilityType: resolvedType,
      address: address || location || "Unknown",
      lat: lat || latitude || "0",
      lng: lng || longitude || "0",
      phone: phone || null,
      hours: hours || null,
      notes: notes || null,
      verifiedBy: user.id,
      lastVerifiedAt: new Date(),
    });
    res.status(201).json(facility);
  } catch (error: any) {
    console.error("Create facility error:", error);
    res.status(500).json({ message: error?.message || "Failed to create facility" });
  }
});

facilitiesRouter.get("/facilities", requireAuth, async (req: Request, res: Response) => {
  try {
    const facilities = await storage.getAllDirectoryFacilities();
    res.json(facilities);
  } catch (error: any) {
    // CRIT-04 FIX: If the table doesn't exist yet, return empty array instead of 500
    if (error?.code === "42P01" || error?.message?.includes("does not exist")) {
      console.warn("[Facilities] Table not found, returning empty array");
      return res.json([]);
    }
    console.error("Get facilities error:", error);
    res.status(500).json({ message: "Failed to get facilities" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// GEOCODING ENDPOINT (Item #1)
// ──────────────────────────────────────────────────────────────────────────

facilitiesRouter.get("/geocode", requireAuth, async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;
    if (!address) return res.status(400).json({ message: "Address query parameter is required" });

    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: { "User-Agent": "DiveOps-MVP/1.0 (contact@precisionsubsea.com)" },
    });
    if (!response.ok) {
      return res.status(502).json({ message: "Geocoding service unavailable" });
    }
    const results = await response.json() as any[];
    if (!results || results.length === 0) {
      return res.json({ lat: null, lng: null, displayName: null });
    }
    const { lat, lon, display_name } = results[0];
    res.json({ lat: String(lat), lng: String(lon), displayName: display_name });
  } catch (error: any) {
    console.error("Geocoding error:", error);
    res.status(500).json({ message: error?.message || "Geocoding failed" });
  }
});
