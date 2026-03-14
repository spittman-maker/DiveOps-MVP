import type { Express, Request, Response } from "express";
import type { User } from "@shared/schema";

interface RegisterDashboardLayoutRoutesDeps {
  requireAuth: (req: Request, res: Response, next: any) => unknown;
  getUser: (req: Request) => User;
  storage: any;
  pool: any;
}

export function registerDashboardLayoutRoutes(app: Express, deps: RegisterDashboardLayoutRoutesDeps) {
  const { requireAuth, getUser, storage, pool } = deps;

  app.get("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const layout = await storage.getDashboardLayout(user.id);

      if (!layout) {
        return res.json({
          widgets: [
            { id: "w1", type: "live_dive_board", title: "Live Dive Board", x: 0, y: 0, w: 4, h: 3 },
            { id: "w2", type: "live_log_feed", title: "Live Log Feed", x: 0, y: 3, w: 2, h: 3 },
            { id: "w3", type: "station_overview", title: "Station Overview", x: 2, y: 3, w: 2, h: 3 },
            { id: "w4", type: "daily_summary", title: "Today's Summary", x: 0, y: 6, w: 2, h: 2 },
            { id: "w5", type: "safety_incidents", title: "Safety Status", x: 2, y: 6, w: 2, h: 2 },
            { id: "w6", type: "diver_certs", title: "Diver Certifications", x: 0, y: 8, w: 2, h: 2 },
            { id: "w7", type: "equipment_certs", title: "Equipment Certifications", x: 2, y: 8, w: 2, h: 2 },
          ],
          version: 2,
        });
      }

      res.json(layout.layoutData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      await pool.query('DELETE FROM "dashboard_layouts" WHERE "user_id" = $1', [user.id]);
      res.json({ message: "Dashboard layout reset to default" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const layoutData = req.body;

      if (!layoutData.widgets || !Array.isArray(layoutData.widgets)) {
        return res.status(400).json({ message: "Invalid layout data" });
      }

      const saved = await storage.saveDashboardLayout(user.id, layoutData);
      res.json({ success: true, layout: saved.layoutData });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
