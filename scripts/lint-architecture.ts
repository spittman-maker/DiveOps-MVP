#!/usr/bin/env tsx
/**
 * Architecture lint — enforces structural rules to prevent decay.
 *
 * Rules:
 * 1. Route handlers cannot import from server/db.ts directly
 * 2. Service files cannot import Express types
 * 3. Client components cannot import from server/
 * 4. File size warnings above 500 lines
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";

interface Violation {
  file: string;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

const violations: Violation[] = [];
const ROOT = path.resolve(import.meta.dirname, "..");

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

function checkImports(filePath: string, content: string) {
  const relative = path.relative(ROOT, filePath);

  // Rule 1: Route handlers cannot import from server/db.ts directly
  if (relative.startsWith("server/routes/") && relative.endsWith(".router.ts")) {
    if (content.includes('from "../db"') || content.includes('from "./db"') || content.includes("require('./db')")) {
      violations.push({
        file: relative,
        rule: "no-db-in-routes",
        message: "Route handlers must not import db directly. Use storage/repository functions instead.",
        severity: "error",
      });
    }
  }

  // Rule 2: Service files cannot import Express types
  if (relative.startsWith("server/services/") && relative.endsWith(".service.ts")) {
    if (content.includes('from "express"') || content.includes("from 'express'")) {
      violations.push({
        file: relative,
        rule: "no-express-in-services",
        message: "Service files must not import Express types. Services accept typed inputs, not req/res.",
        severity: "error",
      });
    }
  }

  // Rule 3: Client components cannot import from server/
  if (relative.startsWith("client/") && relative.endsWith(".tsx")) {
    if (content.includes('from "../../server/') || content.includes("from '../../server/")) {
      violations.push({
        file: relative,
        rule: "no-server-in-client",
        message: "Client components must not import from server/. Use shared/ types instead.",
        severity: "error",
      });
    }
  }
}

function checkFileSize(filePath: string) {
  const relative = path.relative(ROOT, filePath);
  const lines = countLines(filePath);

  // Skip known large files (navy dive tables, safety seed data, etc.)
  const exempted = [
    "shared/navy-dive-tables.ts",
    "server/safety-seed-data.ts",
    "server/routes/safety.routes.ts",
  ];
  if (exempted.some((e) => relative.includes(e))) return;

  if (lines > 500) {
    violations.push({
      file: relative,
      rule: "file-size",
      message: `File has ${lines} lines (limit: 500). Consider splitting.`,
      severity: "warning",
    });
  }
}

async function main() {
  const tsFiles = await glob("**/*.ts", {
    cwd: ROOT,
    ignore: ["node_modules/**", "dist/**", "**/*.test.ts", "**/*.spec.ts"],
  });

  const tsxFiles = await glob("client/**/*.tsx", {
    cwd: ROOT,
    ignore: ["node_modules/**", "dist/**"],
  });

  const allFiles = [...tsFiles, ...tsxFiles];

  for (const file of allFiles) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8");
    checkImports(fullPath, content);
    checkFileSize(fullPath);
  }

  // Report
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  if (warnings.length > 0) {
    console.log("\n--- Architecture Warnings ---");
    for (const w of warnings) {
      console.log(`  WARN [${w.rule}] ${w.file}: ${w.message}`);
    }
  }

  if (errors.length > 0) {
    console.log("\n--- Architecture Errors ---");
    for (const e of errors) {
      console.log(`  ERROR [${e.rule}] ${e.file}: ${e.message}`);
    }
    console.log(`\n${errors.length} architecture error(s) found. Fix before merging.\n`);
    process.exit(1);
  }

  console.log(`Architecture lint passed. ${warnings.length} warning(s).`);
}

main().catch((err) => {
  console.error("Architecture lint failed:", err);
  process.exit(1);
});
