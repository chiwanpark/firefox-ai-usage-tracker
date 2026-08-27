import { fetchClaudeUsage } from "./claude.js";
import { fetchCopilotUsage } from "./copilot.js";
import { fetchOpenAiUsage } from "./openai.js";

const PROVIDERS = [fetchClaudeUsage, fetchOpenAiUsage, fetchCopilotUsage];

export function fetchAllUsage() {
  return Promise.all(PROVIDERS.map((fetchUsage) => fetchUsage()));
}
