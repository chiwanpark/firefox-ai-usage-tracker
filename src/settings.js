export const GENERAL_DEFAULTS = {
  refreshMinutes: 10,
  tabAppearance: "inline",
};

export const TAB_APPEARANCE_OPTIONS = [
  { id: "inline", label: "Icon with label" },
  { id: "icon", label: "Icon only" },
  { id: "stacked", label: "Icon above label" },
];

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
  const current = await getGeneralSettings();

  await browser.storage.local.set({ general: { ...current, ...values } });
}

export const PROVIDER_DEFAULTS = {
  enabled: {},
  accounts: {},
  providerOrder: [],
  accountOrder: {},
};

export async function getProviderSettings() {
  const stored = await browser.storage.local.get("providers");

  return {
    enabled: { ...PROVIDER_DEFAULTS.enabled, ...(stored.providers?.enabled ?? {}) },
    accounts: { ...PROVIDER_DEFAULTS.accounts, ...(stored.providers?.accounts ?? {}) },
    providerOrder: [...(stored.providers?.providerOrder ?? PROVIDER_DEFAULTS.providerOrder)],
    accountOrder: { ...PROVIDER_DEFAULTS.accountOrder, ...(stored.providers?.accountOrder ?? {}) },
  };
}

export async function saveProviderSettings(values) {
  const current = await getProviderSettings();
  const next = { ...current, ...values };

  await browser.storage.local.set({
    providers: {
      enabled: { ...next.enabled },
      accounts: { ...next.accounts },
      providerOrder: [...next.providerOrder],
      accountOrder: { ...next.accountOrder },
    },
  });
}

function sortByOrder(items, order, getId) {
  const ranks = new Map(order.map((id, index) => [id, index]));

  return items
    .map((item, index) => ({ item, rank: ranks.get(getId(item)) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item);
}

export function sortProviders(settings, providers) {
  return sortByOrder(providers, settings.providerOrder ?? [], (provider) => provider.id);
}

export function sortAccounts(settings, providerId, accounts) {
  return sortByOrder(accounts, settings.accountOrder?.[providerId] ?? [], (account) => account.id);
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
