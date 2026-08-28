export const GENERAL_DEFAULTS = {
  refreshMinutes: 10,
};

export const REFRESH_OPTIONS = [
  { minutes: 0, label: "Only when opened" },
  { minutes: 5, label: "Every 5 minutes" },
  { minutes: 10, label: "Every 10 minutes" },
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Every hour" },
];

export async function getGeneralSettings() {
  const stored = await browser.storage.local.get("general");

  return { ...GENERAL_DEFAULTS, ...(stored.general ?? {}) };
}

export async function saveGeneralSettings(values) {
  await browser.storage.local.set({ general: { ...GENERAL_DEFAULTS, ...values } });
}

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
