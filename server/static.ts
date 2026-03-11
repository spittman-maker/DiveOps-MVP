import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // BUG-EDGE-01 FIX: Return JSON 404 for any unmatched /api/* routes
  // This MUST come before the SPA catch-all to prevent API routes from returning HTML
  app.use("/api/{*path}", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  // fall through to index.html if the file doesn't exist (SPA catch-all)
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
