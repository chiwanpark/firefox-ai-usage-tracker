import { getOpenRouterSettings } from "../settings.js";
import {
  UsageError,
  clampPercent,
  fetchJson,
  formatUsd,
  hasHostPermission,
  humanize,
  severityFor,
  toErrorState,
} from "./shared.js";

export const OPENROUTER_HOST_PERMISSION = "https://openrouter.ai/*";

const API_BASE = "https://openrouter.ai/api/v1";
const INVALID_KEY = "OpenRouter rejected the API key. Check it in settings.";

const PERIODS = [
  { id: "daily", label: "Today", field: "usage_daily" },
  { id: "weekly", label: "This week", field: "usage_weekly" },
  { id: "monthly", label: "This month", field: "usage_monthly" },
];

const RESET_FIELDS = {
  daily: "usage_daily",
  weekly: "usage_weekly",
  monthly: "usage_monthly",
};

function numberOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getJson(path, apiKey) {
  return fetchJson(`${API_BASE}${path}`, {
    credentials: "omit",
    authState: "needs-config",
    signedOutMessage: INVALID_KEY,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function fetchKey(apiKey) {
  const payload = await getJson("/key", apiKey);

  if (!payload?.data || typeof payload.data !== "object") {
    throw new UsageError("error", "Unexpected key response from openrouter.ai.");
  }

  return payload.data;
}

async function fetchCredits(apiKey) {
  try {
    const payload = await getJson("/credits", apiKey);
    const total = numberOf(payload?.data?.total_credits);
    const used = numberOf(payload?.data?.total_usage);

    return total === null || used === null ? null : { total, used };
  } catch {
    return null;
  }
}

function toDetailLimit(id, label, detail) {
  return { id, label, percent: null, detail, resetsAt: null, severity: "normal" };
}

function toBarLimit(id, label, used, limit) {
  const percent = clampPercent((used / limit) * 100);

  return {
    id,
    label,
    percent,
    detail: `${formatUsd(used)} of ${formatUsd(limit)}`,
    resetsAt: null,
    severity: severityFor(percent),
  };
}

function toCreditsLimits(credits) {
  if (!credits) {
    return [];
  }

  if (credits.total <= 0) {
    if (credits.used <= 0) {
      return [];
    }

    return [toDetailLimit("credits", "Credits used", formatUsd(credits.used))];
  }

  const limit = toBarLimit("credits", "Credits", credits.used, credits.total);
  const balance = Math.max(0, credits.total - credits.used);

  return [{ ...limit, detail: `${formatUsd(balance)} left of ${formatUsd(credits.total)}` }];
}

function keyUsed(key, limit) {
  const remaining = numberOf(key.limit_remaining);

  if (remaining !== null) {
    return limit - Math.min(limit, Math.max(0, remaining));
  }

  return numberOf(key[RESET_FIELDS[key.limit_reset]]) ?? numberOf(key.usage);
}

function toKeyLimits(key) {
  const limit = numberOf(key.limit);

  if (limit === null || limit <= 0) {
    return [];
  }

  const used = keyUsed(key, limit);

  if (used === null) {
    return [];
  }

  const reset = typeof key.limit_reset === "string" ? key.limit_reset.trim() : "";
  const label = reset ? `Key limit · ${humanize(reset)}` : "Key limit";

  return [toBarLimit("key-limit", label, used, limit)];
}

function toPeriodLimits(key, covered) {
  return PERIODS.filter(({ field }) => field !== covered)
    .map(({ id, label, field }) => {
      const value = numberOf(key[field]);

      return value === null ? null : toDetailLimit(id, label, formatUsd(value));
    })
    .filter(Boolean);
}

export async function fetchOpenRouterUsage() {
  const provider = {
    id: "openrouter",
    name: "OpenRouter",
    hostPermission: OPENROUTER_HOST_PERMISSION,
  };

  const settings = await getOpenRouterSettings();

  if (!settings.apiKey) {
    return {
      ...provider,
      state: "needs-config",
      message: "Add an OpenRouter API key in settings.",
    };
  }

  if (!(await hasHostPermission(OPENROUTER_HOST_PERMISSION))) {
    return {
      ...provider,
      state: "needs-permission",
      message: "Grant access to openrouter.ai to read usage.",
    };
  }

  try {
    const [key, credits] = await Promise.all([
      fetchKey(settings.apiKey),
      fetchCredits(settings.apiKey),
    ]);
    const keyLimits = toKeyLimits(key);
    const covered = keyLimits.length > 0 ? RESET_FIELDS[key.limit_reset] : null;
    const limits = [
      ...toCreditsLimits(credits),
      ...keyLimits,
      ...toPeriodLimits(key, covered),
    ];
    const account = {
      id: "openrouter",
      name: key.label || "OpenRouter",
      type: key.is_free_tier ? "Free tier" : null,
    };

    if (limits.length === 0) {
      return {
        ...provider,
        state: "ok",
        accounts: [{ ...account, state: "empty", message: "No usage reported." }],
      };
    }

    return {
      ...provider,
      state: "ok",
      accounts: [{ ...account, state: "ok", limits, spend: null }],
      fetchedAt: Date.now(),
    };
  } catch (error) {
    return { ...provider, ...toErrorState(error) };
  }
}
