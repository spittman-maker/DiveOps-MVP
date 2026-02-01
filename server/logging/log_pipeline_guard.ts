/**
 * log_pipeline_guard.ts
 *
 * Single-module normalizer + validators for your 24-hour underwater ops logs.
 * هدف: force separation of (A) Client/JV directives (timestamped) vs (B) station narrative (NON-timestamped),
 * and hard-fail if outputs violate your constitution.
 *
 * Drop into: server/logging/log_pipeline_guard.ts (or similar)
 *
 * Usage:
 *   import {
 *     normalizeAndClassifyRawNotes,
 *     validateModelOutputOrThrow,
 *     buildModelInputPacket,
 *   } from "./log_pipeline_guard";
 *
 *   const prep = normalizeAndClassifyRawNotes(rawNotesText);
 *   const modelInput = buildModelInputPacket(prep, { date: "2026-02-01", window: "0600–0559" });
 *   const modelJson = await callLLM(modelInput); // MUST return JSON (object)
 *   validateModelOutputOrThrow(modelJson);
 *   // persist modelJson + prep (for traceability), then render DOCX
 */

export type RawEvent = {
  raw: string;
  time: string | null;     // "06:16" or null
  timeSource: "bracket" | "plain" | "hhmm" | "none";
};

export type PrepBuckets = {
  kept: RawEvent[];        // cleaned lines (garbage removed)
  dropped: RawEvent[];     // dropped lines (garbage/meta)
  directives: RawEvent[];  // directive candidates (timestamp allowed/required)
  station: RawEvent[];     // station narrative candidates (timestamps will be stripped later)
  questions: RawEvent[];   // meta/questions (dropped by default)
  dedupeStats: { before: number; after: number };
};

export type ModelInputPacket = {
  meta: { date: string; window: string };
  directive_candidates: { time: string | null; text: string }[];
  station_candidates: { text: string }[];
  dropped_meta: { time: string | null; text: string }[];
};

export type DirectiveOut = {
  time: string;            // REQUIRED "HH:MM"
  who?: string;
  what: string;
  impact?: string;
  provenance?: string;
};

export type ConflictOut = {
  time: string;            // REQUIRED "HH:MM"
  tag: "CONFLICTING DIRECTION" | "REVERSED DIRECTION";
  original_ref: string;
  new_direction: string;
  operational_impact: string;
  action_taken: string;
};

export type StationLogOut = {
  station: string;
  crew?: string;
  scope_worked?: string;
  production?: string;
  findings?: string;
  qaqc?: string;
  constraints?: string;
  carryover?: string;
  // No timestamps allowed anywhere in these fields.
};

export type RiskOut = {
  risk_id: string;
  trigger: string;
  impact: string;
  owner: string;
  status: "Open" | "Monitoring" | "Closed";
};

export type DailyLogModelOutput = {
  date: string;
  day_window: string;
  summary: {
    work_executed: string[];
    primary_constraints: string[];
    qaqc_posture: string[];
    carryover: string[];
  };
  directives: DirectiveOut[];
  conflicts?: ConflictOut[];
  operational_notes?: Record<string, string>;
  station_logs: StationLogOut[];
  risks?: RiskOut[];
};

// -------------------------
// Normalization / Parsing
// -------------------------

const BRACKET_TIME_RE = /\[(\d{1,2}:\d{2})\]/; // [06:16]
const PLAIN_TIME_RE = /\b(\d{1,2}:\d{2})\b/;   // 06:16
const HHMM_RE = /\b([01]\d|2[0-3])([0-5]\d)\b/; // 0600, 1932
const SLASH_DELIM = /\s*\/\s*/; // "0530-car shuffel/0600-meeting/..."

const normalizeHHMM = (hhmm: string): string => {
  // "0600" -> "06:00"
  const hh = hhmm.slice(0, 2);
  const mm = hhmm.slice(2, 4);
  return `${hh}:${mm}`;
};

const normalizeHColonM = (t: string): string | null => {
  // "6:00" -> "06:00"
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const mm = m[2];
  const hhN = Number(hh);
  const mmN = Number(mm);
  if (hhN < 0 || hhN > 23 || mmN < 0 || mmN > 59) return null;
  return `${hh}:${mm}`;
};

const stripKnownPrefixes = (s: string): string => {
  // remove leading duplicated time tokens like "0600 DHO meeting"
  return s.replace(/^\s*(\d{4}|\d{1,2}:\d{2})\s*[-–]?\s*/i, "").trim();
};

