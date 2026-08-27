import { requestHostPermission } from "../providers/shared.js";

const providersElement = document.querySelector("#providers");
const providerTemplate = document.querySelector("#provider-template");
const accountTemplate = document.querySelector("#account-template");
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

function formatPercent(percent) {
  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  return `${Math.round(percent)}%`;
}

function renderLimit(limit) {
  const node = limitTemplate.content.cloneNode(true);
  const item = node.querySelector(".limit");
  const hasPercent = typeof limit.percent === "number";
  const percent = hasPercent ? limit.percent : 0;

  item.classList.add(`severity-${limit.severity}`);
  item.classList.toggle("active", limit.isActive);
  node.querySelector(".limit-label").textContent = limit.label;
  node.querySelector(".limit-value").textContent = hasPercent ? formatPercent(percent) : "";
  node.querySelector(".bar").hidden = !hasPercent;
  node.querySelector(".bar-fill").style.width =
    percent > 0 ? `max(${percent}%, 2px)` : "0";
  node.querySelector(".limit-detail").textContent = limit.detail ?? "";
  node.querySelector(".limit-reset").textContent = formatReset(limit.resetsAt);

  return node;
}

function renderAccount(account) {
  const node = accountTemplate.content.cloneNode(true);
  const limits = node.querySelector(".limits");
  const spend = node.querySelector(".spend");
  const message = node.querySelector(".message");

  node.querySelector(".account-name").textContent = account.name;
  node.querySelector(".account-type").textContent = account.type ?? "";

  limits.hidden = account.state !== "ok";
  message.hidden = account.state === "ok";
  spend.hidden = true;

  if (account.state === "ok") {
    limits.append(...account.limits.map(renderLimit));

    if (account.spend) {
      spend.hidden = false;
      spend.textContent = `${account.spend.label}: ${account.spend.text}`;
    }
  } else {
    message.textContent = account.message;
    message.classList.toggle("error", account.state === "error");
  }

  return node;
}

function renderProvider(provider) {
  const node = providerTemplate.content.cloneNode(true);
  const accounts = node.querySelector(".accounts");
  const message = node.querySelector(".message");
  const action = node.querySelector(".action");

  node.querySelector("h2").textContent = provider.name;
  accounts.hidden = provider.state !== "ok";
  message.hidden = provider.state === "ok";
  action.hidden = true;

  if (provider.state === "ok") {
    accounts.append(...provider.accounts.map(renderAccount));
    accounts.classList.toggle("single", provider.accounts.length === 1);
  } else {
    message.textContent = provider.message;
    message.classList.toggle("error", provider.state === "error");
  }

  if (provider.state === "needs-permission") {
    action.hidden = false;
    action.textContent = "Grant access";
    action.addEventListener("click", async () => {
      if (await requestHostPermission(provider.hostPermission)) {
        await render();
      }
    });
  }

  if (provider.state === "needs-config") {
    action.hidden = false;
    action.textContent = "Open settings";
    action.addEventListener("click", () => browser.runtime.openOptionsPage());
  }

  if (provider.state === "signed-out") {
    const host = new URL(provider.hostPermission.replace("/*", "/")).host;

    action.hidden = false;
    action.textContent = `Open ${host}`;
    action.addEventListener("click", async () => {
      await browser.tabs.create({ url: `https://${host}/` });
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
