import type { Express, Request, Response } from "express";
import type { User } from "@shared/schema";

interface RegisterWeatherRoutesDeps {
  requireAuth: (req: Request, res: Response, next: any) => unknown;
  getUser: (req: Request) => User;
  storage: any;
}

export function registerWeatherRoutes(app: Express, deps: RegisterWeatherRoutesDeps) {
  const { requireAuth, getUser, storage } = deps;

  app.get("/api/weather", requireAuth, async (req: Request, res: Response) => {
    try {
      const { lat, lon, location } = req.query;
      const apiKey = process.env.OPENWEATHER_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          message: "Weather API not configured",
          configured: false,
        });
      }

      let queryParams = `appid=${apiKey}&units=metric`;

      if (lat && lon) {
        queryParams += `&lat=${lat}&lon=${lon}`;
      } else if (location) {
        queryParams += `&q=${encodeURIComponent(location as string)}`;
      } else {
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

      const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?${queryParams}`);

      if (!weatherRes.ok) {
        const error = await weatherRes.text();
        return res.status(weatherRes.status).json({ message: error });
      }

      const data = await weatherRes.json();

      const hasThunderstorm = data.weather?.some((w: any) => w.id >= 200 && w.id < 300);

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

  app.get("/api/weather/lightning", requireAuth, async (req: Request, res: Response) => {
    try {
      const { lat, lon } = req.query;
      const apiKey = process.env.OPENWEATHER_API_KEY;

      if (!apiKey) {
        return res.status(503).json({
          message: "Weather API not configured",
          configured: false,
        });
      }

      if (!lat || !lon) {
        return res.status(400).json({ message: "Coordinates required" });
      }

      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
      );

      if (!forecastRes.ok) {
        const error = await forecastRes.text();
        return res.status(forecastRes.status).json({ message: error });
      }

      const data = await forecastRes.json();

      const alerts = data.list
        ?.filter((item: any) => item.weather?.some((w: any) => w.id >= 200 && w.id < 300))
        .map((item: any) => ({
          time: item.dt,
          timeText: item.dt_txt,
          conditions: item.weather?.[0]?.description,
          probability: item.pop,
          temp: Math.round(item.main?.temp),
        })) || [];

      res.json({
        configured: true,
        location: data.city?.name,
        thunderstormAlerts: alerts,
        hasUpcomingStorms: alerts.length > 0,
        nextStormTime: alerts[0]?.time || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
