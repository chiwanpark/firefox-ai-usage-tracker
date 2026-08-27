export const COPILOT_DEFAULTS = {
  token: "",
  username: "",
  plan: "copilot_pro",
  allowance: "",
};

export async function getCopilotSettings() {
  const stored = await browser.storage.local.get("copilot");

  return { ...COPILOT_DEFAULTS, ...(stored.copilot ?? {}) };
}

export async function saveCopilotSettings(values) {
  await browser.storage.local.set({ copilot: { ...COPILOT_DEFAULTS, ...values } });
}
