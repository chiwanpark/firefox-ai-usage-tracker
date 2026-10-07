import { getProviderSettings, isAccountEnabled } from "../settings.js";
import {
  collectStoreAccounts,
  listStores,
  storeAccountId,
  storeRequestOptions,
} from "./containers.js";
import {
  UsageError,
  clampPercent,
  fetchJson,
  hasHostPermission,
  humanize,
  toErrorState,
} from "./shared.js";

export const CLAUDE_HOST_PERMISSION = "https://claude.ai/*";

const ORIGIN = "https://claude.ai";
const HOST = "claude.ai";
const API_BASE = `${ORIGIN}/api`;

const LIMIT_LABELS = {
  session: "5 hours",
  weekly_all: "Weekly",
  weekly_scoped: "Weekly",
};

const LEGACY_WINDOW_LABELS = {
  five_hour: "5 hours",
  seven_day: "Weekly",
  seven_day_opus: "Weekly (Opus)",
  seven_day_sonnet: "Weekly (Sonnet)",
  seven_day_oauth_apps: "Weekly (apps)",
  seven_day_cowork: "Weekly (Cowork)",
};

function isSessionCookie(name) {
  return name === "sessionKey";
}

function getJson(path, store) {
  return fetchJson(`${API_BASE}${path}`, storeRequestOptions(store, HOST));
}

async function fetchOrganizations(store) {
  const organizations = await getJson("/organizations", store);

  if (!Array.isArray(organizations)) {
    throw new UsageError("error", "Unexpected organization list from claude.ai.");
  }

  const usable = organizations
    .filter((organization) => organization?.uuid)
    .filter((organization) => organization?.capabilities?.includes("chat"))
    .map((organization) => ({
      id: storeAccountId(store, organization.uuid),
      organizationId: organization.uuid,
      name: organization.name ?? "Claude",
      type: organization.raven_type ?? null,
      container: store.name,
    }));

  if (usable.length === 0) {
    throw new UsageError("signed-out", "No Claude organization found.");
  }

  return usable;
}

function limitLabel(limit) {
  const base = LIMIT_LABELS[limit.kind] ?? humanize(limit.kind ?? "limit");
  const scope = limit.scope?.model?.display_name ?? limit.scope?.surface?.display_name;

  return scope ? `${base} · ${scope}` : base;
}

function fromLimits(limits) {
  if (!Array.isArray(limits)) {
    return [];
  }

  return limits
    .filter((limit) => typeof limit?.percent === "number")
    .map((limit, index) => ({
      id: `${limit.kind ?? "limit"}-${index}`,
      label: limitLabel(limit),
      percent: clampPercent(limit.percent),
      resetsAt: limit.resets_at ?? null,
      severity: limit.severity ?? "normal",
    }));
}

function fromLegacyWindows(payload) {
  return Object.entries(payload)
    .filter(([key]) => key in LEGACY_WINDOW_LABELS)
    .filter(([, value]) => typeof value?.utilization === "number")
    .map(([key, value]) => ({
      id: key,
      label: LEGACY_WINDOW_LABELS[key],
      percent: clampPercent(value.utilization),
      resetsAt: value.resets_at ?? null,
      severity: "normal",
    }));
}

function formatMoney(amount) {
  if (!amount || typeof amount.amount_minor !== "number") {
    return null;
  }

  const exponent = typeof amount.exponent === "number" ? amount.exponent : 2;
  const currency = amount.currency ?? "USD";

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      amount.amount_minor / 10 ** exponent,
    );
  } catch {
    return `${(amount.amount_minor / 10 ** exponent).toFixed(exponent)} ${currency}`;
  }
}

function toSpend(spend) {
  if (!spend?.enabled) {
    return null;
  }

  const used = formatMoney(spend.used);

  if (!used) {
    return null;
  }

  const limit = formatMoney(spend.limit);

  return {
    label: "Extra usage",
    text: limit ? `${used} of ${limit}` : used,
    percent: typeof spend.percent === "number" ? clampPercent(spend.percent) : null,
    severity: spend.severity ?? "normal",
  };
}

async function fetchOrganizationUsage(store, organizationId, account) {
  try {
    const payload = await getJson(`/organizations/${organizationId}/usage`, store);

    if (!payload || typeof payload !== "object") {
      throw new UsageError("error", "Unexpected usage response from claude.ai.");
    }

    const limits = fromLimits(payload.limits);
    const usageLimits = limits.length > 0 ? limits : fromLegacyWindows(payload);

    if (usageLimits.length === 0) {
      return { ...account, state: "empty", message: "No usage reported." };
    }

    return {
      ...account,
      state: "ok",
      limits: usageLimits,
      spend: toSpend(payload.spend),
    };
  } catch (error) {
    return { ...account, ...toErrorState(error) };
  }
}

async function fetchStoreAccounts(store, settings, providerId) {
  const organizations = await fetchOrganizations(store);

  return Promise.all(
    organizations.map(({ organizationId, ...account }) =>
      isAccountEnabled(settings, providerId, account.id)
        ? fetchOrganizationUsage(store, organizationId, account)
        : { ...account, state: "disabled", message: "Hidden in settings." },
    ),
  );
}

export async function fetchClaudeUsage() {
  const provider = {
    id: "claude",
    name: "Claude",
    hostPermission: CLAUDE_HOST_PERMISSION,
  };

  if (!(await hasHostPermission(CLAUDE_HOST_PERMISSION))) {
    return {
      ...provider,
      state: "needs-permission",
      message: "Grant access to claude.ai to read usage.",
    };
  }

  try {
    const [settings, stores] = await Promise.all([
      getProviderSettings(),
      listStores(ORIGIN, isSessionCookie),
    ]);
    const accounts = await collectStoreAccounts(
      stores,
      (store) => fetchStoreAccounts(store, settings, provider.id),
      provider.name,
    );

    return {
      ...provider,
      state: "ok",
      accounts,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    return { ...provider, ...toErrorState(error) };
  }
}
