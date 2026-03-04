import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-sonnet-4-5-20250929";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}