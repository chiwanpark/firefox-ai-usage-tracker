browser.runtime.onInstalled.addListener(() => {
  console.log("AI Usage Tracker installed");
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "getUsage") {
    return Promise.resolve({ providers: [] });
  }

  return undefined;
});
