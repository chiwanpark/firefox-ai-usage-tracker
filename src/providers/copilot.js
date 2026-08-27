import { getCopilotSettings } from "../settings.js";
import {
  UsageError,
  clampPercent,
  fetchJson,
  hasHostPermission,
  severityFor,
  toErrorState,
} from "./shared.js";

export const COPILOT_HOST_PERMISSION = "https://api.github.com/*";

const API_BASE = "https://api.github.com";

export const COPILOT_PLANS = [
  { id: "copilot_free", label: "Copilot Free", allowance: 50 },
  { id: "copilot_pro", label: "Copilot Pro", allowance: 300 },
  { id: "copilot_pro_plus", label: "Copilot Pro+", allowance: 1500 },
  { id: "copilot_business", label: "Copilot Business", allowance: 300 },
  { id: "copilot_enterprise", label: "Copilot Enterprise", allowance: 1000 },
  { id: "custom", label: "Custom allowance", allowance: null },
  { id: "unknown", label: "Show count only", allowance: null },
];

const QUANTITY_KEYS = ["grossQuantity", "netQuantity", "quantity"];

const USAGE_REPORTS = [
  { path: "ai_credit", label: "AI credits", unit: "credits" },
  { path: "premium_request", label: "Premium requests", unit: "requests" },
];

const UNIT_TYPES = new Set(["ai-credit", "ai-credits", "credit", "credits", "request", "requests"]);

function allowanceFor(settings) {
  if (settings.plan === "unknown") {
    return null;
  }

  if (settings.plan === "custom") {
    const parsed = Number(settings.allowance);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return COPILOT_PLANS.find((plan) => plan.id === settings.plan)?.allowance ?? null;
}

function planLabel(settings) {
  return COPILOT_PLANS.find((plan) => plan.id === settings.plan)?.label ?? null;
}

function isAiUsage(item) {
  const unit = String(item?.unitType ?? "")
    .toLowerCase()
    .replace(/[\s_]/g, "-");

  if (UNIT_TYPES.has(unit)) {
    return true;
  }

  const sku = String(item?.sku ?? "").toLowerCase();

  return sku.includes("ai credit") || sku.includes("premium request");
}

function quantityOf(item) {
  for (const key of QUANTITY_KEYS) {
    if (typeof item?.[key] === "number") {
      return item[key];
    }
  }

  return 0;
}

function formatQuantity(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  } catch {
    return `${value.toFixed(2)} USD`;
  }
}

function nextResetAt() {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function toOverage(items) {
  const amount = items.reduce(
    (total, item) => total + (typeof item.netAmount === "number" ? item.netAmount : 0),
    0,
  );

  if (amount <= 0) {
    return null;
  }

  return { label: "Overage", text: formatMoney(amount), percent: null, severity: "warning" };
}

function toLimits(report, items, allowance) {
  const used = items.reduce((total, item) => total + quantityOf(item), 0);
  const base = {
    id: "ai-usage",
    label: report.label,
    resetsAt: nextResetAt(),
    isActive: false,
  };

  if (allowance === null) {
    return [
      {
        ...base,
        percent: null,
        detail: `${formatQuantity(used)} ${report.unit}`,
        severity: "normal",
      },
    ];
  }

  const percent = clampPercent((used / allowance) * 100);

  return [
    {
      ...base,
      percent,
      detail: `${formatQuantity(used)} of ${formatQuantity(allowance)} ${report.unit}`,
      severity: severityFor(percent),
    },
  ];
}

async function fetchUsageReport(settings, report) {
  const now = new Date();
  const query = new URLSearchParams({
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1),
  });
  const url =
    `${API_BASE}/users/${encodeURIComponent(settings.username)}` +
    `/settings/billing/${report.path}/usage?${query}`;

  const payload = await fetchJson(url, {
    credentials: "omit",
    authState: "needs-config",
    signedOutMessage: "GitHub rejected the token. It needs Plan: read access.",
    statusOverrides: {
      404: {
        state: "needs-config",
        message: "No usage report for this user. Check the username, or the account may not be on the enhanced billing platform.",
      },
    },
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${settings.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!Array.isArray(payload?.usageItems)) {
    throw new UsageError("error", "Unexpected billing response from GitHub.");
  }

  return payload.usageItems.filter(isAiUsage);
}

async function fetchUsage(settings) {
  let firstError = null;
  let fallback = null;

  for (const report of USAGE_REPORTS) {
    try {
      const items = await fetchUsageReport(settings, report);

      if (items.length > 0) {
        return { report, items };
      }

      fallback ??= { report, items };
    } catch (error) {
      firstError ??= error;
    }
  }

  if (fallback) {
    return fallback;
  }

  throw firstError ?? new UsageError("error", "No usage report available.");
}

export async function fetchCopilotUsage() {
  const provider = {
    id: "copilot",
    name: "GitHub Copilot",
    hostPermission: COPILOT_HOST_PERMISSION,
  };

  const settings = await getCopilotSettings();

  if (!settings.token || !settings.username) {
    return {
      ...provider,
      state: "needs-config",
      message: "Add a GitHub token and username in settings.",
    };
  }

  if (!(await hasHostPermission(COPILOT_HOST_PERMISSION))) {
    return {
      ...provider,
      state: "needs-permission",
      message: "Grant access to api.github.com to read usage.",
    };
  }

  try {
    const { report, items } = await fetchUsage(settings);
    const account = {
      id: settings.username,
      name: settings.username,
      type: planLabel(settings),
    };

    return {
      ...provider,
      state: "ok",
      accounts: [
        {
          ...account,
          state: "ok",
          limits: toLimits(report, items, allowanceFor(settings)),
          spend: toOverage(items),
        },
      ],
      fetchedAt: Date.now(),
    };
  } catch (error) {
    return { ...provider, ...toErrorState(error) };
  }
}
