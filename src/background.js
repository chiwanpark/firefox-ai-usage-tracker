import { fetchClaudeUsage } from "./providers/claude.js";

async function collectUsage() {
  return { providers: [await fetchClaudeUsage()] };
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "getUsage") {
    return collectUsage();
  }

  return undefined;
});
