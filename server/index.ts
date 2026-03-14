import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { passport } from "./auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { apiLimiter } from "./rate-limit";
import { startPeriodicSweep } from "./sweep";
import { runMigrations } from "./migrate";
import crypto from "crypto";

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

const app = express();

function isExplicitLocalMode(): boolean {
  return process.env.NODE_ENV === "development" || process.env.LOCAL_DEV_MODE === "true";
}

function validateEnvironment() {
  const localMode = isExplicitLocalMode();
  const isProd = process.env.NODE_ENV === "production";

  if (!process.env.SESSION_SECRET && !localMode) {
    console.error("[FATAL] SESSION_SECRET environment variable is required outside explicit local development mode. Exiting.");
    process.exit(1);
  }

  if (process.env.ENABLE_CORS === "true" && process.env.CSRF_MODE !== "token") {
    console.error("[FATAL] ENABLE_CORS=true requires CSRF_MODE=token to protect state-changing routes. Exiting.");
    process.exit(1);
  }

  if (isProd && process.env.DEV_SEED_TOKEN) {
    console.error("[FATAL] DEV_SEED_TOKEN must not be configured in production. Exiting.");
    process.exit(1);
  }

  if (process.env.BOOTSTRAP_ENABLED === "true") {
    if (!process.env.BOOTSTRAP_SECRET) {
      console.error("[FATAL] BOOTSTRAP_ENABLED=true requires BOOTSTRAP_SECRET. Exiting.");
      process.exit(1);
    }

    const expiresAt = process.env.BOOTSTRAP_EXPIRES_AT;
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      console.error("[FATAL] BOOTSTRAP_ENABLED=true requires a valid BOOTSTRAP_EXPIRES_AT timestamp. Exiting.");
      process.exit(1);
    }

    if (Date.now() > Date.parse(expiresAt)) {
      console.error("[FATAL] BOOTSTRAP_EXPIRES_AT is already in the past. Exiting.");
      process.exit(1);
    }

    if (isProd) {
      console.error("[FATAL] BOOTSTRAP_ENABLED must be false in production deployments. Exiting.");
      process.exit(1);
    }
  }
}

validateEnvironment();

const localFallbackSessionSecret = crypto.randomBytes(32).toString("hex");

function resolveSessionSecret(): string {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (isExplicitLocalMode()) {
    console.warn("[WARN] SESSION_SECRET not set in local mode — using ephemeral in-memory secret for this process only.");
    return localFallbackSessionSecret;
  }

  throw new Error("SESSION_SECRET is required outside explicit local development mode");
}

// Trust first proxy (Azure Container Apps, AWS ALB, etc.)
// Required for secure cookies to work behind a reverse proxy
app.set("trust proxy", 1);

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }

  next();
});

const PgSession = connectPgSimple(session);

// Session store with error logging
const sessionStore = new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: "session",
  createTableIfMissing: true,
});

sessionStore.on("error", (error: any) => {
  console.error("[SESSION STORE ERROR]", error);
});

// Allow runtime override of cookie secure flag via COOKIE_SECURE env var
const cookieSecure = process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production";

// Session middleware - stored in PostgreSQL so sessions survive restarts
app.use(
  session({
    store: sessionStore,
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
    },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting on all API routes
app.use("/api", apiLimiter);

// SEC-04: CSRF PROTECTION DECISION (Documented 2025-03)
// ─────────────────────────────────────────────────────────────────────────────
// CSRF token middleware was intentionally removed. The application relies on
// SameSite=lax session cookies for CSRF protection, which is the recommended
// approach for same-origin SPAs per OWASP guidelines:
//   - SameSite=lax prevents cross-site POST requests from sending cookies
//   - All API endpoints are same-origin (/api/*) — no cross-origin requests
//   - The frontend is served from the same domain as the API
//   - No CORS is configured, so cross-origin XHR/fetch is blocked by browsers
// The previous double-submit cookie middleware was removed because the frontend
// never sent the X-CSRF-Token header, causing all state-changing requests to fail.
// If cross-origin API access is ever needed, re-evaluate CSRF protection.

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedErrorMessage: string | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    if (res.statusCode >= 400 && bodyJson?.message) {
      capturedErrorMessage = String(bodyJson.message).substring(0, 200);
    }
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedErrorMessage) {
        logLine += ` :: ${capturedErrorMessage}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === "true") {
    await runMigrations();
  }

  registerChatRoutes(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      startPeriodicSweep();
    },
  );
})();