// Garbage / meta filters based on your examples
const GARBAGE_PATTERNS: RegExp[] = [
  /^\s*\d{4}\.?\s*$/i,                 // "2026."
  /^\s*\d{1,4}\s*$/i,                  // "1012" alone
  /^\s*0:\d{3}\s*$/i,                  // "0:600"
  /^\s*(rs|lb|ls)\s*$/i,               // lone shorthand
  /^\s*why didn'?t.*separate.*\?\s*$/i,
  /^\s*what is the status.*\?\s*$/i,
];

const FILLER_PATTERNS: RegExp[] = [
  /operations continued as scheduled/i,
  /operational activities continued as scheduled/i,
];

const DIRECTIVE_KEYWORDS = [
  "client directed",
  "client directs",
  "client instructed",
  "client tells",
  "jv directed",
  "oicc",
  "navfac",
  "tower cleared",
  "ordered",
  "hold",
  "stop work",
  "reduce crew",
  "leave early",
  "edit directive",
  "instructed the team",
  "directed the team",
];

const QUESTION_RE = /\?\s*$/;

function looksLikeDirective(text: string): boolean {
  const s = text.toLowerCase();
  return DIRECTIVE_KEYWORDS.some(k => s.includes(k));
}

function isGarbageLine(text: string): boolean {
  if (GARBAGE_PATTERNS.some(re => re.test(text.trim()))) return true;
  if (FILLER_PATTERNS.some(re => re.test(text))) return true;
  return false;
}

/**
 * Explodes "slash-packed" supervisor strings into separate lines, while preserving time if present.
 * Example: "0530-car shuffle/0600-DHO meeting/0615-crew meeting"
 */
function explodeSlashPacked(line: string): string[] {
  if (!line.includes("/")) return [line];
  const parts = line.split(SLASH_DELIM).map(p => p.trim()).filter(Boolean);
  // If it looks like a single dense timeline, explode; otherwise keep as-is.
  const hasManyTimes = parts.filter(p => HHMM_RE.test(p) || PLAIN_TIME_RE.test(p)).length >= 2;
  return hasManyTimes ? parts : [line];
}

function parseTime(raw: string): { time: string | null; timeSource: RawEvent["timeSource"] } {
  const b = raw.match(BRACKET_TIME_RE);
  if (b) {
    const t = normalizeHColonM(b[1]);
    return { time: t, timeSource: "bracket" };
  }
  const p = raw.match(PLAIN_TIME_RE);
  if (p) {
    const t = normalizeHColonM(p[1]);
    return { time: t, timeSource: "plain" };
  }
  const h = raw.match(HHMM_RE);
  if (h) {
    const t = normalizeHHMM(h[0]);
    return { time: t, timeSource: "hhmm" };
  }
  return { time: null, timeSource: "none" };
}

function canonicalKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—-]/g, "-")
    .trim();
}

/**
 * Main: normalize, dedupe, classify.
 */
export function normalizeAndClassifyRawNotes(rawNotesText: string): PrepBuckets {
  const rawLines = rawNotesText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  // explode slash-packed lines
  const exploded: string[] = [];
  for (const l of rawLines) exploded.push(...explodeSlashPacked(l));

  const events: RawEvent[] = exploded.map(raw => {
    const { time, timeSource } = parseTime(raw);
    return { raw, time, timeSource };
  });

  // drop garbage/meta
  const kept: RawEvent[] = [];
  const dropped: RawEvent[] = [];

  for (const e of events) {
    const cleaned = e.raw.replace(/\[(\d{1,2}:\d{2})\]/g, "").trim();
    if (isGarbageLine(cleaned) || QUESTION_RE.test(cleaned)) {
      dropped.push(e);
    } else {
      kept.push(e);
    }
  }

  // dedupe
  const before = kept.length;
  const seen = new Set<string>();
  const deduped: RawEvent[] = [];
  for (const e of kept) {
    const key = canonicalKey(e.raw);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(e);
    }
  }
  const after = deduped.length;

  // classify
  const directives: RawEvent[] = [];
  const station: RawEvent[] = [];
  const questions: RawEvent[] = [];

  for (const e of deduped) {
    const text = stripKnownPrefixes(e.raw.replace(BRACKET_TIME_RE, "").trim());

    if (QUESTION_RE.test(text)) {
      questions.push(e);
      continue;
    }

    if (looksLikeDirective(text)) directives.push(e);
    else station.push(e);
  }

  return {
    kept: deduped,
    dropped,
    directives,
    station,
    questions,
    dedupeStats: { before, after },
  };
}

