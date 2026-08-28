import { COPILOT_HOST_PERMISSION, COPILOT_PLANS } from "../providers/copilot.js";
import { hasHostPermission, requestHostPermission } from "../providers/shared.js";
import {
  REFRESH_OPTIONS,
  getCopilotSettings,
  getGeneralSettings,
  saveCopilotSettings,
  saveGeneralSettings,
} from "../settings.js";

const form = document.querySelector("#copilot-form");
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

grantButton.addEventListener("click", async () => {
  if (await requestHostPermission(COPILOT_HOST_PERMISSION)) {
    await syncGrantButton();
    showStatus(status, "Access granted.");
  }
});

fillRefreshOptions();
fillPlans();
load();
