export type RawLine = { raw: string; time?: string | null };

const TIME_RE = /\[(\d{2}:\d{2})\]|\b(\d{2}:\d{2})\b/;

const GARBAGE_PATTERNS: RegExp[] = [
  /^\s*\d{4}\.?\s*$/i,
  /^\s*0:\d{3}\s*$/i,
  /^\s*rs\s*$/i,
  /^\s*ops(.*)?as scheduled\s*$/i,
  /^\s*operational activities continued as scheduled\s*$/i,
];

export function extractLines(text: string): RawLine[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(raw => {
      const m = raw.match(TIME_RE);
      const time = m ? (m[1] ?? m[2]) : null;
      return { raw, time };
    });
}

export function isGarbage(line: string): boolean {
  const cleaned = line
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b\d{2}:\d{2}\b/g, "")
    .trim();
  return GARBAGE_PATTERNS.some(re => re.test(cleaned));
}

export function dedupe(lines: RawLine[]): RawLine[] {
  const seen = new Set<string>();
  const out: RawLine[] = [];
  for (const l of lines) {
    const key = l.raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}

export function normalizeLines(text: string): RawLine[] {
  const lines = extractLines(text);
  const filtered = lines.filter(l => !isGarbage(l.raw));
  return dedupe(filtered);
}