/**
 * Build a clean packet to send to the LLM.
 * - directives keep timestamps (if any)
 * - station candidates have timestamps stripped (by construction)
 * - dropped_meta is included only for traceability (not for inclusion in the official log)
 */
export function buildModelInputPacket(
  prep: PrepBuckets,
  meta: { date: string; window: string }
): ModelInputPacket {
  const directive_candidates = prep.directives.map(e => ({
    time: e.time,
    text: stripKnownPrefixes(e.raw.replace(BRACKET_TIME_RE, "").trim()),
  }));

  const station_candidates = prep.station.map(e => {
    const stripped = e.raw
      .replace(BRACKET_TIME_RE, "")
      .replace(PLAIN_TIME_RE, "") // strip any embedded time
      .replace(HHMM_RE, "")
      .trim();
    return { text: stripKnownPrefixes(stripped) };
  });

  const dropped_meta = prep.dropped.map(e => ({
    time: e.time,
    text: e.raw,
  }));

  return { meta, directive_candidates, station_candidates, dropped_meta };
}

// -------------------------
// Output Validators (hard fail)
// -------------------------

const ANY_TIME_RE = /\b\d{1,2}:\d{2}\b|\[\d{1,2}:\d{2}\]|\b([01]\d|2[0-3])[0-5]\d\b/;

function mustBeHHMM(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t) && normalizeHColonM(t) === t;
}

function jsonStringifySafe(obj: unknown): string {
  try { return JSON.stringify(obj); } catch { return String(obj); }
}

/**
 * Throws Error if model output violates constitution-like constraints.
 * Call BEFORE persisting to DB and BEFORE rendering DOCX.
 */
export function validateModelOutputOrThrow(out: DailyLogModelOutput): void {
  // basic shape
  if (!out || typeof out !== "object") throw new Error("VALIDATION_FAIL: output not an object");
  if (!out.date) throw new Error("VALIDATION_FAIL: missing date");
  if (!out.day_window) throw new Error("VALIDATION_FAIL: missing day_window");
  if (!out.summary) throw new Error("VALIDATION_FAIL: missing summary");
  if (!Array.isArray(out.directives)) throw new Error("VALIDATION_FAIL: directives must be array");
  if (!Array.isArray(out.station_logs)) throw new Error("VALIDATION_FAIL: station_logs must be array");

  // directives must have timestamps
  for (const d of out.directives) {
    if (!d?.time || !mustBeHHMM(d.time)) {
      throw new Error("VALIDATION_FAIL: directive missing valid time (HH:MM)");
    }
  }

  // conflicts must have timestamps
  if (out.conflicts) {
    if (!Array.isArray(out.conflicts)) throw new Error("VALIDATION_FAIL: conflicts must be array");
    for (const c of out.conflicts) {
      if (!c?.time || !mustBeHHMM(c.time)) {
        throw new Error("VALIDATION_FAIL: conflict missing valid time (HH:MM)");
      }
    }
  }

  // Station logs: NO timestamps anywhere
  const stationBlob = jsonStringifySafe(out.station_logs);
  if (ANY_TIME_RE.test(stationBlob)) {
    throw new Error("VALIDATION_FAIL: timestamp detected inside station_logs");
  }

  // Ban filler phrases globally
  const fullBlob = jsonStringifySafe(out).toLowerCase();
  for (const re of FILLER_PATTERNS) {
    if (re.test(fullBlob)) {
      throw new Error("VALIDATION_FAIL: banned filler language detected");
    }
  }

  // Optional: prevent meta questions in official output
  if (fullBlob.includes("why didnt it") || fullBlob.includes("why didn't it")) {
    throw new Error("VALIDATION_FAIL: meta-question leaked into output");
  }
}

/**
 * Convenience: validate that your TEMPLATE-PRESERVING Dive Plan generation didn't stub out boilerplate.
 * If the produced DOCX text contains boilerplate placeholder markers, hard fail.
 * (Use this after DOCX extraction-to-text if you have it; or if you store plain text alongside.)
 */
export function validateNoBoilerplateStubTextOrThrow(docText: string): void {
  const banned = [
    "[this section contains locked boilerplate content",
    "content is preserved exactly as specified",
  ];
  const lower = docText.toLowerCase();
  for (const b of banned) {
    if (lower.includes(b)) {
      throw new Error("VALIDATION_FAIL: boilerplate stub text found in dive plan output");
    }
  }
}

