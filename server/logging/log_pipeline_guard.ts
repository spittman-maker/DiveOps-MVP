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
  risk_level?: "low" | "med" | "high";
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
  "client directive",
  "client instructed",
  "client instructs",
  "client instruction",
  "client tells",
  "client told",
  "client says",
  "client said",
  "client wants",
  "client wanted",
  "client requested",
  "client requests",
  "client asked",
  "client asking",
  "client advised",
  "client notified",
  "client called",
  "client confirmed",
  "client approved",
  "client denied",
  "client rejected",
  "client canceled",
  "client cancelled",
  "client changed",
  "client updated",
  "client decided",
  "client ordered",
  "client requires",
  "client required",
  "per client",
  "per the client",
  "at client request",
  "at client's request",
  "at clients request",
  "client rep",
  "client representative",
  "jv directed",
  "jv directs",
  "jv says",
  "jv instructed",
  "jv requested",
  "per jv",
  "oicc",
  "navfac",
  "tower cleared",
  "tower says",
  "tower directed",
  "tower instructs",
  "ordered",
  "hold",
  "stand down",
  "standby",
  "stand by",
  "stop work",
  "cease work",
  "cease operations",
  "suspend operations",
  "suspend work",
  "reduce crew",
  "leave early",
  "edit directive",
  "instructed the team",
  "directed the team",
  "directed us",
  "told us to",
  "asked us to",
  "wants us to",
  "directed to",
  "instructed to",
  "requested to",
  "change order",
  "scope change",
  "priority change",
  "new priority",
  "shift priority",
  "redirect",
  "redirected",
  "mobilize",
  "demobilize",
  "relocate",
  "move to",
  "switch to",
  "transition to",
];

const DIRECTIVE_PATTERNS = [
  /\bclient\b.*\b(direct|instruct|order|request|want|ask|say|tell|advise|notif|confirm|approv|deny|reject|cancel|chang|decid|requir)/i,
  /\bper\b.*\b(client|jv|oicc|navfac|tower|superintendent|rep)\b/i,
  /\b(directed|instructed|ordered|requested|advised|told)\b.*\b(to|that|the team|us|crew|divers)\b/i,
];

const QUESTION_RE = /\?\s*$/;

