const TS_RE = /\b\d{1,2}:\d{2}\b|\[\d{1,2}:\d{2}\]/;

export interface DirectiveEntry {
  time: string;
  text: string;
}

export interface StationLogEntry {
  text: string;
}

export interface RiskEntry {
  riskId: string;
  description: string;
  source: string;
}

export interface StructuredLogPayload {
  directives: DirectiveEntry[];
  station_logs: StationLogEntry[];
  risks: RiskEntry[];
}

export function assertNoTimestampsInStation(stationLogs: StationLogEntry[]): void {
  const blob = JSON.stringify(stationLogs);
  if (TS_RE.test(blob)) {
    throw new Error("VALIDATION_FAIL: Timestamp detected inside station logs");
  }
}

export function assertDirectivesTimestamped(directives: DirectiveEntry[]): void {
  for (const d of directives) {
    if (!d.time || !/^\d{2}:\d{2}$/.test(d.time)) {
      throw new Error("VALIDATION_FAIL: Directive missing valid time");
    }
  }
}

export function assertNoFillerText(payloadJson: string): void {
  const banned = [
    "operations continued as scheduled",
    "operational activities continued as scheduled",
    "operational activities as scheduled",
  ];
  const lower = payloadJson.toLowerCase();
  for (const b of banned) {
    if (lower.includes(b)) throw new Error(`VALIDATION_FAIL: filler text "${b}"`);
  }
}

export function validatePayload(payload: StructuredLogPayload): void {
  assertNoTimestampsInStation(payload.station_logs);
  assertDirectivesTimestamped(payload.directives);
  assertNoFillerText(JSON.stringify(payload));
}
