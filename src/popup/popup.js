import { requestHostPermission } from "../providers/shared.js";

const tabsElement = document.querySelector("#tabs");
const panelElement = document.querySelector("#panel");
const statusElement = document.querySelector("#status");
const settingsButton = document.querySelector("#settings");

const tabTemplate = document.querySelector("#tab-template");
const overviewTemplate = document.querySelector("#overview-template");
const cardTemplate = document.querySelector("#card-template");
const miniLimitTemplate = document.querySelector("#mini-limit-template");
const providerTemplate = document.querySelector("#provider-template");
const accountTemplate = document.querySelector("#account-template");
const limitTemplate = document.querySelector("#limit-template");
const emptyTemplate = document.querySelector("#empty-template");

const REFRESH_TIMEOUT_MS = 20000;
const OVERVIEW_TAB = "overview";
const TAB_STORAGE_KEY = "popupTab";
const SHORT_NAMES = { copilot: "Copilot" };
const ATTENTION_STATES = new Set(["needs-permission", "needs-config", "signed-out", "error"]);
const SEVERITY_RANK = { normal: 0, warning: 1, critical: 2 };
const CHIP_LABELS = {
  "needs-permission": "Needs access",
  "needs-config": "Needs setup",
  "signed-out": "Sign in",
  error: "Error",
  empty: "No data",
  disabled: "Hidden",
};

let entries = [];
let activeTab = OVERVIEW_TAB;
let refreshing = false;
let refreshTimer = null;

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function minutesUntil(resetsAt) {
  if (!resetsAt) {
    return null;
  }

  const target = new Date(resetsAt);

  return Number.isNaN(target.getTime()) ? null : Math.round((target.getTime() - Date.now()) / 60000);
}

function formatReset(resetsAt) {
  const minutes = minutesUntil(resetsAt);

  if (minutes === null) {
    return "";
  }

  return minutes <= 0 ? "now" : `in ${formatDuration(minutes)}`;
}

function formatAbsolute(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);

  return minutes < 1 ? "just now" : `${formatDuration(minutes)} ago`;
}

function formatPercent(percent) {
  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  return `${Math.round(percent)}%`;
}

function shortName(provider) {
  return SHORT_NAMES[provider.id] ?? provider.name;
}

function accountsOf(provider) {
  return Array.isArray(provider.accounts) ? provider.accounts : [];
}

function limitsOf(account) {
  return account.state === "ok" && Array.isArray(account.limits) ? account.limits : [];
}

function worstSeverity(limits) {
  return limits.reduce(
    (worst, limit) =>
      (SEVERITY_RANK[limit.severity] ?? 0) > SEVERITY_RANK[worst] ? limit.severity : worst,
    "normal",
  );
}

function tabStatus(entry) {
  const { provider } = entry;

  if (entry.error || ATTENTION_STATES.has(provider.state)) {
    return "attention";
  }

  if (provider.state !== "ok") {
    return "none";
  }

  const severity = worstSeverity(accountsOf(provider).flatMap(limitsOf));

  return severity === "normal" ? "none" : severity;
}

function setIcon(icon, symbolId) {
  if (!document.getElementById(symbolId)) {
    return false;
  }

  icon.querySelector("use").setAttribute("href", `#${symbolId}`);

  return true;
}

function setTile(tile, providerId) {
  if (setIcon(tile.querySelector(".tile-icon"), `provider-icon-${providerId}`)) {
    tile.dataset.provider = providerId;
    return;
  }

  tile.remove();
}

function applyBar(bar, percent, severity) {
  const hasPercent = typeof percent === "number";

  bar.hidden = !hasPercent;
  bar.dataset.severity = severity ?? "normal";

  if (hasPercent) {
    bar.querySelector(".bar-fill").style.width = percent > 0 ? `max(${percent}%, 2px)` : "0";
  }
}

function applyAction(action, provider) {
  action.hidden = false;

  if (provider.state === "needs-permission") {
    action.textContent = "Grant access";
    action.addEventListener("click", async () => {
      if (await requestHostPermission(provider.hostPermission)) {
        await triggerRefresh();
      }
    });

    return;
  }

  if (provider.state === "needs-config") {
    action.textContent = "Open settings";
    action.addEventListener("click", openSettings);

    return;
  }

  if (provider.state === "signed-out" && provider.hostPermission) {
    const host = new URL(provider.hostPermission.replace("/*", "/")).host;

    action.textContent = `Open ${host}`;
    action.addEventListener("click", async () => {
      await browser.tabs.create({ url: `https://${host}/` });
      window.close();
    });

    return;
  }

  action.hidden = true;
}

