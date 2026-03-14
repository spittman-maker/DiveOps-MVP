import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

interface ValidateOptions {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}

/**
 * Validation middleware factory.
 *
 * Usage:
 *   router.post("/foo", validate({ body: mySchema }), handler)
 *
 * On failure, responds with a consistent 400 shape:
 *   { error: "Validation failed", details: [...] }
 */
export function validate(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ location: string; path: string; message: string }> = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ location: "params", path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ location: "query", path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ location: "body", path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    next();
  };
}
