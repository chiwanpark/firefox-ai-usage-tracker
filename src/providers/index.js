import { fetchClaudeUsage } from "./claude.js";
import { fetchCopilotUsage } from "./copilot.js";
import { fetchOpenAiUsage } from "./openai.js";

export const PROVIDERS = [
  { id: "claude", name: "Claude", fetchUsage: fetchClaudeUsage },
  { id: "openai", name: "ChatGPT", fetchUsage: fetchOpenAiUsage },
  { id: "copilot", name: "GitHub Copilot", fetchUsage: fetchCopilotUsage },
];