function looksLikeDirective(text: string): boolean {
  const s = text.toLowerCase();
  if (DIRECTIVE_KEYWORDS.some(k => s.includes(k))) return true;
  if (DIRECTIVE_PATTERNS.some(re => re.test(text))) return true;
  return false;
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

  // Station logs: warn if timestamps appear but don't hard-fail
  const stationBlob = jsonStringifySafe(out.station_logs);
  if (ANY_TIME_RE.test(stationBlob)) {
    console.warn("VALIDATION_WARN: timestamp detected inside station_logs - allowing but flagging");
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

function fingerprintText(s: string): string {
  const norm = s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

type RiskRule = {
  key: string;
  match: RegExp;
  trigger: string;
  impact: string;
  owner: string;
  riskLevel?: "low" | "med" | "high";
};

const RISK_RULES: RiskRule[] = [
  // Manpower / time-window hits
  {
    key: "manpower_reduction",
    match: /\b(reduce|reduction)\b.*\b(crew|crews|personnel|manpower)\b|\bcrew sizes\b|\bonly\s+\w+\s+crews?\b/i,
    trigger: "Client-directed manpower reduction",
    impact: "Reduced production capacity; schedule exposure and inefficiency (lost diver-hours / re-sequencing).",
    owner: "Ops/PM",
    riskLevel: "med",
  },
  {
    key: "early_release",
    match: /\b(leave early|end .*shift early|cut .*shift|released early|8\s*hours?|eight\s*hours?)\b/i,
    trigger: "Client-directed early release / reduced shift duration",
    impact: "Loss of planned work window; standby inefficiency and schedule exposure.",
    owner: "Ops/PM",
    riskLevel: "low",
  },

  // Diving stoppage / recall
  {
    key: "pull_all_divers",
    match: /\b(pull all divers|recall.*divers|divers.*return to surface)\b|\b(dho)\b.*\b(pull|recall)\b/i,
    trigger: "DHO/Client-directed diver recall / stoppage",
    impact: "Interrupted bottom time and work sequence; productivity loss and potential rework/standby exposure.",
    owner: "Diving Superintendent",
    riskLevel: "high",
  },
  {
    key: "stop_work_hold",
    match: /\b(stop work|hold|suspend|pause|stand down|standdown)\b/i,
    trigger: "Client-directed stop-work / hold / standdown",
    impact: "Immediate production loss; remobilization and schedule exposure.",
    owner: "Ops/PM",
    riskLevel: "high",
  },

  // Access / control dependencies
  {
    key: "tower_clearance",
    match: /\b(tower cleared|tower clearance|call tower|tower hold|tower denied)\b/i,
    trigger: "Tower clearance dependency impacting dive start windows",
    impact: "Delayed starts/interruptions due to tower clearance dependency; productivity loss exposure.",
    owner: "Dive Supervisor",
    riskLevel: "med",
  },
  {
    key: "ais_shuffle_access",
    match: /\b(AIS)\b.*\b(shuffle|parking|vehicle)\b|\bcar shuffle\b/i,
    trigger: "AIS/parking shuffle access constraint",
    impact: "Lost time due to access logistics; reduced effective production window.",
    owner: "Ops/PM",
    riskLevel: "low",
  },

  // Third-party / interface constraints
  {
    key: "eod_standdown",
    match: /\b(EOD|explosive ordnance)\b.*\b(stand down|standdown|crew off|off)\b/i,
    trigger: "EOD/interface standdown impacting work window",
    impact: "Forced downtime due to third-party interface; schedule exposure.",
    owner: "Ops/PM",
    riskLevel: "med",
  },

  // Equipment / means & methods directives
  {
    key: "pump_circulation_directive",
    match: /\b(6\"|6-inch|6 inch)\b.*\bpump\b|\bpump\b.*\b(in the water|deploy|install)\b|\bcirculat(e|ing)\b.*\bwater\b/i,
    trigger: "Client-directed equipment deployment (pump/circulation)",
    impact: "Unplanned equipment deployment/diversion; potential critical path and crew utilization inefficiency.",
    owner: "Diving Superintendent",
    riskLevel: "med",
  },
  {
    key: "hose_discharge_change",
    match: /\b(discharge hose|discharge hoses)\b.*\b(install|add|relocat|move|set|secured?)\b/i,
    trigger: "Material handling/discharge configuration change",
    impact: "Time spent reconfiguring discharge/material handling; potential production slowdown and rework exposure.",
    owner: "Dive Supervisor",
    riskLevel: "low",
  },

  // Conflict-triggered risks
  {
    key: "conflicting_direction",
    match: /\b(CONFLICTING DIRECTION)\b/i,
    trigger: "CONFLICTING DIRECTION issued by Client",
    impact: "Sequencing uncertainty and potential rework/standby exposure; schedule impact risk.",
    owner: "Ops/PM",
    riskLevel: "high",
  },
  {
    key: "reversed_direction",
    match: /\b(REVERSED DIRECTION)\b/i,
    trigger: "REVERSED DIRECTION issued by Client",
    impact: "Reversal may cause rework, demobilization/remobilization inefficiency, and schedule impact.",
    owner: "Ops/PM",
    riskLevel: "high",
  },
  // Equipment breakdown (end-of-day) - low risk, not high
  {
    key: "equipment_breakdown",
    match: /\b(breakdown|broke down|malfunction|out of service|inoperable)\b.*\b(end of|eod|close out|closeout|end.?of.?day)\b|\b(end of|eod|close out|closeout|end.?of.?day)\b.*\b(breakdown|broke down|malfunction|out of service|inoperable)\b/i,
    trigger: "End-of-day equipment breakdown",
    impact: "Equipment issue at shift end; repair can be scheduled for next shift with minimal operational impact.",
    owner: "Dive Supervisor",
    riskLevel: "low",
  },
];

function nextRiskId(dateIso: string, existing: RiskOut[] | undefined): string {
  const prefix = "RR-";
  const max = (existing ?? [])
    .map(r => r.risk_id)
    .filter(id => id.startsWith(prefix))
    .map(id => Number(id.slice(prefix.length)))
    .filter(n => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);

  return `${prefix}${pad3(max + 1)}`;
}

/**
 * Auto-create risks from directive and conflict language.
 * Call this AFTER validateModelOutputOrThrow() and BEFORE persisting.
 *
 * - Deterministic: no AI prose
 * - Dedupe: uses fingerprinted trigger_key (rule|time|hash) for event-level uniqueness
 * - Scans both directives[] and conflicts[] arrays
 */
export function autoCreateRisksFromDirectives(out: DailyLogModelOutput): DailyLogModelOutput {
  const risks: (RiskOut & { trigger_key?: string; source_time?: string })[] = Array.isArray(out.risks) ? [...out.risks] : [];

  const existingKeys = new Set<string>(
    risks.map((r: any) => String(r.trigger_key ?? "")).filter(Boolean)
  );

  // Combine directives and conflicts as source events
  const sources: { time?: string; text: string }[] = [
    ...out.directives.map(d => ({
      time: d.time,
      text: `${d.who ?? ""} ${d.what ?? ""} ${d.impact ?? ""}`.trim(),
    })),
    ...((out as any).conflicts ?? []).map((c: any) => ({
      time: c.time,
      text: `${c.tag ?? ""} ${c.new_direction ?? ""} ${c.operational_impact ?? ""}`.trim(),
    })),
  ];

  for (const src of sources) {
    for (const rule of RISK_RULES) {
      if (!rule.match.test(src.text)) continue;

      // Event-level dedupe: rule|time|fingerprint
      const timePart = (src.time && mustBeHHMM(src.time)) ? src.time : "NA";
      const fp = fingerprintText(src.text);
      const trigger_key = normalizeTriggerKey(`${rule.key}|${timePart}|${fp}`);

      if (existingKeys.has(trigger_key)) continue;

      const risk_id = nextRiskId(out.date, risks);

      risks.push({
        risk_id,
        trigger: rule.trigger,
        impact: rule.impact,
        owner: rule.owner,
        status: "Open",
        risk_level: rule.riskLevel || "med",
        trigger_key,
        source_time: src.time,
      });

      existingKeys.add(trigger_key);
    }
  }

  return { ...out, risks: risks.map(({ trigger_key, source_time, ...rest }) => rest as RiskOut) };
}

/**
 * Strip trigger_key before DB insert if your schema doesn't include it
 */
export function stripTriggerKeys(risks: RiskOut[]): RiskOut[] {
  return risks.map(({ trigger_key, ...rest }: any) => rest as RiskOut);
}
