import { COPILOT_HOST_PERMISSION, COPILOT_PLANS } from "../providers/copilot.js";
import { hasHostPermission, requestHostPermission } from "../providers/shared.js";
import { getCopilotSettings, saveCopilotSettings } from "../settings.js";

const form = document.querySelector("#copilot-form");
const planSelect = document.querySelector("#plan");
const allowanceInput = document.querySelector("#allowance");
const allowanceLabel = document.querySelector("#allowance-label");
const grantButton = document.querySelector("#grant");
const status = document.querySelector("#status");

function showStatus(text) {
  status.textContent = text;
  setTimeout(() => {
    status.textContent = "";
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

async function load() {
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

  showStatus("Saved.");
});

planSelect.addEventListener("change", syncAllowanceVisibility);

grantButton.addEventListener("click", async () => {
  if (await requestHostPermission(COPILOT_HOST_PERMISSION)) {
    await syncGrantButton();
    showStatus("Access granted.");
  }
});

fillPlans();
load();
