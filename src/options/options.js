import { readCache } from "../cache.js";
import { COPILOT_HOST_PERMISSION, COPILOT_PLANS } from "../providers/copilot.js";
import { PROVIDERS } from "../providers/index.js";
import { hasHostPermission, requestHostPermission } from "../providers/shared.js";
import {
  REFRESH_OPTIONS,
  accountKey,
  getCopilotSettings,
  getGeneralSettings,
  getProviderSettings,
  isAccountEnabled,
  isProviderEnabled,
  saveCopilotSettings,
  saveGeneralSettings,
  saveProviderSettings,
} from "../settings.js";

const form = document.querySelector("#copilot-form");
const providerList = document.querySelector("#providers");
const copilotSection = document.querySelector("#copilot-section");
const providerStatus = document.querySelector("#provider-status");
const refreshSelect = document.querySelector("#refresh-minutes");
const planSelect = document.querySelector("#plan");
const allowanceInput = document.querySelector("#allowance");
const allowanceLabel = document.querySelector("#allowance-label");
const grantButton = document.querySelector("#grant");
const status = document.querySelector("#status");
const refreshStatus = document.querySelector("#refresh-status");

function showStatus(element, text) {
  element.textContent = text;
  setTimeout(() => {
    element.textContent = "";
  }, 2500);
}

function syncCopilotSection() {
  const toggle = providerList.querySelector('input[data-provider="copilot"]:not([data-account])');

  copilotSection.hidden = !(toggle?.checked ?? true);
}

function syncAccountToggles() {
  for (const group of providerList.querySelectorAll(".provider-group")) {
    const enabled = group.querySelector("input:not([data-account])").checked;

    group.querySelector(".accounts").classList.toggle("disabled", !enabled);

    for (const input of group.querySelectorAll("input[data-account]")) {
      input.disabled = !enabled;
    }
  }
}

async function saveProviders() {
  const stored = await getProviderSettings();
  const enabled = { ...stored.enabled };
  const accounts = { ...stored.accounts };

  for (const input of providerList.querySelectorAll("input[data-provider]")) {
    if (input.dataset.account) {
      accounts[accountKey(input.dataset.provider, input.dataset.account)] = input.checked;
    } else {
      enabled[input.dataset.provider] = input.checked;
    }
  }

  await saveProviderSettings({ enabled, accounts });
  syncAccountToggles();
  syncCopilotSection();
  showStatus(providerStatus, "Saved.");
}

function createToggle({ providerId, accountId, label, checked }) {
  const element = document.createElement("label");
  const input = document.createElement("input");

  input.type = "checkbox";
  input.checked = checked;
  input.dataset.provider = providerId;

  if (accountId !== undefined) {
    input.dataset.account = accountId;
  }

  input.addEventListener("change", saveProviders);

  element.className = "toggle";
  element.append(input, label);

  return element;
}

function knownAccounts(cache, providerId) {
  const provider = cache[providerId]?.provider;

  return Array.isArray(provider?.accounts) ? provider.accounts : [];
}

function renderProviderGroup(provider, settings, cache) {
  const group = document.createElement("div");
  const accounts = document.createElement("div");
  const known = knownAccounts(cache, provider.id);

  group.className = "provider-group";
  accounts.className = "accounts";

  if (known.length === 0) {
    const hint = document.createElement("p");

    hint.className = "hint";
    hint.textContent = "No organizations found yet. Open the popup to load them.";
    accounts.append(hint);
  } else {
    accounts.append(
      ...known.map((account) =>
        createToggle({
          providerId: provider.id,
          accountId: account.id,
          label: account.name ?? account.id,
          checked: isAccountEnabled(settings, provider.id, account.id),
        }),
      ),
    );
  }

  group.append(
    createToggle({
      providerId: provider.id,
      label: provider.name,
      checked: isProviderEnabled(settings, provider.id),
    }),
    accounts,
  );

  return group;
}

async function fillProviders() {
  const [settings, cache] = await Promise.all([getProviderSettings(), readCache()]);

  providerList.replaceChildren(
    ...PROVIDERS.map((provider) => renderProviderGroup(provider, settings, cache)),
  );

  syncAccountToggles();
  syncCopilotSection();
}

function syncAllowanceVisibility() {
  const isCustom = planSelect.value === "custom";

  allowanceInput.hidden = !isCustom;
  allowanceLabel.hidden = !isCustom;
}

async function syncGrantButton() {
  const granted = await hasHostPermission(COPILOT_HOST_PERMISSION);

  grantButton.hidden = granted;
}

function fillPlans() {
  planSelect.replaceChildren(
    ...COPILOT_PLANS.map((plan) => {
      const option = document.createElement("option");

      option.value = plan.id;
      option.textContent = plan.allowance
        ? `${plan.label} (${plan.allowance}/month)`
        : plan.label;

      return option;
    }),
  );
}

function fillRefreshOptions() {
  refreshSelect.replaceChildren(
    ...REFRESH_OPTIONS.map((option) => {
      const element = document.createElement("option");

      element.value = String(option.minutes);
      element.textContent = option.label;

      return element;
    }),
  );
}

async function load() {
  const general = await getGeneralSettings();

  refreshSelect.value = String(general.refreshMinutes);

  await fillProviders();

  const settings = await getCopilotSettings();

  form.username.value = settings.username;
  form.token.value = settings.token;
  planSelect.value = settings.plan;
  allowanceInput.value = settings.allowance;

  syncAllowanceVisibility();
  await syncGrantButton();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await saveCopilotSettings({
    username: form.username.value.trim(),
    token: form.token.value.trim(),
    plan: planSelect.value,
    allowance: allowanceInput.value.trim(),
  });

  showStatus(status, "Saved.");
});

planSelect.addEventListener("change", syncAllowanceVisibility);

refreshSelect.addEventListener("change", async () => {
  await saveGeneralSettings({ refreshMinutes: Number(refreshSelect.value) });
  showStatus(refreshStatus, "Saved.");
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.usageCache) {
    fillProviders();
  }
});

grantButton.addEventListener("click", async () => {
  if (await requestHostPermission(COPILOT_HOST_PERMISSION)) {
    await syncGrantButton();
    showStatus(status, "Access granted.");
  }
});

fillRefreshOptions();
fillPlans();
load();
