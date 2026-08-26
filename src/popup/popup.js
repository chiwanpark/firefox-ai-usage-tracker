import { requestHostPermission } from "../providers/claude.js";

const providersElement = document.querySelector("#providers");
const providerTemplate = document.querySelector("#provider-template");
const organizationTemplate = document.querySelector("#organization-template");
const limitTemplate = document.querySelector("#limit-template");

function formatReset(resetsAt) {
  if (!resetsAt) {
    return "";
  }

  const target = new Date(resetsAt);

  if (Number.isNaN(target.getTime())) {
    return "";
  }

  const minutes = Math.round((target.getTime() - Date.now()) / 60000);

  if (minutes <= 0) {
    return "resets now";
  }

  if (minutes < 60) {
    return `resets in ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `resets in ${hours}h ${minutes % 60}m`;
  }

  return `resets in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function renderLimit(limit) {
  const node = limitTemplate.content.cloneNode(true);
  const item = node.querySelector(".limit");
  const percent = Math.round(limit.percent);

  item.classList.add(`severity-${limit.severity}`);
  item.classList.toggle("active", limit.isActive);
  node.querySelector(".limit-label").textContent = limit.label;
  node.querySelector(".limit-value").textContent = `${percent}%`;
  node.querySelector(".bar-fill").style.width = `${percent}%`;
  node.querySelector(".limit-reset").textContent = formatReset(limit.resetsAt);

  return node;
}

function renderOrganization(organization) {
  const node = organizationTemplate.content.cloneNode(true);
  const limits = node.querySelector(".limits");
  const spend = node.querySelector(".spend");
  const message = node.querySelector(".message");

  node.querySelector(".organization-name").textContent = organization.name;
  node.querySelector(".organization-type").textContent = organization.type ?? "";

  limits.hidden = organization.state !== "ok";
  message.hidden = organization.state === "ok";
  spend.hidden = true;

  if (organization.state === "ok") {
    limits.append(...organization.limits.map(renderLimit));

    if (organization.spend) {
      spend.hidden = false;
      spend.textContent = `${organization.spend.label}: ${organization.spend.text}`;
    }
  } else {
    message.textContent = organization.message;
    message.classList.toggle("error", organization.state === "error");
  }

  return node;
}

function renderProvider(provider) {
  const node = providerTemplate.content.cloneNode(true);
  const organizations = node.querySelector(".organizations");
  const message = node.querySelector(".message");
  const action = node.querySelector(".action");

  node.querySelector("h2").textContent = provider.name;
  organizations.hidden = provider.state !== "ok";
  message.hidden = provider.state === "ok";
  action.hidden = true;

  if (provider.state === "ok") {
    organizations.append(...provider.organizations.map(renderOrganization));
    organizations.classList.toggle("single", provider.organizations.length === 1);
  } else {
    message.textContent = provider.message;
    message.classList.toggle("error", provider.state === "error");
  }

  if (provider.state === "needs-permission") {
    action.hidden = false;
    action.textContent = "Grant access";
    action.addEventListener("click", async () => {
      if (await requestHostPermission()) {
        await render();
      }
    });
  }

  if (provider.state === "signed-out") {
    action.hidden = false;
    action.textContent = "Open claude.ai";
    action.addEventListener("click", async () => {
      await browser.tabs.create({ url: "https://claude.ai/" });
      window.close();
    });
  }

  return node;
}

async function render() {
  providersElement.replaceChildren();

  const response = await browser.runtime.sendMessage({ type: "getUsage" });
  const providers = response?.providers ?? [];

  providersElement.append(...providers.map(renderProvider));
}

document.querySelector("#refresh").addEventListener("click", render);
render();
