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

export const PROVIDER_DEFAULTS = {
  enabled: {},
  accounts: {},
};

export async function getProviderSettings() {
  const stored = await browser.storage.local.get("providers");

  return {
    enabled: { ...PROVIDER_DEFAULTS.enabled, ...(stored.providers?.enabled ?? {}) },
    accounts: { ...PROVIDER_DEFAULTS.accounts, ...(stored.providers?.accounts ?? {}) },
  };
}

export async function saveProviderSettings(values) {
  await browser.storage.local.set({
    providers: {
      enabled: { ...values.enabled },
      accounts: { ...values.accounts },
    },
  });
}

export function isProviderEnabled(settings, id) {
  return settings.enabled?.[id] !== false;
}

export function accountKey(providerId, accountId) {
  return `${providerId}:${accountId}`;
}

export function isAccountEnabled(settings, providerId, accountId) {
  return settings.accounts?.[accountKey(providerId, accountId)] !== false;
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
