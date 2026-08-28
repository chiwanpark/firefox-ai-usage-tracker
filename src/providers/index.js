import { fetchClaudeUsage } from "./claude.js";
import { fetchCopilotUsage } from "./copilot.js";
import { fetchOpenAiUsage } from "./openai.js";
import { fetchOpenCodeUsage } from "./opencode.js";
import { fetchOpenRouterUsage } from "./openrouter.js";

export const PROVIDERS = [
  { id: "claude", name: "Claude", fetchUsage: fetchClaudeUsage },
  { id: "openai", name: "ChatGPT", fetchUsage: fetchOpenAiUsage },
  { id: "copilot", name: "GitHub Copilot", fetchUsage: fetchCopilotUsage },
  { id: "opencode", name: "OpenCode", fetchUsage: fetchOpenCodeUsage },
  { id: "openrouter", name: "OpenRouter", fetchUsage: fetchOpenRouterUsage },
];
