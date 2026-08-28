import {
  UsageError,
  clampPercent,
  fetchJson,
  hasHostPermission,
  humanize,
  severityFor,
  toErrorState,
} from "./shared.js";

export const OPENAI_HOST_PERMISSION = "https://chatgpt.com/*";

const ORIGIN = "https://chatgpt.com";
const SIGNED_OUT = "Sign in to chatgpt.com first.";

const WINDOW_LABELS = {
  primary: "Session",
  secondary: "Weekly",
};

const RATE_LIMIT_SOURCES = [
  { key: "rate_limit", fallback: "Rate limit" },
  { key: "code_review_rate_limit", prefix: "Code review" },
  { key: "additional_rate_limits", fallback: "Rate limit" },
  { key: "rate_limits", fallback: "Rate limit" },
  { key: "limits", fallback: "Rate limit" },
];

const PERCENT_KEYS = ["used_percent", "utilization", "percent", "percent_used"];
const RESET_AT_KEYS = ["resets_at", "reset_at"];
const RESET_SECONDS_KEYS = ["reset_after_seconds", "resets_in_seconds", "seconds_until_reset"];
const WINDOW_MINUTES_KEYS = ["window_minutes", "window_size_minutes", "window_duration_minutes"];

function firstNumber(source, keys) {
  for (const key of keys) {
    if (typeof source?.[key] === "number") {
      return source[key];
    }
  }

  return null;
}

function toNumber(value) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function describeWindow(minutes) {
  if (minutes === null) {
    return null;
  }

  if (minutes % 10080 === 0) {
    const weeks = minutes / 10080;
    return weeks === 1 ? "Weekly" : `${weeks}-week`;
  }

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "Daily" : `${days}-day`;
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60}-hour`;
  }

  return `${minutes}-minute`;
}

function toResetsAt(source) {
  for (const key of RESET_AT_KEYS) {
    const value = source?.[key];

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number") {
      return new Date(value < 1e12 ? value * 1000 : value).toISOString();
    }
  }

  const seconds = firstNumber(source, RESET_SECONDS_KEYS);

  return seconds === null ? null : new Date(Date.now() + seconds * 1000).toISOString();
}

function toEntries(container) {
  if (Array.isArray(container)) {
    return container.map((value, index) => [
      value?.name ?? value?.kind ?? value?.id ?? String(index),
      value,
    ]);
  }

  if (container && typeof container === "object") {
    return Object.entries(container);
  }

  return [];
}

function percentOf(source) {
  const used = firstNumber(source, PERCENT_KEYS);

  if (used !== null) {
    return clampPercent(used);
  }

  const remaining = firstNumber(source, ["remaining_percent"]);

  return remaining === null ? null : clampPercent(100 - remaining);
}

function composeLabel({ windowLabel, labelKey, fallback, prefix }) {
  const base = windowLabel ?? WINDOW_LABELS[labelKey] ?? null;

  if (prefix) {
    return base ? `${prefix} · ${base}` : prefix;
  }

  return base ?? fallback ?? humanize(String(labelKey));
}

function toLimit({ id, labelKey, value, fallback, prefix }) {
  const percent = percentOf(value);

  if (percent === null) {
    return null;
  }

  const windowLabel = describeWindow(firstNumber(value, WINDOW_MINUTES_KEYS));

  return {
    id,
    label: composeLabel({ windowLabel, labelKey, fallback, prefix }),
    percent,
    detail: null,
    resetsAt: toResetsAt(value),
    severity: value.severity ?? severityFor(percent),
  };
}

function collectRateLimits(payload) {
  const limits = [];

  for (const { key, fallback, prefix } of RATE_LIMIT_SOURCES) {
    const source = payload?.[key];

    if (!source || typeof source !== "object") {
      continue;
    }

    const direct = toLimit({ id: key, labelKey: key, value: source, fallback, prefix });

    if (direct) {
      limits.push(direct);
      continue;
    }

    for (const [childKey, childValue] of toEntries(source)) {
      const limit = toLimit({
        id: `${key}-${childKey}`,
        labelKey: childKey,
        value: childValue,
        fallback,
        prefix,
      });

      if (limit) {
        limits.push(limit);
      }
    }
  }

  return limits;
}

function formatCredits(value) {
  const amount = toNumber(value);

  if (amount === null) {
    return null;
  }

  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
}

function collectSpendLimits(spendControl) {
  if (!spendControl || typeof spendControl !== "object") {
    return [];
  }

  const reached = Boolean(spendControl.reached);

  return Object.entries(spendControl)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]) => {
      const percent = percentOf(value);

      if (percent === null) {
        return null;
      }

      const used = formatCredits(value.used);
      const limit = formatCredits(value.limit);

      return {
        id: `credits-${key}`,
        label: key === "individual_limit" ? "Credits" : humanize(key),
        percent,
        detail: used && limit ? `${used} of ${limit} credits` : used && `${used} credits`,
        resetsAt: toResetsAt(value),
        severity: reached ? "critical" : severityFor(percent),
      };
    })
    .filter(Boolean);
}

function planOf(payload, user) {
  const plan =
    payload?.plan_type ?? payload?.plan ?? payload?.account_plan ?? user?.plan_type ?? null;

  return typeof plan === "string" ? plan.toLowerCase() : null;
}

async function fetchSession() {
  const session = await fetchJson(`${ORIGIN}/api/auth/session`, {
    signedOutMessage: SIGNED_OUT,
  });

  if (!session?.accessToken) {
    throw new UsageError("signed-out", SIGNED_OUT);
  }

  return session;
}

export async function fetchOpenAiUsage() {
  const provider = {
    id: "openai",
    name: "ChatGPT",
    hostPermission: OPENAI_HOST_PERMISSION,
  };

  if (!(await hasHostPermission(OPENAI_HOST_PERMISSION))) {
    return {
      ...provider,
      state: "needs-permission",
      message: "Grant access to chatgpt.com to read usage.",
    };
  }

  try {
    const session = await fetchSession();
    const payload = await fetchJson(`${ORIGIN}/backend-api/wham/usage`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signedOutMessage: SIGNED_OUT,
    });

    const limits = [...collectRateLimits(payload), ...collectSpendLimits(payload?.spend_control)];
    const account = {
      id: payload?.account_id ?? "chatgpt",
      name: payload?.email ?? session.user?.email ?? "ChatGPT",
      type: planOf(payload, session.user),
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
