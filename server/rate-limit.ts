import rateLimit from "express-rate-limit";

/**
 * Strict limiter for authentication endpoints (login, register).
 * 10 attempts per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
});

/**
 * General API limiter — 100 requests per minute per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});