function applyRefreshButton(button) {
  button.disabled = refreshing;
  button.classList.toggle("spinning", refreshing);
  button.addEventListener("click", triggerRefresh);
}

function renderLimit(limit) {
  const node = limitTemplate.content.cloneNode(true);
  const hasPercent = typeof limit.percent === "number";
  const value = node.querySelector(".limit-value");
  const reset = node.querySelector(".limit-reset");
  const detail = node.querySelector(".limit-detail");

  node.querySelector(".limit").classList.toggle("active", Boolean(limit.isActive));
  node.querySelector(".limit-label").textContent = limit.label;

  value.textContent = hasPercent ? `${formatPercent(limit.percent)} used` : (limit.detail ?? "");
  value.dataset.severity = limit.severity ?? "normal";

  applyBar(node.querySelector(".bar"), limit.percent, limit.severity);

  reset.textContent = limit.resetsAt ? `Resets ${formatReset(limit.resetsAt)}` : "";
  reset.title = formatAbsolute(limit.resetsAt);
  detail.textContent = hasPercent ? (limit.detail ?? "") : "";

  return node;
}

function renderMiniLimit(limit) {
  const node = miniLimitTemplate.content.cloneNode(true);
  const hasPercent = typeof limit.percent === "number";
  const value = node.querySelector(".mini-value");
  const reset = node.querySelector(".mini-reset");

  node.querySelector(".mini-label").textContent = limit.label;

  value.textContent = hasPercent ? formatPercent(limit.percent) : (limit.detail ?? "");
  value.dataset.severity = limit.severity ?? "normal";

  reset.textContent = formatReset(limit.resetsAt);
  reset.title = formatAbsolute(limit.resetsAt);

  applyBar(node.querySelector(".bar"), limit.percent, limit.severity);

  return node;
}

function renderAccount(account, showHead) {
  const node = accountTemplate.content.cloneNode(true);
  const head = node.querySelector(".account-head");
  const limits = node.querySelector(".limits");
  const spend = node.querySelector(".spend");
  const message = node.querySelector(".message");
  const isOk = account.state === "ok";

  head.hidden = !showHead;
  node.querySelector(".account-name").textContent = account.name;
  node.querySelector(".account-type").textContent = account.type ?? "";

  limits.hidden = !isOk;
  spend.hidden = !isOk || !account.spend;
  message.hidden = isOk;

  if (isOk) {
    limits.append(...limitsOf(account).map(renderLimit));

    if (account.spend) {
      spend.querySelector(".spend-label").textContent = account.spend.label;
      spend.querySelector(".spend-value").textContent = account.spend.text;
      applyBar(spend.querySelector(".bar"), account.spend.percent, account.spend.severity);
    }
  } else {
    message.textContent = account.message ?? "";
    message.classList.toggle("error", account.state === "error");
  }

  return node;
}

function providerSubtitle(entry) {
  if (entry.fetchedAt) {
    return `Updated ${formatClock(entry.fetchedAt)}`;
  }

  return entry.provider.state === "loading" ? "Loading…" : "Not refreshed yet";
}

function renderProviderPanel(entry) {
  const { provider } = entry;
  const node = providerTemplate.content.cloneNode(true);
  const accounts = accountsOf(provider);
  const container = node.querySelector(".accounts");
  const meta = node.querySelector(".panel-meta");
  const stale = node.querySelector(".stale");
  const message = node.querySelector(".message");
  const action = node.querySelector(".action");
  const skeleton = node.querySelector(".skeleton");
  const isLoading = provider.state === "loading";
  const isOk = provider.state === "ok";
  const single = accounts.length === 1 ? accounts[0] : null;

  node.querySelector(".panel-body").dataset.provider = provider.id;
  setTile(node.querySelector(".tile"), provider.id);
  node.querySelector("h1").textContent = provider.name;
  node.querySelector(".panel-sub").textContent = providerSubtitle(entry);
  applyRefreshButton(node.querySelector(".refresh"));

  meta.hidden = !single;
  meta.textContent = single ? [single.name, single.type].filter(Boolean).join(" · ") : "";

  stale.hidden = !entry.error;
  stale.textContent = entry.error ? `Last refresh failed: ${entry.error.message}` : "";

  skeleton.hidden = !isLoading;
  container.hidden = !isOk;
  message.textContent = isOk ? "" : (provider.message ?? "");
  message.hidden = isLoading || message.textContent === "";
  message.classList.toggle("error", provider.state === "error");

  if (isOk) {
    container.append(...accounts.map((account) => renderAccount(account, accounts.length > 1)));
  }

  applyAction(action, provider);

  return node;
}

