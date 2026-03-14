/**
 * PSG Data Layer — Query Client for Learning Loop (DiveOps-MVP)
 *
 * Queries the unified data layer for historical patterns, compliance records,
 * safety incidents, and AI assistant trends across all PSG apps.
 * This data is injected into Claude's system prompt so every AI response
 * benefits from cross-platform intelligence.
 *
 * Endpoints hit:
 *   GET /api/v1/analytics/trending   — top query terms from AI Assistant
 *   GET /api/v1/analytics/compliance — Broco compliance record overview + expiring quals
 *   GET /api/v1/analytics/safety     — near-miss incidents and open safety items
 *   GET /api/v1/analytics/summary    — high-level cross-product analytics
 */

import https from "https";
import http from "http";

export interface PSGHistoricalContext {
  trending: Array<{ word: string; count: number }>;
  compliance: Record<string, any>;
  expiring_qualifications: Array<{ type: string; id: string; expiresAt: string }>;
  recent_near_misses: Array<{ title: string; severity: string; date: string }>;
  open_safety_items: number;
  summary: Record<string, any> | null;
}

class PSGQueryClient {
  private apiKey: string;
  private baseUrl: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.PSG_DATA_LAYER_API_KEY || "";
    this.baseUrl = (
      process.env.PSG_DATA_LAYER_URL ||
      "https://psg-data-layer.whitedune-3a34526c.centralus.azurecontainerapps.io"
    ).replace(/\/$/, "");
    this.enabled = process.env.PSG_DATA_LAYER_ENABLED !== "false";
  }

  /**
   * Fetch cross-platform historical context from the unified data layer.
   * Returns null gracefully on any failure — never blocks the AI call.
   */
  async getHistoricalContext(_query?: string): Promise<PSGHistoricalContext | null> {
    if (!this.enabled || !this.apiKey) return null;

    try {
      // Fire all three analytics queries in parallel for speed
      const [trending, compliance, safety, summary] = await Promise.all([
        this._get("/api/v1/analytics/trending?period=30d"),
        this._get("/api/v1/analytics/compliance?period=90d"),
        this._get("/api/v1/analytics/safety?period=90d"),
        this._get("/api/v1/analytics/summary"),
      ]);

      return {
        trending: trending?.top_query_terms || [],
        compliance: compliance?.overview || {},
        expiring_qualifications: compliance?.expiring_qualifications || [],
        recent_near_misses: safety?.recent_near_misses || [],
        open_safety_items: safety?.open_items?.length || safety?.open_items || 0,
        summary: summary || null,
      };
    } catch (err: any) {
      console.error("[PSG Query] Failed to fetch historical context:", err.message);
      return null;
    }
  }

  /**
   * Internal GET helper — 5 s timeout, returns parsed JSON or null.
   */
  private _get(endpoint: string): Promise<any> {
    return new Promise((resolve) => {
      const url = new URL(this.baseUrl + endpoint);
      const isHttps = url.protocol === "https:";
      const lib = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          "User-Agent": "psg-query-client/1.0.0 (DiveOps-MVP)",
        },
        timeout: 5000,
      };

      const req = lib.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }
}

/** Singleton instance — import this directly. */
export const psgQuery = new PSGQueryClient();

/**
 * Build a context block suitable for injection into a Claude system prompt.
 * Returns an empty string when the data layer is unavailable, so the AI
 * call proceeds normally without cross-platform intelligence.
 */
export async function buildPSGContextBlock(): Promise<string> {
  const history = await psgQuery.getHistoricalContext();
  if (!history) return "";

  const parts: string[] = [];
  parts.push("\n\n## CROSS-PLATFORM INTELLIGENCE (PSG Unified Data Layer)");

  // Trending AI assistant topics
  if (history.trending.length > 0) {
    const terms = history.trending
      .slice(0, 8)
      .map((t) => t.word)
      .join(", ");
    parts.push(`- TRENDING AI QUERIES (last 30 days): ${terms}`);
  }

  // Compliance overview from Broco
  const complianceEntries = Object.entries(history.compliance);
  if (complianceEntries.length > 0) {
    const overview = complianceEntries
      .map(([type, stats]: [string, any]) => {
        const count = Array.isArray(stats) ? stats.length : stats;
        return `${type}: ${count}`;
      })
      .join(", ");
    parts.push(`- BROCO COMPLIANCE RECORDS (90 days): ${overview}`);
  }

  // Expiring qualifications
  if (history.expiring_qualifications.length > 0) {
    parts.push(
      `- EXPIRING QUALIFICATIONS: ${history.expiring_qualifications.length} welder/procedure qualifications expiring within 90 days.`
    );
    const first3 = history.expiring_qualifications.slice(0, 3);
    for (const q of first3) {
      parts.push(`  • ${q.type} ${q.id} — expires ${q.expiresAt}`);
    }
  }

  // Recent near-misses
  if (history.recent_near_misses.length > 0) {
    parts.push(
      `- RECENT NEAR-MISS INCIDENTS: ${history.recent_near_misses.length} in the last 90 days.`
    );
    const first3 = history.recent_near_misses.slice(0, 3);
    for (const nm of first3) {
      parts.push(`  • [${nm.severity?.toUpperCase() || "UNKNOWN"}] ${nm.title} (${nm.date || "recent"})`);
    }
  }

  // Open safety items
  if (typeof history.open_safety_items === "number" && history.open_safety_items > 0) {
    parts.push(`- OPEN SAFETY ITEMS: ${history.open_safety_items} items currently requiring attention.`);
  }

  // Cross-product summary
  if (history.summary) {
    const s = history.summary;
    if (s.total_events) parts.push(`- TOTAL DATA LAYER EVENTS: ${s.total_events}`);
    if (s.active_apps) parts.push(`- ACTIVE APPS REPORTING: ${s.active_apps}`);
  }

  parts.push(
    "\nINCORPORATE THESE PATTERNS INTO YOUR GUIDANCE. If you see a trend in near misses related to the user's operation, proactively flag it. If a specific welding qualification is expiring soon, mention it when relevant. Use cross-platform data to provide more informed, context-aware responses."
  );

  return parts.join("\n");
}
