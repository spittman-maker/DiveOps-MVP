import type { RawLine } from "./normalize";

export type Classified = {
  directives: RawLine[];
  station: RawLine[];
  questions: RawLine[];
};

const DIRECTIVE_KEYWORDS = [
  "directed", "requested", "instructed", "hold", "stop", "reduce", "edit directive",
  "client requested", "jv directed", "oicc", "navfac", "dho", "per client", "per pm"
];

const QUESTION_RE = /\?$/;

export function classify(lines: RawLine[]): Classified {
  const directives: RawLine[] = [];
  const station: RawLine[] = [];
  const questions: RawLine[] = [];

  for (const l of lines) {
    const s = l.raw.toLowerCase();

    if (QUESTION_RE.test(l.raw)) {
      questions.push(l);
      continue;
    }

    const isDirective = DIRECTIVE_KEYWORDS.some(k => s.includes(k));
    if (isDirective) directives.push(l);
    else station.push(l);
  }

  return { directives, station, questions };
}
