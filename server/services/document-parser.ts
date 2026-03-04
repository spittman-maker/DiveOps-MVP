/**
 * Document Parser Service
 * =======================
 * Parses uploaded documents (PDF, DOCX, XLSX, TXT) into plain text
 * and optionally extracts structured data using Claude.
 *
 * Uses CLI tools (pdftotext, antiword) instead of npm packages
 * for PDF/DOCX to keep the dependency footprint small.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import logger from "../logger";
import { getAnthropicClient, AI_MODEL } from "../ai-client";

export interface ParseResult {
  text: string;
  pageCount?: number;
  metadata?: Record<string, string>;
}

export interface StructuredExtraction {
  title?: string;
  sections: Array<{ heading: string; content: string }>;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
  keyValues?: Record<string, string>;
}

/**
 * Extract text from a file buffer based on file type.
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<ParseResult> {
  const ext = fileType.toLowerCase().replace(/^\./, "");

  switch (ext) {
    case "pdf":
      return parsePdf(buffer);
    case "doc":
    case "docx":
      return parseWord(buffer, ext);
    case "xlsx":
    case "xls":
      return parseExcel(buffer);
    case "txt":
    case "md":
    case "csv":
      return { text: buffer.toString("utf-8") };
    default:
      logger.warn({ fileName, fileType }, "Unsupported file type, attempting plain text");
      return { text: buffer.toString("utf-8") };
  }
}

/**
 * Parse PDF using pdftotext CLI tool.
 */
async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const tmpFile = path.join(os.tmpdir(), `diveops-parse-${Date.now()}.pdf`);
  const tmpOut = tmpFile.replace(".pdf", ".txt");

  try {
    fs.writeFileSync(tmpFile, buffer);

    // Get page count
    let pageCount: number | undefined;
    try {
      const info = execSync(`pdfinfo "${tmpFile}" 2>/dev/null`, { encoding: "utf-8" });
      const match = info.match(/Pages:\s+(\d+)/);
      if (match) pageCount = parseInt(match[1], 10);
    } catch {
      // pdfinfo might not be available
    }

    // Extract text with layout preservation
    execSync(`pdftotext -layout "${tmpFile}" "${tmpOut}" 2>/dev/null`);
    const text = fs.readFileSync(tmpOut, "utf-8");

    return { text, pageCount };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

/**
 * Parse Word documents using antiword (DOC) or plain extraction (DOCX).
 */
async function parseWord(buffer: Buffer, ext: string): Promise<ParseResult> {
  const tmpFile = path.join(os.tmpdir(), `diveops-parse-${Date.now()}.${ext}`);

  try {
    fs.writeFileSync(tmpFile, buffer);

    if (ext === "doc") {
      const text = execSync(`antiword "${tmpFile}" 2>/dev/null`, { encoding: "utf-8" });
      return { text };
    }

    // DOCX: extract using unzip + sed (basic extraction)
    try {
      const text = execSync(
        `unzip -p "${tmpFile}" word/document.xml 2>/dev/null | sed -e 's/<[^>]*>//g' -e 's/&amp;/\\&/g' -e 's/&lt;/</g' -e 's/&gt;/>/g'`,
        { encoding: "utf-8" }
      );
      return { text: text.trim() };
    } catch {
      // Fallback: try to read as text
      return { text: buffer.toString("utf-8") };
    }
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Parse Excel files using ExcelJS.
 */
async function parseExcel(buffer: Buffer): Promise<ParseResult> {
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const lines: string[] = [];

    workbook.eachSheet((sheet) => {
      lines.push(`\n=== Sheet: ${sheet.name} ===\n`);
      sheet.eachRow((row) => {
        const values = (row.values as any[])
          .slice(1) // ExcelJS row.values is 1-indexed
          .map((v) => (v != null ? String(v) : ""))
          .join("\t");
        lines.push(values);
      });
    });

    return { text: lines.join("\n") };
  } catch (err) {
    logger.error({ err }, "Excel parsing failed");
    return { text: "" };
  }
}

/**
 * Use Claude to extract structured data from document text.
 * Useful for extracting tables, key-value pairs, and sections
 * from Navy Dive Manual pages, compliance docs, etc.
 */
export async function extractStructuredData(
  text: string,
  context?: string
): Promise<StructuredExtraction> {
  const client = getAnthropicClient();

  // Chunk large documents
  const MAX_CHARS = 80000;
  const chunk = text.length > MAX_CHARS ? text.substring(0, MAX_CHARS) : text;

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Extract structured data from the following document text.${context ? ` Context: ${context}` : ""}

Document text:
---
${chunk}
---

Respond in JSON format:
{
  "title": "document title if identifiable",
  "sections": [{"heading": "section name", "content": "section text"}],
  "tables": [{"headers": ["col1", "col2"], "rows": [["val1", "val2"]]}],
  "keyValues": {"key": "value"}
}

Only output valid JSON.`,
      },
    ],
  });

  const responseText = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(responseText);
  } catch {
    logger.warn("Failed to parse structured extraction response");
    return {
      sections: [{ heading: "Full Text", content: chunk }],
    };
  }
}