function cardSubtitle(provider, account) {
  if (!account) {
    return "";
  }

  return account.name && account.name !== provider.name ? account.name : (account.type ?? "");
}

function cardChip(entry, account) {
  const state = account ? account.state : entry.provider.state;

  if (state === "loading") {
    return null;
  }

  if (state !== "ok") {
    return { text: CHIP_LABELS[state] ?? "Unavailable", tone: state === "error" ? "critical" : "attention" };
  }

  return entry.error ? { text: "Stale", tone: "warning" } : null;
}

function renderCard(entry, account) {
  const { provider } = entry;
  const node = cardTemplate.content.cloneNode(true);
  const card = node.querySelector(".card");
  const chip = node.querySelector(".card-chip");
  const limitsElement = node.querySelector(".card-limits");
  const message = node.querySelector(".message");
  const action = node.querySelector(".action");
  const skeleton = node.querySelector(".skeleton");
  const isLoading = provider.state === "loading";
  const limits = account ? limitsOf(account) : [];
  const state = account ? account.state : provider.state;
  const status = cardChip(entry, account);
  const text = account ? account.message : provider.message;

  setTile(node.querySelector(".tile"), provider.id);
  node.querySelector(".card-name").textContent = provider.name;
  node.querySelector(".card-sub").textContent = cardSubtitle(provider, account);

  chip.hidden = !status;
  chip.dataset.tone = status?.tone ?? "attention";
  chip.textContent = status?.text ?? "";

  limitsElement.hidden = limits.length === 0;
  limitsElement.append(...limits.map(renderMiniLimit));

  skeleton.hidden = !isLoading;
  message.textContent = limits.length > 0 ? "" : (text ?? "");
  message.hidden = isLoading || message.textContent === "";
  message.classList.toggle("error", state === "error");

  applyAction(action, provider);

  card.dataset.provider = provider.id;

  if (entry.error) {
    card.classList.add("stale-card");
    card.title = `Last refresh failed: ${entry.error.message}`;
  }

  if (action.hidden) {
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("click", () => selectTab(provider.id, { focus: false }));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectTab(provider.id, { focus: false });
      }
    });
  } else {
    card.classList.add("static");
  }

  return node;
}

function overviewSubtitle() {
  const count = entries.length;

  if (count === 0) {
    return "";
  }

  const attention = entries.filter((entry) => tabStatus(entry) === "attention").length;
  const timestamps = entries.map((entry) => entry.fetchedAt).filter(Boolean);
  const parts = [];

  if (timestamps.length > 0) {
    parts.push(`Updated ${formatClock(Math.min(...timestamps))}`);
  }

  parts.push(`${count} provider${count === 1 ? "" : "s"}`);

  if (attention > 0) {
    parts.push(`${attention} need${attention === 1 ? "s" : ""} attention`);
  }

  return parts.join(" · ");
}

function renderEmpty() {
  const node = emptyTemplate.content.cloneNode(true);

  node.querySelector(".action").addEventListener("click", openSettings);

  return node;
}

function renderOverviewPanel() {
  const node = overviewTemplate.content.cloneNode(true);
  const cards = node.querySelector(".cards");
  const sub = node.querySelector(".panel-sub");

  sub.textContent = overviewSubtitle();
  sub.hidden = sub.textContent === "";
  applyRefreshButton(node.querySelector(".refresh"));

  if (entries.length === 0) {
    cards.append(renderEmpty());

    return node;
  }

  for (const entry of entries) {
    const accounts = entry.provider.state === "ok" ? accountsOf(entry.provider) : [];

    if (accounts.length === 0) {
      cards.append(renderCard(entry, null));
      continue;
    }

    cards.append(...accounts.map((account) => renderCard(entry, account)));
  }

  return node;
}

function tabDescriptors() {
  return [
    { id: OVERVIEW_TAB, label: "Overview", symbol: "tab-icon-overview", status: "none" },
    ...entries.map((entry) => ({
      id: entry.provider.id,
      label: shortName(entry.provider),
      symbol: `provider-icon-${entry.provider.id}`,
      status: tabStatus(entry),
    })),
  ];
}

