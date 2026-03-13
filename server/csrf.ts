import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

/**
 * Double-submit cookie CSRF protection.
 *
 * On every request the middleware ensures a `csrf_token` cookie exists.
 * For state-changing methods (POST / PUT / PATCH / DELETE) it verifies that
 * the `x-csrf-token` header matches the cookie value.
 *
 * Safe methods (GET / HEAD / OPTIONS) are exempt.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Ensure a CSRF token cookie exists on every response
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // JS must read this cookie
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  // Safe methods are exempt from CSRF checks
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Allow auth endpoints (login/register/logout) so users can authenticate
  // before they have a CSRF cookie set by a prior GET.
  // Use req.originalUrl since req.path is relative when middleware is mounted on a prefix.
  const csrfExemptPaths = ["/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/seed", "/api/bootstrap"];
  if (csrfExemptPaths.includes(req.originalUrl)) {
    return next();
  }

  const rawToken = req.headers[CSRF_HEADER];
  const headerToken: string | undefined = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!headerToken || headerToken !== token) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  next();
}
