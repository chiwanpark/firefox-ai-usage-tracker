import { fetchClaudeUsage } from "./claude.js";
import { fetchOpenAiUsage } from "./openai.js";

const PROVIDERS = [fetchClaudeUsage, fetchOpenAiUsage];

export function fetchAllUsage() {
  return Promise.all(PROVIDERS.map((fetchUsage) => fetchUsage()));
}
