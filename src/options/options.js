import { readCache } from "../cache.js";
import { COPILOT_HOST_PERMISSION, COPILOT_PLANS } from "../providers/copilot.js";
import { PROVIDERS } from "../providers/index.js";
import { OPENROUTER_HOST_PERMISSION } from "../providers/openrouter.js";
import { hasHostPermission, requestHostPermission } from "../providers/shared.js";
import {
  REFRESH_OPTIONS,
  TAB_APPEARANCE_OPTIONS,
  accountKey,
  getCopilotSettings,
  getGeneralSettings,
  getOpenRouterSettings,
  getProviderSettings,
  isAccountEnabled,
  isProviderEnabled,
  saveCopilotSettings,
  saveGeneralSettings,
  saveOpenRouterSettings,
  saveProviderSettings,
  sortAccounts,
  sortProviders,
} from "../settings.js";

const form = document.querySelector("#copilot-form");
const openRouterForm = document.querySelector("#openrouter-form");
const providerList = document.querySelector("#providers");
const providerSections = document.querySelectorAll("section[data-provider]");
const providerStatus = document.querySelector("#provider-status");
const refreshSelect = document.querySelector("#refresh-minutes");
const appearanceSelect = document.querySelector("#tab-appearance");
const planSelect = document.querySelector("#plan");
const allowanceInput = document.querySelector("#allowance");
const allowanceLabel = document.querySelector("#allowance-label");
const grantButton = document.querySelector("#grant");
const openRouterGrantButton = document.querySelector("#openrouter-grant");
const status = document.querySelector("#status");
const openRouterStatus = document.querySelector("#openrouter-status");
const refreshStatus = document.querySelector("#refresh-status");
const appearanceStatus = document.querySelector("#appearance-status");

function showStatus(element, text) {
  element.textContent = text;
  setTimeout(() => {
    element.textContent = "";
  }, 2500);
}

function syncProviderSections() {
  for (const section of providerSections) {
    const selector = `input[data-provider="${section.dataset.provider}"]:not([data-account])`;
    const toggle = providerList.querySelector(selector);

    section.hidden = !(toggle?.checked ?? true);
  }
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
  syncProviderSections();
  showStatus(providerStatus, "Saved.");
}

async function saveOrder() {
  const stored = await getProviderSettings();
  const groups = [...providerList.querySelectorAll(".provider-group")];
  const accountOrder = { ...stored.accountOrder };

  for (const group of groups) {
    const ids = [...group.querySelectorAll(".account-row")].map((row) => row.dataset.account);

    if (ids.length > 0) {
      accountOrder[group.dataset.provider] = ids;
    }
  }

  await saveProviderSettings({
    providerOrder: groups.map((group) => group.dataset.provider),
    accountOrder,
  });
  showStatus(providerStatus, "Order saved.");
}

function rowsIn(container) {
  return [...container.querySelectorAll(":scope > .sortable-row")];
}

function moveControls(row) {
  return row.querySelector(":scope > .row-main > .move");
}

function syncMoveButtons(container) {
  const rows = rowsIn(container);

  rows.forEach((row, index) => {
    const move = moveControls(row);

    move.querySelector(".move-up").disabled = index === 0;
    move.querySelector(".move-down").disabled = index === rows.length - 1;
  });
}

function moveRow(row, container, offset) {
  const rows = rowsIn(container);
  const target = rows[rows.indexOf(row) + offset];

  if (!target) {
    return;
  }

  if (offset < 0) {
    target.before(row);
  } else {
    target.after(row);
  }

  syncMoveButtons(container);
  saveOrder();
}

function createMoveButton(label, title, className) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);

  return button;
}

function createMoveControls(row, container) {
  const move = document.createElement("span");
  const up = createMoveButton("↑", "Move up", "move-up");
  const down = createMoveButton("↓", "Move down", "move-down");

  move.className = "move";
  move.append(up, down);

  up.addEventListener("click", () => {
    moveRow(row, container, -1);
    (up.disabled ? down : up).focus();
  });

  down.addEventListener("click", () => {
    moveRow(row, container, 1);
    (down.disabled ? up : down).focus();
  });

  return move;
}

