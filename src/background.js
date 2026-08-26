import { fetchAllUsage } from "./providers/index.js";

async function collectUsage() {
  return { providers: await fetchAllUsage() };
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "getUsage") {
    return collectUsage();
  }

  return undefined;
});