// -------------------------
// Auto Risk Creation from Directives
// -------------------------

export type AutoRisk = RiskOut & {
  trigger_key: string;   // internal dedupe key
  source_time?: string;  // directive time that caused it
};

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function yyyymmdd(dateIso: string): string {
  return dateIso.replaceAll("-", "");
}

function normalizeTriggerKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

type RiskRule = {
  key: string;
  match: RegExp;
  trigger: string;
  impact: string;
  owner: string;
};

const RISK_RULES: RiskRule[] = [
  {
    key: "manpower_reduction",
    match: /\b(reduce|reduction)\b.*\b(crew|crews|personnel|manpower)\b|\bcrew sizes\b|\bonly two crews\b/i,
    trigger: "Client/JV-directed manpower reduction",
    impact: "Reduced production capacity; schedule and inefficiency exposure (lost diver-hours / re-sequencing risk).",
    owner: "Ops/PM",
  },
  {
    key: "early_release",
    match: /\b(leave early|end .*shift early|cut .*shift|8\s*hours)\b/i,
    trigger: "Client/JV-directed early release of crew",
    impact: "Loss of planned work window; schedule impact and standby inefficiency exposure.",
    owner: "Ops/PM",
  },
  {
    key: "stop_work_hold",
    match: /\b(stop work|hold|suspend|pause)\b/i,
    trigger: "Client/JV-directed work stoppage/hold",
    impact: "Immediate production loss; potential remobilization and rework exposure.",
    owner: "Ops/PM",
  },
  {
    key: "access_restriction",
    match: /\b(tower cleared|tower .*hold|AIS shuffle|access restricted|restricted access|clearance)\b/i,
    trigger: "Access control / tower clearance constraints impacting diving",
    impact: "Delayed start windows and productivity loss due to access/clearance dependency.",
    owner: "Diving Superintendent",
  },
  {
    key: "equipment_directive_pump",
    match: /\b(6\"|6-inch|6 inch)\b.*\bpump\b|\bcirculat(e|ing)\b.*\bwater\b/i,
    trigger: "Client/JV-directed equipment change (pump/circulation)",
    impact: "Unplanned equipment deployment; potential diversion from critical path and crew utilization inefficiency.",
    owner: "Diving Superintendent",
  },
];

function nextRiskId(dateIso: string, existing: RiskOut[] | undefined): string {
  const prefix = `R-${yyyymmdd(dateIso)}-`;
  const max = (existing ?? [])
    .map(r => r.risk_id)
    .filter(id => id.startsWith(prefix))
    .map(id => Number(id.slice(prefix.length)))
    .filter(n => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);

  return `${prefix}${pad3(max + 1)}`;
}

/**
 * Auto-create risks from directive language.
 * Call this AFTER validateModelOutputOrThrow() and BEFORE persisting.
 *
 * - Deterministic: no AI prose
 * - Dedupe: prevents duplicates by trigger_key per day output
 */
export function autoCreateRisksFromDirectives(out: DailyLogModelOutput): DailyLogModelOutput {
  const risks: (RiskOut & { trigger_key?: string })[] = Array.isArray(out.risks) ? [...out.risks] : [];

  const existingKeys = new Set<string>(
    risks.map(r => normalizeTriggerKey((r as any).trigger_key ?? r.trigger))
  );

  const directiveTexts = out.directives.map(d => ({
    time: d.time,
    text: `${d.who ?? ""} ${d.what ?? ""} ${d.impact ?? ""}`.trim(),
  }));

  for (const dt of directiveTexts) {
    for (const rule of RISK_RULES) {
      if (!rule.match.test(dt.text)) continue;

      const trigger_key = normalizeTriggerKey(rule.key);
      if (existingKeys.has(trigger_key)) continue;

      const risk_id = nextRiskId(out.date, risks);

      risks.push({
        risk_id,
        trigger: rule.trigger,
        impact: rule.impact,
        owner: rule.owner,
        status: "Open",
        trigger_key,
      });

      existingKeys.add(trigger_key);
    }
  }

  return { ...out, risks: risks.map(({ trigger_key, ...rest }) => rest as RiskOut) };
}

/**
 * Strip trigger_key before DB insert if your schema doesn't include it
 */
export function stripTriggerKeys(risks: RiskOut[]): RiskOut[] {
  return risks.map(({ trigger_key, ...rest }: any) => rest as RiskOut);
}
