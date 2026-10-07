import { CLAUDE_HOST_PERMISSION, fetchClaudeUsage } from "./claude.js";
import { fetchCopilotUsage } from "./copilot.js";
import { OPENAI_HOST_PERMISSION, fetchOpenAiUsage } from "./openai.js";
import { OPENCODE_HOST_PERMISSION, fetchOpenCodeUsage } from "./opencode.js";
import { fetchOpenRouterUsage } from "./openrouter.js";

export const PROVIDERS = [
  { id: "claude", name: "Claude", fetchUsage: fetchClaudeUsage },
  { id: "openai", name: "ChatGPT", fetchUsage: fetchOpenAiUsage },
  { id: "copilot", name: "GitHub Copilot", fetchUsage: fetchCopilotUsage },
  { id: "opencode", name: "OpenCode", fetchUsage: fetchOpenCodeUsage },
  { id: "openrouter", name: "OpenRouter", fetchUsage: fetchOpenRouterUsage },
];

export const COOKIE_HOST_PERMISSIONS = [
  CLAUDE_HOST_PERMISSION,
  OPENAI_HOST_PERMISSION,
  OPENCODE_HOST_PERMISSION,
];