function createRowMain(row, container, toggle) {
  const main = document.createElement("div");

  main.className = "row-main";
  main.append(toggle, createMoveControls(row, container));

  return main;
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

function renderAccountRow(provider, account, settings, container) {
  const row = document.createElement("div");

  row.className = "account-row sortable-row";
  row.dataset.account = account.id;
  row.append(
    createRowMain(
      row,
      container,
      createToggle({
        providerId: provider.id,
        accountId: account.id,
        label: account.name ?? account.id,
        checked: isAccountEnabled(settings, provider.id, account.id),
      }),
    ),
  );

  return row;
}

function renderProviderGroup(provider, settings, cache) {
  const group = document.createElement("div");
  const accounts = document.createElement("div");
  const known = sortAccounts(settings, provider.id, knownAccounts(cache, provider.id));

  group.className = "provider-group sortable-row";
  group.dataset.provider = provider.id;
  accounts.className = "accounts";

  if (known.length === 0) {
    const hint = document.createElement("p");

    hint.className = "hint";
    hint.textContent = "No organizations found yet. Open the popup to load them.";
    accounts.append(hint);
  } else {
    accounts.append(
      ...known.map((account) => renderAccountRow(provider, account, settings, accounts)),
    );
  }

  group.append(
    createRowMain(
      group,
      providerList,
      createToggle({
        providerId: provider.id,
        label: provider.name,
        checked: isProviderEnabled(settings, provider.id),
      }),
    ),
    accounts,
  );
  syncMoveButtons(accounts);

  return group;
}

async function fillProviders() {
  const [settings, cache] = await Promise.all([getProviderSettings(), readCache()]);

  providerList.replaceChildren(
    ...sortProviders(settings, PROVIDERS).map((provider) =>
      renderProviderGroup(provider, settings, cache),
    ),
  );

  syncMoveButtons(providerList);
  syncAccountToggles();
  syncProviderSections();
}

function syncAllowanceVisibility() {
  const isCustom = planSelect.value === "custom";

  allowanceInput.hidden = !isCustom;
  allowanceLabel.hidden = !isCustom;
}

function bindGrantButton(button, origin, statusElement) {
  async function sync() {
    button.hidden = await hasHostPermission(origin);
  }

  button.addEventListener("click", async () => {
    if (await requestHostPermission(origin)) {
      await sync();
      showStatus(statusElement, "Access granted.");
    }
  });

  return sync;
}

function fillSelect(select, options) {
  select.replaceChildren(
    ...options.map(({ value, label }) => {
      const element = document.createElement("option");

      element.value = value;
      element.textContent = label;

      return element;
    }),
  );
}

function fillPlans() {
  fillSelect(
    planSelect,
    COPILOT_PLANS.map((plan) => ({
      value: plan.id,
      label: plan.allowance ? `${plan.label} (${plan.allowance}/month)` : plan.label,
    })),
  );
}

function fillRefreshOptions() {
  fillSelect(
    refreshSelect,
    REFRESH_OPTIONS.map((option) => ({ value: String(option.minutes), label: option.label })),
  );
}

function fillAppearanceOptions() {
  fillSelect(
    appearanceSelect,
    TAB_APPEARANCE_OPTIONS.map((option) => ({ value: option.id, label: option.label })),
  );
}

async function load() {
  const general = await getGeneralSettings();

  refreshSelect.value = String(general.refreshMinutes);
  appearanceSelect.value = general.tabAppearance;

  await fillProviders();

  const [copilot, openRouter] = await Promise.all([getCopilotSettings(), getOpenRouterSettings()]);

  form.username.value = copilot.username;
  form.token.value = copilot.token;
  planSelect.value = copilot.plan;
  allowanceInput.value = copilot.allowance;
  openRouterForm.apiKey.value = openRouter.apiKey;

  syncAllowanceVisibility();
  await Promise.all([syncGrantButton(), syncOpenRouterGrantButton()]);
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

openRouterForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  await saveOpenRouterSettings({ apiKey: openRouterForm.apiKey.value.trim() });

  showStatus(openRouterStatus, "Saved.");
});

planSelect.addEventListener("change", syncAllowanceVisibility);

refreshSelect.addEventListener("change", async () => {
  await saveGeneralSettings({ refreshMinutes: Number(refreshSelect.value) });
  showStatus(refreshStatus, "Saved.");
});

appearanceSelect.addEventListener("change", async () => {
  await saveGeneralSettings({ tabAppearance: appearanceSelect.value });
  showStatus(appearanceStatus, "Saved.");
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.usageCache) {
    fillProviders();
  }
});

const syncGrantButton = bindGrantButton(grantButton, COPILOT_HOST_PERMISSION, status);
const syncOpenRouterGrantButton = bindGrantButton(
  openRouterGrantButton,
  OPENROUTER_HOST_PERMISSION,
  openRouterStatus,
);

fillRefreshOptions();
fillAppearanceOptions();
fillPlans();
load();
