import express, { type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import type { User } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getUser(req: Request): User {
  return req.user as User;
}

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api/weather
// ────────────────────────────────────────────────────────────────────────────

export const weatherRouter = express.Router();

weatherRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { lat, lon, location } = req.query;
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        message: "Weather API not configured",
        configured: false
      });
    }

    let queryParams = `appid=${apiKey}&units=metric`;

    if (lat && lon) {
      queryParams += `&lat=${lat}&lon=${lon}`;
    } else if (location) {
      queryParams += `&q=${encodeURIComponent(location as string)}`;
    } else {
      // HIGH-01 FIX: Fall back to the user's active project location when no params passed
      try {
        const user = getUser(req);
        const prefs = await storage.getUserPreferences(user.id);
        if (prefs?.activeProjectId) {
          const project = await storage.getProject(prefs.activeProjectId);
          if (project?.jobsiteLat && project?.jobsiteLng) {
            queryParams += `&lat=${project.jobsiteLat}&lon=${project.jobsiteLng}`;
          } else if (project?.jobsiteName) {
            queryParams += `&q=${encodeURIComponent(project.jobsiteName)}`;
          } else {
            return res.status(400).json({ message: "Location or coordinates required. Active project has no location set." });
          }
        } else {
          return res.status(400).json({ message: "Location or coordinates required. No active project selected." });
        }
      } catch {
        return res.status(400).json({ message: "Location or coordinates required" });
      }
    }

    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?${queryParams}`
    );

    if (!weatherRes.ok) {
      const error = await weatherRes.text();
      return res.status(weatherRes.status).json({ message: error });
    }

    const data = await weatherRes.json();

    const hasThunderstorm = data.weather?.some((w: any) =>
      w.id >= 200 && w.id < 300
    );

    res.json({
      configured: true,
      location: data.name,
      country: data.sys?.country,
      temp: Math.round(data.main?.temp),
      feelsLike: Math.round(data.main?.feels_like),
      humidity: data.main?.humidity,
      windSpeed: data.wind?.speed,
      windDir: data.wind?.deg,
      conditions: data.weather?.[0]?.main,
      description: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon,
      hasThunderstorm,
      visibility: data.visibility,
      pressure: data.main?.pressure,
      clouds: data.clouds?.all,
      sunrise: data.sys?.sunrise,
      sunset: data.sys?.sunset,
      timestamp: data.dt,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

weatherRouter.get("/lightning", requireAuth, async (req: Request, res: Response) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ message: "Coordinates required" });
    }

    const tomorrowKey = process.env.TOMORROW_IO_API_KEY;
    const owmKey = process.env.OPENWEATHER_API_KEY;

    // ── Tomorrow.io lightning data (primary) ──────────────────────────────
    let lightningData: {
      configured: boolean;
      source: string;
      flashRateDensity: number | null;
      nearestLightningMiles: number | null;
      threatLevel: "none" | "low" | "moderate" | "high" | "severe";
      threatColor: string;
      stopWork: boolean;
      warningBanner: boolean;
      message: string;
    } | null = null;

    if (tomorrowKey) {
      try {
        const tmrwRes = await fetch(
          `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${tomorrowKey}&units=imperial`
        );
        if (tmrwRes.ok) {
          const tmrwData = await tmrwRes.json();
          const flashRate = tmrwData?.data?.values?.lightningFlashRateDensity ?? null;

          // Estimate nearest lightning distance from flash rate density.
          // lightningFlashRateDensity is flashes per sq-mi per 5 min.
          // Higher density → closer / more active lightning.
          // We use a heuristic mapping since the API doesn't give distance directly.
          let nearestMiles: number | null = null;
          let threatLevel: "none" | "low" | "moderate" | "high" | "severe" = "none";
          let threatColor = "#22c55e"; // green
          let stopWork = false;
          let warningBanner = false;
          let message = "No lightning detected";

          if (flashRate !== null && flashRate > 0) {
            // Heuristic distance estimation based on flash rate density:
            // Very high density (>1.0) → likely within 3 miles
            // High density (0.5-1.0) → ~3-5 miles
            // Moderate density (0.1-0.5) → ~5-10 miles
            // Low density (0.01-0.1) → ~10-20 miles
            // Very low density (<0.01) → >20 miles
            if (flashRate >= 1.0) {
              nearestMiles = 2;
              threatLevel = "severe";
              threatColor = "#dc2626"; // red
              stopWork = true;
              warningBanner = true;
              message = "Lightning within 2 miles — STOP WORK per USACE EM 385-1-1 §30";
            } else if (flashRate >= 0.5) {
              nearestMiles = 4;
              threatLevel = "high";
              threatColor = "#dc2626"; // red
              stopWork = true;
              warningBanner = true;
              message = "Lightning within 5 miles — STOP WORK per USACE EM 385-1-1 §30";
            } else if (flashRate >= 0.1) {
              nearestMiles = 8;
              threatLevel = "moderate";
              threatColor = "#f97316"; // orange
              stopWork = false;
              warningBanner = true;
              message = "Lightning detected within 10 miles — monitor closely";
            } else if (flashRate >= 0.01) {
              nearestMiles = 15;
              threatLevel = "low";
              threatColor = "#eab308"; // yellow
              stopWork = false;
              warningBanner = false;
              message = `Lightning activity detected ~${nearestMiles} miles away`;
            } else {
              nearestMiles = 25;
              threatLevel = "low";
              threatColor = "#eab308"; // yellow
              stopWork = false;
              warningBanner = false;
              message = "Distant lightning activity detected (>20 miles)";
            }
          }

          lightningData = {
            configured: true,
            source: "tomorrow.io",
            flashRateDensity: flashRate,
            nearestLightningMiles: nearestMiles,
            threatLevel,
            threatColor,
            stopWork,
            warningBanner,
            message,
          };
        }
      } catch (tmrwErr) {
        console.warn("Tomorrow.io lightning fetch failed:", tmrwErr);
      }
    }

    // ── OpenWeatherMap forecast fallback ───────────────────────────────────
    let forecastAlerts: any[] = [];
    let hasUpcomingStorms = false;
    let owmLocation: string | null = null;

    if (owmKey) {
      try {
        const forecastRes = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${owmKey}&units=metric`
        );
        if (forecastRes.ok) {
          const data = await forecastRes.json();
          owmLocation = data.city?.name || null;
          forecastAlerts = data.list?.filter((item: any) =>
            item.weather?.some((w: any) => w.id >= 200 && w.id < 300)
          ).map((item: any) => ({
            time: item.dt,
            timeText: item.dt_txt,
            conditions: item.weather?.[0]?.description,
            probability: item.pop,
            temp: Math.round(item.main?.temp),
          })) || [];
          hasUpcomingStorms = forecastAlerts.length > 0;
        }
      } catch (owmErr) {
        console.warn("OWM forecast fetch failed:", owmErr);
      }
    }

    // If Tomorrow.io wasn't available, build a basic response from OWM
    if (!lightningData) {
      if (!owmKey && !tomorrowKey) {
        return res.status(503).json({
          configured: false,
          message: "Lightning data not configured. Add TOMORROW_IO_API_KEY or OPENWEATHER_API_KEY.",
        });
      }
      lightningData = {
        configured: !!owmKey,
        source: "openweathermap-forecast",
        flashRateDensity: null,
        nearestLightningMiles: null,
        threatLevel: hasUpcomingStorms ? "low" : "none",
        threatColor: hasUpcomingStorms ? "#eab308" : "#22c55e",
        stopWork: false,
        warningBanner: false,
        message: hasUpcomingStorms
          ? "Thunderstorms in forecast — no real-time distance data (add TOMORROW_IO_API_KEY)"
          : "No lightning detected",
      };
    }

    res.json({
      ...lightningData,
      location: owmLocation,
      thunderstormAlerts: forecastAlerts,
      hasUpcomingStorms,
      nextStormTime: forecastAlerts[0]?.time || null,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// RADAR (RainViewer)
// ──────────────────────────────────────────────────────────────────────────

weatherRouter.get("/radar", requireAuth, async (req: Request, res: Response) => {
  try {
    const radarRes = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    if (!radarRes.ok) {
      return res.status(502).json({
        configured: false,
        message: "Radar data unavailable — RainViewer API returned an error",
      });
    }
    const data = await radarRes.json();

    const host = data.host || "https://tilecache.rainviewer.com";
    const pastFrames = (data.radar?.past || []).map((frame: any) => ({
      time: frame.time,
      path: frame.path,
      // Tile URL template: {host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png
      // Coordinate-centered URL: {host}{path}/{size}/{z}/{lat}/{lon}/{color}/{options}.png
      tileUrl: `${host}${frame.path}/{size}/{z}/{x}/{y}/{color}/{options}.png`,
      coordUrl: `${host}${frame.path}/{size}/{z}/{lat}/{lon}/{color}/{options}.png`,
    }));

    const nowcastFrames = (data.radar?.nowcast || []).map((frame: any) => ({
      time: frame.time,
      path: frame.path,
      tileUrl: `${host}${frame.path}/{size}/{z}/{x}/{y}/{color}/{options}.png`,
      coordUrl: `${host}${frame.path}/{size}/{z}/{lat}/{lon}/{color}/{options}.png`,
    }));

    res.json({
      configured: true,
      generated: data.generated,
      host,
      pastFrames,
      nowcastFrames,
    });
  } catch (error: any) {
    console.error("Radar fetch error:", error);
    res.status(500).json({
      configured: false,
      message: "Radar unavailable",
    });
  }
});