function renderTabs() {
  const nodes = tabDescriptors().map((descriptor) => {
    const node = tabTemplate.content.cloneNode(true);
    const tab = node.querySelector(".tab");
    const dot = node.querySelector(".tab-dot");
    const isActive = descriptor.id === activeTab;

    if (!setIcon(node.querySelector(".tab-icon"), descriptor.symbol)) {
      node.querySelector(".tab-icon").remove();
    }

    tab.id = `tab-${descriptor.id}`;
    tab.dataset.tab = descriptor.id;
    tab.dataset.provider = descriptor.id;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    node.querySelector(".tab-label").textContent = descriptor.label;

    dot.hidden = descriptor.status === "none";
    dot.dataset.status = descriptor.status;

    tab.addEventListener("click", () => selectTab(descriptor.id, { focus: false }));

    return node;
  });

  tabsElement.replaceChildren(...nodes);
  panelElement.setAttribute("aria-labelledby", `tab-${activeTab}`);
}

function renderPanel() {
  const entry = entries.find((current) => current.provider.id === activeTab);

  panelElement.replaceChildren(entry ? renderProviderPanel(entry) : renderOverviewPanel());
}

function updateStatus() {
  if (refreshing) {
    statusElement.textContent = "Refreshing…";
    return;
  }

  const timestamps = entries.map((entry) => entry.fetchedAt).filter(Boolean);

  statusElement.textContent =
    timestamps.length === 0 ? "" : `Updated ${formatAgo(Math.min(...timestamps))}`;
}

function renderAll() {
  const known = new Set([OVERVIEW_TAB, ...entries.map((entry) => entry.provider.id)]);

  if (!known.has(activeTab)) {
    activeTab = OVERVIEW_TAB;
  }

  renderTabs();
  renderPanel();
  updateStatus();
}

function storeActiveTab() {
  browser.storage.session?.set({ [TAB_STORAGE_KEY]: activeTab }).catch(() => {});
}

async function restoreActiveTab() {
  try {
    const stored = await browser.storage.session.get(TAB_STORAGE_KEY);

    if (typeof stored?.[TAB_STORAGE_KEY] === "string") {
      activeTab = stored[TAB_STORAGE_KEY];
    }
  } catch {
    activeTab = OVERVIEW_TAB;
  }
}

function selectTab(id, { focus = true } = {}) {
  if (id !== activeTab) {
    activeTab = id;
    storeActiveTab();
    renderAll();
  }

  const tab = tabsElement.querySelector(`[data-tab="${CSS.escape(id)}"]`);

  tab?.scrollIntoView({ block: "nearest", inline: "nearest" });

  if (focus) {
    tab?.focus();
  }
}

function moveTabFocus(offset) {
  const ids = tabDescriptors().map((descriptor) => descriptor.id);
  const next = ids[(ids.indexOf(activeTab) + offset + ids.length) % ids.length];

  selectTab(next);
}

function openSettings() {
  browser.runtime.openOptionsPage();
}

function endRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshing = false;
  renderAll();
}

async function triggerRefresh() {
  refreshing = true;
  renderAll();

  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(endRefresh, REFRESH_TIMEOUT_MS);

  await browser.runtime.sendMessage({ type: "refreshUsage" });
}

function upsert(entry) {
  const index = entries.findIndex((current) => current.provider.id === entry.provider.id);

  if (index === -1) {
    entries.push(entry);
  } else {
    entries[index] = entry;
  }
}

tabsElement.addEventListener("keydown", (event) => {
  const offsets = { ArrowLeft: -1, ArrowRight: 1 };

  if (event.key in offsets) {
    event.preventDefault();
    moveTabFocus(offsets[event.key]);
  }
});

settingsButton.addEventListener("click", openSettings);

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "usageUpdated") {
    upsert(message.entry);
    renderAll();
  }

  if (message?.type === "refreshDone") {
    endRefresh();
  }

  if (message?.type === "providersChanged") {
    init();
  }
});

async function init() {
  const [response] = await Promise.all([
    browser.runtime.sendMessage({ type: "getUsage" }),
    restoreActiveTab(),
  ]);

  entries = response?.entries ?? [];
  renderAll();
  await triggerRefresh();
}

init();
